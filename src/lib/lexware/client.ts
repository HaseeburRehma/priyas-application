import "server-only";



export type LexwareConfig = {
  baseUrl: string;
  apiKey: string;
};

export function getLexwareConfig(): LexwareConfig | null {
  const baseUrl = process.env.LEXWARE_BASE_URL?.trim();
  const apiKey = process.env.LEXWARE_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export class LexwareError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "LexwareError";
  }
}

/** Issue an authenticated request. Throws LexwareError on non-2xx. */
async function request<T>(
  cfg: LexwareConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  // 15 s timeout. Without this an unresponsive Lexware backend stalls
  // the server action indefinitely (no app-level limit on action runtime).
  // AbortSignal.timeout returns a signal that auto-aborts on the deadline.
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // The standard surfaces a TimeoutError (DOMException) for the timeout
    // path on modern Node; older runtimes raise AbortError. Match either
    // so the caller gets a clearer message than a generic fetch failure.
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" ||
        err.name === "TimeoutError" ||
        (typeof err.message === "string" && /aborted|timeout/i.test(err.message)));
    if (isAbort) {
      throw new LexwareError(
        `Lexware ${init.method ?? "GET"} ${path} → timeout after 15s`,
        504,
      );
    }
    throw err;
  }
  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    throw new LexwareError(
      `Lexware ${init.method ?? "GET"} ${path} → ${res.status}`,
      res.status,
      parsed,
    );
  }
  return parsed as T;
}

/* ---------------------------------------------------------------------------
 * Contacts (clients)
 * ------------------------------------------------------------------------- */

export type LexwareContact = {
  id: string;
  version: number;
  roles: { customer?: { number?: number } };
  company?: { name: string; vatRegistrationId?: string };
  person?: { firstName?: string; lastName: string };
  emailAddresses?: { business?: string[] };
  phoneNumbers?: { business?: string[] };
};

export async function lexwareUpsertContact(
  cfg: LexwareConfig,
  client: {
    display_name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    tax_id: string | null;
    customer_type: "residential" | "commercial" | "alltagshilfe";
    existing_id?: string;
  },
): Promise<LexwareContact> {
  const body = {
    version: 0,
    roles: { customer: {} },
    ...(client.customer_type === "residential" ||
      client.customer_type === "alltagshilfe"
      ? {
        person: {
          firstName: (client.contact_name ?? "").split(" ")[0] ?? "",
          lastName:
            (client.contact_name ?? client.display_name)
              .split(" ")
              .slice(-1)[0] ?? client.display_name,
        },
      }
      : {
        company: {
          name: client.display_name,
          ...(client.tax_id ? { vatRegistrationId: client.tax_id } : {}),
        },
      }),
    ...(client.email
      ? { emailAddresses: { business: [client.email] } }
      : {}),
    ...(client.phone
      ? { phoneNumbers: { business: [client.phone] } }
      : {}),
  };

  if (client.existing_id) {
    return request<LexwareContact>(
      cfg,
      `/v1/contacts/${client.existing_id}`,
      { method: "PUT", body: JSON.stringify(body) },
    );
  }
  return request<LexwareContact>(cfg, `/v1/contacts`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/* ---------------------------------------------------------------------------
 * Invoices
 * ------------------------------------------------------------------------- */

export type LexwareInvoice = {
  id: string;
  resourceUri: string;
  createdDate: string;
  voucherNumber?: string;
};

export type LexwareInvoiceLineItem = {
  type: "service";
  name: string;
  quantity: number;
  unitName: string;
  unitPrice: { currency: "EUR"; netAmount: number; taxRatePercentage: number };
};

export async function lexwareCreateInvoice(
  cfg: LexwareConfig,
  args: {
    contactId: string;
    invoiceNumber: string;
    issueDate: string; // ISO date
    dueDate: string | null;
    items: LexwareInvoiceLineItem[];
    notes: string | null;
  },
): Promise<LexwareInvoice> {
  const body = {
    archived: false,
    voucherDate: args.issueDate,
    address: { contactId: args.contactId },
    lineItems: args.items,
    totalPrice: { currency: "EUR" },
    taxConditions: { taxType: "net" },
    paymentConditions: args.dueDate
      ? {
        paymentTerm: { duration: 14 },
        paymentTermLabel: "14 days",
      }
      : undefined,
    introduction: args.notes ?? "",
    remark: `Internal: ${args.invoiceNumber}`,
  };
  return request<LexwareInvoice>(cfg, `/v1/invoices`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/* ===========================================================================
 * Payment poll: list invoices Lexware considers paid since a cursor.
 *
 * Used by the nightly /api/jobs/lexware-payments-sync cron to mirror
 * Lexware's reconciliation back into our DB. The accountant marks an
 * invoice paid in Lexware (manually, or by importing a bank statement);
 * the cron flips our `invoice_payments` + `invoices.status` to match.
 * ========================================================================= */

export type LexwarePaidVoucher = {
  /** Lexware's own invoice id — globally unique across all orgs. */
  voucherId: string;
  /** Human-readable invoice number (matches what we pushed up). */
  voucherNumber: string;
  /** Contact id on Lexware's side; we already cache this on clients. */
  contactId: string | null;
  /** Cents (rounded). Lexware returns EUR with 2 decimals. */
  totalCents: number;
  /** When Lexware records the payment as cleared. ISO 8601. */
  paidAt: string;
  /** Optional, useful for the audit log entry. */
  paymentMethod: string | null;
};

/**
 * Fetch every voucher Lexware marks as fully paid that was paid since
 * `sinceIso`. The result is paginated; we follow links until exhausted
 * because the per-page cap is 250 and we want a definitive delta per
 * run. Most orgs settle <50 invoices/day → one page in practice.
 */
export async function lexwareListPaidVouchers(
  cfg: LexwareConfig,
  sinceIso: string,
): Promise<LexwarePaidVoucher[]> {
  // Lexware Office's voucher list endpoint supports `voucherType=invoice`
  // and `voucherStatus=paid`. `paidDateFrom` is the server-side filter.
  // Page size 250 is Lexware's max.
  const out: LexwarePaidVoucher[] = [];
  let page = 0;
  const SIZE = 250;
  for (;;) {
    type Page = {
      content: Array<{
        id: string;
        voucherNumber: string;
        contactId?: string;
        totalAmount?: { netAmount?: number; grossAmount?: number };
        paidDate?: string;
        paymentMethod?: string;
      }>;
      last?: boolean;
    };
    const qs = new URLSearchParams({
      voucherType: "invoice",
      voucherStatus: "paid",
      paidDateFrom: sinceIso,
      page: String(page),
      size: String(SIZE),
    });
    const data = await request<Page>(cfg, `/v1/voucherlist?${qs.toString()}`);
    for (const row of data.content ?? []) {
      // Skip rows that have neither contact nor a paidDate — they
      // wouldn't help us reconcile and might be partial drafts.
      if (!row.paidDate) continue;
      // Lexware returns EUR amounts as decimals; convert to cents
      // without floating-point loss.
      const gross =
        row.totalAmount?.grossAmount ?? row.totalAmount?.netAmount ?? 0;
      const cents = Math.round(gross * 100);
      out.push({
        voucherId: row.id,
        voucherNumber: row.voucherNumber ?? "",
        contactId: row.contactId ?? null,
        totalCents: cents,
        paidAt: row.paidDate,
        paymentMethod: row.paymentMethod ?? null,
      });
    }
    if (data.last !== false) break;
    page += 1;
    // Safety cap: if Lexware ever loops (which they shouldn't), don't
    // run the action forever.
    if (page > 40) break;
  }
  return out;
}

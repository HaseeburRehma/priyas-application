import "server-only";

export type LexwareConfig = {
  baseUrl: string;
  apiKey: string;
};

export function getLexwareConfig(): LexwareConfig | null {
  // Accept both the canonical names (LEXWARE_BASE_URL / LEXWARE_API_KEY)
  // and the more verbose names used in some deployment manifests
  // (LEXWARE_API_BASE_URL / LEXWARE_API_TOKEN). Picking the first one
  // that's set lets either naming convention work without changing
  // .env.local files in the wild.
  const baseUrl =
    process.env.LEXWARE_BASE_URL?.trim() ||
    process.env.LEXWARE_API_BASE_URL?.trim();
  const apiKey =
    process.env.LEXWARE_API_KEY?.trim() ||
    process.env.LEXWARE_API_TOKEN?.trim();
  if (!baseUrl || !apiKey) return null;
  // Every path below already includes its own "/v1/..." prefix, so a
  // base URL that also ends in "/v1" (an easy misconfiguration — the two
  // canonical env names don't make this obvious) would double up into
  // "/v1/v1/..." and 404 against the real API.
  const trimmed = baseUrl.replace(/\/$/, "").replace(/\/v1$/i, "");
  return { baseUrl: trimmed, apiKey };
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

/** Issue an authenticated request to Lexware Office REST API. Throws LexwareError on non-2xx. */
async function request<T>(
  cfg: LexwareConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
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
      // 15 s timeout — prevents stalled server actions on Lexware outages.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
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

/* ===========================================================================
 * Contacts  —  POST /v1/contacts · GET /v1/contacts/:id · PUT /v1/contacts/:id
 *              GET /v1/contacts?email=...
 * ========================================================================= */

export type LexwareContact = {
  id: string;
  /** Optimistic-concurrency version — REQUIRED on PUT. */
  version: number;
  roles: { customer?: { number?: number } };
  company?: { name: string; vatRegistrationId?: string };
  person?: { firstName?: string; lastName: string };
  emailAddresses?: { business?: string[] };
  phoneNumbers?: { business?: string[] };
  addresses?: { billing?: Array<{ street?: string; zip?: string; city?: string; countryCode: string }> };
};

/**
 * GET /v1/contacts/:id
 *
 * Fetches the full contact record including the current `version`.
 * Must be called before PUT to satisfy Lexware's optimistic concurrency control:
 * a PUT with a stale version returns 409 Conflict.
 */
export async function lexwareGetContact(
  cfg: LexwareConfig,
  id: string,
): Promise<LexwareContact> {
  return request<LexwareContact>(cfg, `/v1/contacts/${id}`);
}

/**
 * GET /v1/contacts?email=...&customer=true
 *
 * Searches for contacts matching an email address. Used to find an existing
 * Lexware contact before creating a duplicate. Returns the first match or null.
 *
 * Lexware's contact filter endpoint returns a paginated response; we only
 * need page 0 since email is unique per customer in practice.
 */
export async function lexwareSearchContactByEmail(
  cfg: LexwareConfig,
  email: string,
): Promise<LexwareContact | null> {
  type SearchPage = {
    content: LexwareContact[];
    totalElements?: number;
  };
  const qs = new URLSearchParams({
    email,
    customer: "true",
    page: "0",
    size: "5",
  });
  const data = await request<SearchPage>(cfg, `/v1/contacts?${qs.toString()}`);
  return data.content?.[0] ?? null;
}

/**
 * Create or update a Lexware contact.
 *
 * - If `existing_id` is provided: GET the contact to fetch its current `version`,
 *   then PUT with the correct version (avoids 409 Conflict from stale version).
 * - If no `existing_id` but an `email` is set: search for an existing contact
 *   by email first to avoid creating duplicates.
 * - Otherwise: POST to create a new contact.
 *
 * Returns the upserted contact (always contains `id` and `version`).
 */
export async function lexwareUpsertContact(
  cfg: LexwareConfig,
  client: {
    display_name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    tax_id: string | null;
    customer_type: "residential" | "commercial" | "alltagshilfe";
    address_line1: string | null;
    city: string | null;
    postal_code: string | null;
    country: string | null;
    existing_id?: string | null;
  },
): Promise<LexwareContact> {
  const isResidential =
    client.customer_type === "residential" ||
    client.customer_type === "alltagshilfe";

  const contactBody = (version: number) => ({
    version,
    roles: { customer: {} },
    ...(isResidential
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
    // Lexware refuses to attach an invoice to a contact with zero billing
    // addresses, so we forward whatever postal address the client record
    // has. Country defaults to Germany since this business only operates
    // domestically.
    ...(client.address_line1 || client.city || client.postal_code
      ? {
          addresses: {
            billing: [
              {
                ...(client.address_line1 ? { street: client.address_line1 } : {}),
                ...(client.postal_code ? { zip: client.postal_code } : {}),
                ...(client.city ? { city: client.city } : {}),
                countryCode: client.country ?? "DE",
              },
            ],
          },
        }
      : {}),
  });

  // — UPDATE path: must GET first to obtain the current version number.
  if (client.existing_id) {
    const current = await lexwareGetContact(cfg, client.existing_id);
    return request<LexwareContact>(
      cfg,
      `/v1/contacts/${client.existing_id}`,
      { method: "PUT", body: JSON.stringify(contactBody(current.version)) },
    );
  }

  // — DEDUP path: search by email before creating to avoid duplicates.
  if (client.email) {
    const found = await lexwareSearchContactByEmail(cfg, client.email);
    if (found) {
      // Update the found contact with our latest data.
      return request<LexwareContact>(
        cfg,
        `/v1/contacts/${found.id}`,
        { method: "PUT", body: JSON.stringify(contactBody(found.version)) },
      );
    }
  }

  // — CREATE path.
  return request<LexwareContact>(cfg, `/v1/contacts`, {
    method: "POST",
    body: JSON.stringify(contactBody(0)),
  });
}

/* ===========================================================================
 * Invoices  —  POST /v1/invoices · GET /v1/invoices/:id
 * ========================================================================= */

export type LexwareInvoiceStatus =
  | "draft"
  | "open"
  | "paid"
  | "voided"
  | "overdue"
  | "paidoff";

export type LexwareInvoice = {
  id: string;
  resourceUri: string;
  createdDate: string;
  updatedDate?: string;
  voucherNumber?: string;
  /** Lexware's lifecycle status for the voucher. */
  voucherStatus?: LexwareInvoiceStatus;
};

export type LexwareInvoiceLineItem = {
  // "service"/"material" line items must reference a real Lexware catalog
  // article (POST rejects them with "referenced entity does not exist"
  // otherwise); "custom" is the free-text line type our ad-hoc invoices need.
  type: "custom";
  name: string;
  quantity: number;
  unitName: string;
  unitPrice: { currency: "EUR"; netAmount: number; taxRatePercentage: number };
};

/**
 * POST /v1/invoices?finalize=true
 *
 * Creates a finalized (voucherStatus "open") invoice in Lexware. Without
 * `finalize=true` the voucher is created as an editable draft — it still
 * gets a voucherNumber, but it won't appear in Lexware's normal invoice
 * list/exports and could still be edited or discarded from their side.
 * Returns the created invoice including Lexware's own `voucherNumber`.
 */
export async function lexwareCreateInvoice(
  cfg: LexwareConfig,
  args: {
    contactId: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate: string | null;
    items: LexwareInvoiceLineItem[];
    notes: string | null;
  },
): Promise<LexwareInvoice> {
  // Lexware rejects a bare "YYYY-MM-DD" with "cannot be parsed" — it wants
  // a full ISO-8601 instant for both voucherDate and shippingDate.
  const voucherDate = `${args.issueDate}T00:00:00.000Z`;
  const body = {
    archived: false,
    voucherDate,
    address: { contactId: args.contactId },
    lineItems: args.items,
    totalPrice: { currency: "EUR" },
    taxConditions: { taxType: "net" },
    // Required — Lexware rejects invoices with "shipping conditions must
    // not be null" otherwise. We bill after the fact for a completed
    // period, so the shipping date is just the voucher date.
    shippingConditions: { shippingDate: voucherDate, shippingType: "service" },
    // Only include paymentConditions when a due date was supplied.
    ...(args.dueDate
      ? {
          paymentConditions: {
            paymentTermLabel: "14 Tage netto",
            paymentTermDuration: 14,
          },
        }
      : {}),
    introduction: args.notes ?? "",
    // Embed our internal invoice number so the bookkeeper can cross-reference.
    remark: `Interne Nr.: ${args.invoiceNumber}`,
  };
  return request<LexwareInvoice>(cfg, `/v1/invoices?finalize=true`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * GET /v1/invoices/:id
 *
 * Fetches a previously-created Lexware invoice by its Lexware ID.
 * Used to verify the `voucherStatus` after creation and in the UI's
 * "sync status" panel.
 */
export async function lexwareGetInvoice(
  cfg: LexwareConfig,
  lexwareId: string,
): Promise<LexwareInvoice> {
  return request<LexwareInvoice>(cfg, `/v1/invoices/${lexwareId}`);
}

/* ===========================================================================
 * Payment poll  —  GET /v1/voucherlist?voucherType=invoice&voucherStatus=paid
 *
 * Lexware Office does NOT expose a push-mark-paid endpoint. Payment
 * reconciliation is one-directional: Lexware → us. The bookkeeper marks
 * invoices paid in Lexware (manually or via bank-import), and the nightly
 * cron (`/api/jobs/lexware-payments-sync`) polls this endpoint to mirror
 * those payments into our `invoice_payments` table.
 * ========================================================================= */

export type LexwarePaidVoucher = {
  voucherId: string;
  voucherNumber: string;
  contactId: string | null;
  totalCents: number;
  paidAt: string;
  paymentMethod: string | null;
};

/**
 * GET /v1/voucherlist?voucherType=invoice&voucherStatus=paid&paidDateFrom=...
 *
 * Fetches all invoices Lexware has marked paid since `sinceIso`.
 * Follows pagination until `last=true` (max 40 pages / 10 000 records as
 * a safety cap against infinite loops on unexpected API responses).
 */
export async function lexwareListPaidVouchers(
  cfg: LexwareConfig,
  sinceIso: string,
): Promise<LexwarePaidVoucher[]> {
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
      if (!row.paidDate) continue;
      const gross =
        row.totalAmount?.grossAmount ?? row.totalAmount?.netAmount ?? 0;
      out.push({
        voucherId: row.id,
        voucherNumber: row.voucherNumber ?? "",
        contactId: row.contactId ?? null,
        totalCents: Math.round(gross * 100),
        paidAt: row.paidDate,
        paymentMethod: row.paymentMethod ?? null,
      });
    }

    // Stop when Lexware signals this is the last page. Treat absent `last`
    // as conservative stop (avoids infinite loop on malformed responses).
    if (data.last !== false) break;
    page += 1;
    if (page > 40) break;
  }

  return out;
}

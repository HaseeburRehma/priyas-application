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

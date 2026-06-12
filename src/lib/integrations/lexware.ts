import "server-only";
import {
  getLexwareConfig,
  lexwareCreateInvoice,
  lexwareGetInvoice,
  lexwareUpsertContact,
  LexwareError,
  type LexwareInvoiceLineItem,
} from "@/lib/lexware/client";

/**
 * Adapter facade between invoice actions and the Lexware Office REST client.
 * Falls back to a console-warning stub when LEXWARE_* env vars are absent,
 * keeping local dev working without credentials.
 */

export type AdapterInvoice = {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  customerEmail?: string | null;
  totalCents: number;
  pdfUrl?: string | null;
  client?: {
    display_name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    tax_id: string | null;
    customer_type: "residential" | "commercial" | "alltagshilfe";
    lexware_contact_id?: string | null;
  };
  items?: Array<{
    description: string;
    quantity: number;
    unit_price_cents: number;
    tax_rate_percent: number;
  }>;
};

export type PushResult = {
  /** Lexware voucher ID stored as `invoices.lexware_id`. */
  id: string;
  /** Lexware contact ID stored back on `clients.lexware_contact_id`. */
  contactId?: string;
  /** Lexware's own human-readable voucher number (e.g. RE-0001). */
  voucherNumber?: string;
};

export interface LexwareClient {
  pushInvoice(invoice: AdapterInvoice): Promise<PushResult>;
}

class StubLexwareClient implements LexwareClient {
  async pushInvoice(invoice: AdapterInvoice): Promise<PushResult> {
    // eslint-disable-next-line no-console
    console.warn("[lexware-stub] would push invoice", invoice.invoiceNumber);
    return { id: `stub_${invoice.invoiceNumber}` };
  }
}

class RealLexwareClient implements LexwareClient {
  async pushInvoice(invoice: AdapterInvoice): Promise<PushResult> {
    const cfg = getLexwareConfig();
    if (!cfg) throw new Error("Lexware not configured");

    // 1) Resolve / upsert the contact.
    //    lexwareUpsertContact handles:
    //      • existing_id present  → GET version, then PUT (avoids 409)
    //      • email present        → search for existing contact first (dedup)
    //      • neither              → POST create
    let contactId: string | undefined = invoice.client?.lexware_contact_id ?? undefined;

    if (invoice.client) {
      const contact = await lexwareUpsertContact(cfg, {
        display_name: invoice.client.display_name,
        contact_name: invoice.client.contact_name,
        email: invoice.client.email,
        phone: invoice.client.phone,
        tax_id: invoice.client.tax_id,
        customer_type: invoice.client.customer_type,
        existing_id: contactId ?? null,
      });
      contactId = contact.id;
    }

    if (!contactId) throw new Error("Missing Lexware contact ID after upsert");

    // 2) Build line items.
    const items: LexwareInvoiceLineItem[] = invoice.items?.length
      ? invoice.items.map((it) => ({
          type: "service" as const,
          name: it.description,
          quantity: it.quantity,
          unitName: "Std.",
          unitPrice: {
            currency: "EUR" as const,
            netAmount: it.unit_price_cents / 100,
            taxRatePercentage: it.tax_rate_percent,
          },
        }))
      : [
          {
            type: "service" as const,
            name: invoice.notes ?? "Reinigungsdienstleistung",
            quantity: 1,
            unitName: "Pausch.",
            unitPrice: {
              currency: "EUR" as const,
              netAmount: invoice.totalCents / 100,
              taxRatePercentage: 19,
            },
          },
        ];

    // 3) Create the invoice in Lexware.
    const created = await lexwareCreateInvoice(cfg, {
      contactId,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      items,
      notes: invoice.notes,
    });

    // 4) Verify the invoice was accepted and is not in draft/error state.
    //    lexwareGetInvoice throws LexwareError on non-2xx, so if the
    //    voucher was rejected we surface that to the caller rather than
    //    silently storing a broken lexware_id.
    const verified = await lexwareGetInvoice(cfg, created.id);

    return {
      id: verified.id,
      contactId,
      voucherNumber: verified.voucherNumber,
    };
  }
}

/** Returns the real client when LEXWARE_* env vars are set, the stub otherwise. */
export function createLexwareClient(): LexwareClient {
  const cfg = getLexwareConfig();
  if (cfg) return new RealLexwareClient();
  return new StubLexwareClient();
}

export { LexwareError };

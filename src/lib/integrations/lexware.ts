import "server-only";
import {
  getLexwareConfig,
  lexwareCreateInvoice,
  lexwareUpsertContact,
  LexwareError,
  type LexwareInvoiceLineItem,
} from "@/lib/lexware/client";

/**
 * Adapter facade between our `invoices.ts` action and the underlying
 * Lexware Office REST client. Falls back to a stub when the env isn't
 * configured, so local dev keeps working without credentials.
 */

export type AdapterInvoice = {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  customerEmail?: string | null;
  totalCents: number;
  pdfUrl?: string | null;
  // Optional richer payload — if provided, we use it verbatim. If absent,
  // we fall back to a single line item with the total amount.
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

export interface LexwareClient {
  pushInvoice(invoice: AdapterInvoice): Promise<{ id: string }>;
  markPaid(externalId: string, paidAt: Date): Promise<void>;
}

class StubLexwareClient implements LexwareClient {
  async pushInvoice(invoice: AdapterInvoice) {
    // eslint-disable-next-line no-console
    console.warn("[lexware-stub] would push invoice", invoice.invoiceNumber);
    return { id: `stub_${invoice.invoiceNumber}` };
  }
  async markPaid(externalId: string, paidAt: Date) {
    // eslint-disable-next-line no-console
    console.warn("[lexware-stub] would mark paid", externalId, paidAt);
  }
}

class RealLexwareClient implements LexwareClient {
  async pushInvoice(invoice: AdapterInvoice) {
    const cfg = getLexwareConfig();
    if (!cfg) throw new Error("Lexware not configured");

    // 1) Resolve / upsert the contact.
    let contactId = invoice.client?.lexware_contact_id ?? undefined;
    if (invoice.client) {
      const contact = await lexwareUpsertContact(cfg, {
        ...invoice.client,
        existing_id: contactId,
      });
      contactId = contact.id;
    }
    if (!contactId) throw new Error("Missing Lexware contact");

    // 2) Build line items.
    const items: LexwareInvoiceLineItem[] = invoice.items?.length
      ? invoice.items.map((it) => ({
          type: "service" as const,
          name: it.description,
          quantity: it.quantity,
          unitName: "Stk.",
          unitPrice: {
            currency: "EUR" as const,
            netAmount: it.unit_price_cents / 100,
            taxRatePercentage: it.tax_rate_percent,
          },
        }))
      : [
          {
            type: "service" as const,
            name: invoice.notes ?? "Cleaning service",
            quantity: 1,
            unitName: "Stk.",
            unitPrice: {
              currency: "EUR" as const,
              netAmount: invoice.totalCents / 100,
              taxRatePercentage: 19,
            },
          },
        ];

    const created = await lexwareCreateInvoice(cfg, {
      contactId,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      items,
      notes: invoice.notes,
    });
    return { id: created.id, contactId };
  }

  async markPaid(externalId: string, paidAt: Date) {
    const cfg = getLexwareConfig();
    if (!cfg) return;
    // Lexware Office's "down-payment" endpoint requires bank-side info
    // we don't have here — for v1 we just log + leave the invoice in
    // "open" until the bookkeeper clears it on the Lexware side.
    // eslint-disable-next-line no-console
    console.info(
      `[lexware] mark-paid for ${externalId} at ${paidAt.toISOString()} — recorded internally only.`,
    );
  }
}

/** Returns the real client when LEXWARE_* env vars are present, the stub otherwise. */
export function createLexwareClient(): LexwareClient {
  const cfg = getLexwareConfig();
  if (cfg) return new RealLexwareClient();
  return new StubLexwareClient();
}

export { LexwareError };

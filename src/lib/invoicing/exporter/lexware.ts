/**
 * Lexware exporter — wraps the existing Lexware Office adapter behind the
 * generic exporter interface. The actual HTTP work lives in
 * `@/lib/integrations/lexware`; this file just translates DTOs.
 */
import "server-only";
import { createLexwareClient } from "@/lib/integrations/lexware";
import type {
  ExportResult,
  ExportableInvoice,
  InvoiceExporter,
  ExporterId,
} from "./types";

export class LexwareExporter implements InvoiceExporter {
  readonly id: ExporterId = "lexware";

  async push(invoice: ExportableInvoice): Promise<ExportResult> {
    const lex = createLexwareClient();
    try {
      const result = await lex.pushInvoice({
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        notes: invoice.notes,
        customerEmail: invoice.client.email,
        totalCents: invoice.totalCents,
        pdfUrl: invoice.pdfPath,
        client: {
          display_name: invoice.client.displayName,
          contact_name: invoice.client.contactName,
          email: invoice.client.email,
          phone: invoice.client.phone,
          tax_id: invoice.client.taxId,
          customer_type: invoice.client.customerType,
          lexware_contact_id: invoice.client.lexwareContactId,
        },
        items: invoice.items.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unit_price_cents: it.unitPriceCents,
          tax_rate_percent: it.taxRatePercent,
        })),
      });
      const contactId = (result as unknown as { contactId?: string }).contactId;
      return {
        ok: true,
        foreignId: result.id,
        contactId,
        message: "lexware",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "lexware_push_failed";
      // Treat 4xx (status < 500) as non-retryable. Anything else, retry later.
      const status = (err as { status?: number } | undefined)?.status ?? 500;
      return { ok: false, error: message, retryable: status >= 500 };
    }
  }
}

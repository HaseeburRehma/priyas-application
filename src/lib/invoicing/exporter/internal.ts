/**
 * Internal exporter — a no-op that just confirms the invoice was generated
 * inside our system. It exists so calling code can always go through the
 * same interface regardless of where the invoice ends up.
 */
import type {
  ExportResult,
  ExportableInvoice,
  InvoiceExporter,
  ExporterId,
} from "./types";

export class InternalExporter implements InvoiceExporter {
  readonly id: ExporterId = "internal";

  async push(invoice: ExportableInvoice): Promise<ExportResult> {
    // The invoice already lives in our DB. Echo back its id so callers can
    // treat it uniformly with foreign systems.
    return { ok: true, foreignId: invoice.invoiceId, message: "in_app" };
  }
}

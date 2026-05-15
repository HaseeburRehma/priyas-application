/**
 * Exporter abstraction. An "exporter" pushes an issued invoice somewhere
 * external (or just records it internally). Adding a new target (Lexware,
 * DATEV, sevDesk, …) means adding one class implementing `InvoiceExporter`
 * — invoice generation and PDF rendering stay unchanged.
 */
import type { InvoiceKind } from "@/lib/billing/types";

export type ExporterId = "internal" | "lexware";

export type ExportableLineItem = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRatePercent: number;
};

export type ExportableInvoice = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceKind: InvoiceKind;
  issueDate: string; // YYYY-MM-DD
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  totalCents: number;
  subtotalCents: number;
  taxCents: number;
  notes: string | null;
  pdfPath: string | null;
  client: {
    id: string;
    displayName: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    taxId: string | null;
    customerType: "residential" | "commercial" | "alltagshilfe";
    insuranceProvider: string | null;
    insuranceNumber: string | null;
    serviceCode: string | null;
    lexwareContactId: string | null;
  };
  items: ExportableLineItem[];
};

export type ExportResult =
  | {
      ok: true;
      /** Foreign id (e.g. Lexware voucher id) or our own invoice id. */
      foreignId: string;
      /** Optional foreign contact id to persist back onto the client. */
      contactId?: string;
      message?: string;
    }
  | { ok: false; error: string; retryable: boolean };

export interface InvoiceExporter {
  readonly id: ExporterId;
  /** Push the invoice to the target system. Idempotent on `invoiceNumber`. */
  push(invoice: ExportableInvoice): Promise<ExportResult>;
}

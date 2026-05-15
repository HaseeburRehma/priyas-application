/**
 * Billing-domain types. Pure data — no I/O.
 *
 * All money is stored as integer cents (EUR). All durations are integer
 * minutes. Never use floats for money or hours in this module.
 */

export type InvoiceKind = "regular" | "alltagshilfe";

export type ExportTarget = "internal" | "lexware";

/**
 * Default VAT rate applied to regular customer invoices in Germany
 * (Mehrwertsteuer/USt). Alltagshilfe is VAT-exempt under § 4 Nr. 16 UStG.
 */
export const VAT_RATE_REGULAR_PERCENT = 19;
export const VAT_RATE_ALLTAGSHILFE_PERCENT = 0;

/**
 * System-wide fallback when neither the assignment nor the client define a
 * rate. Spec default: €35/h.
 */
export const DEFAULT_HOURLY_RATE_CENTS = 3500;

/**
 * Default annual Alltagshilfe budget. €1,575 per § 45b SGB XI
 * (Entlastungsbetrag).
 */
export const DEFAULT_ALLTAGSHILFE_ANNUAL_BUDGET_CENTS = 157500;

/** Invoice-number prefixes per customer type. */
export const INVOICE_NUMBER_PREFIX: Record<InvoiceKind, string> = {
  regular: "RE",
  alltagshilfe: "AH",
};

/** A single planned-vs-actual line for one staff member on one assignment. */
export type StaffBillingLine = {
  employeeId: string;
  employeeName: string;
  plannedMinutes: number;
  actualMinutes: number;
  /** Effective rate (cents/hour) used to compute amount. */
  rateCents: number;
  /** Amount = actualMinutes/60 × rateCents (rounded to nearest cent). */
  amountCents: number;
};

/** A draft invoice line item, pre-persistence. */
export type DraftLineItem = {
  description: string;
  /** Quantity in the unit implied by the description (hours, units). */
  quantity: number;
  unitPriceCents: number;
  taxRatePercent: number;
  position: number;
  /** Source shift, if any. */
  shiftId: string | null;
  /** Source assignment, if any. */
  assignmentId: string | null;
};

export type DraftInvoiceTotals = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export type DraftInvoice = {
  clientId: string;
  invoiceKind: InvoiceKind;
  periodStart: string; // ISO date (YYYY-MM-DD)
  periodEnd: string;
  items: DraftLineItem[];
  totals: DraftInvoiceTotals;
  notes: string | null;
};

/** Aggregated breakdown for an assignment summary row. */
export type AssignmentBreakdown = {
  assignmentId: string;
  propertyName: string;
  plannedHours: number;
  actualHours: number;
  rateCents: number;
  plannedAmountCents: number;
  actualAmountCents: number;
  varianceMinutes: number;
  staff: StaffBillingLine[];
};

/**
 * Aging buckets used in receivables reporting. Boundaries are in days
 * past the invoice's due date.
 */
export type AgingBucket = "current" | "0_30" | "30_60" | "60_90" | "90_plus";

export type AgingTotals = Record<AgingBucket, { count: number; amountCents: number }>;

/**
 * Rate resolution. Looks up the effective hourly rate for a billable
 * shift, falling back through assignment → client → system default.
 */
import {
  DEFAULT_HOURLY_RATE_CENTS,
  VAT_RATE_ALLTAGSHILFE_PERCENT,
  VAT_RATE_REGULAR_PERCENT,
  type InvoiceKind,
} from "./types";

export type RateContext = {
  /** Per-shift override (rarely set). */
  shiftOverrideCents?: number | null;
  /** Per-assignment hourly rate. */
  assignmentRateCents?: number | null;
  /** Per-client default rate. */
  clientDefaultRateCents?: number | null;
};

/**
 * Returns the effective hourly rate in cents, walking the fallback chain.
 * Never throws; always returns a positive integer.
 */
export function resolveRateCents(ctx: RateContext): number {
  const candidates = [
    ctx.shiftOverrideCents,
    ctx.assignmentRateCents,
    ctx.clientDefaultRateCents,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) {
      return Math.floor(c);
    }
  }
  return DEFAULT_HOURLY_RATE_CENTS;
}

/** VAT percent for a given invoice kind. */
export function vatRateFor(kind: InvoiceKind): number {
  return kind === "alltagshilfe"
    ? VAT_RATE_ALLTAGSHILFE_PERCENT
    : VAT_RATE_REGULAR_PERCENT;
}

/**
 * Map a client's customer_type to an invoice kind. Anything not explicitly
 * "alltagshilfe" is treated as a regular invoice.
 */
export function invoiceKindForClient(
  customerType: string | null | undefined,
): InvoiceKind {
  return customerType === "alltagshilfe" ? "alltagshilfe" : "regular";
}

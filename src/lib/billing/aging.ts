/**
 * Receivables aging — buckets unpaid invoices by days past their due date.
 */
import type { AgingBucket, AgingTotals } from "./types";

export function classifyAging(
  dueDate: string | null,
  asOf: Date,
): AgingBucket {
  if (!dueDate) return "current";
  const due = new Date(dueDate + "T00:00:00Z");
  const diffDays = Math.floor((asOf.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "current";
  if (diffDays <= 30) return "0_30";
  if (diffDays <= 60) return "30_60";
  if (diffDays <= 90) return "60_90";
  return "90_plus";
}

export function emptyAging(): AgingTotals {
  return {
    current: { count: 0, amountCents: 0 },
    "0_30":  { count: 0, amountCents: 0 },
    "30_60": { count: 0, amountCents: 0 },
    "60_90": { count: 0, amountCents: 0 },
    "90_plus": { count: 0, amountCents: 0 },
  };
}

export function aggregateAging(
  invoices: ReadonlyArray<{
    due_date: string | null;
    total_cents: number;
    paid_amount_cents: number;
    status: string;
  }>,
  asOf: Date = new Date(),
): AgingTotals {
  const out = emptyAging();
  for (const inv of invoices) {
    if (inv.status === "paid" || inv.status === "cancelled") continue;
    const outstanding = Math.max(0, inv.total_cents - inv.paid_amount_cents);
    if (outstanding <= 0) continue;
    const bucket = classifyAging(inv.due_date, asOf);
    out[bucket].count += 1;
    out[bucket].amountCents += outstanding;
  }
  return out;
}

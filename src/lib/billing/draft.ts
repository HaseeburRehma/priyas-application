/**
 * Pure functions that turn approved shifts into a draft invoice.
 *
 * This module is *pure* — it does no I/O. The caller hands in records
 * already fetched from the DB; the result is a ready-to-persist draft.
 */
import {
  type DraftInvoice,
  type DraftLineItem,
  type InvoiceKind,
  type StaffBillingLine,
  type AssignmentBreakdown,
} from "./types";
import { minutesAtRate, summarize } from "./money";
import { resolveRateCents, vatRateFor } from "./rates";

/**
 * Row shape produced by `loadApprovedShifts()` in the data layer. Kept
 * narrow so the draft builder stays decoupled from Supabase types.
 */
export type ApprovedShiftRow = {
  shiftId: string;
  employeeId: string;
  employeeName: string;
  propertyId: string;
  propertyName: string;
  assignmentId: string | null;
  starts_at: string; // ISO timestamp
  ends_at: string;
  billableMinutes: number;
  overrideRateCents: number | null;
  assignmentRateCents: number | null;
  clientDefaultRateCents: number | null;
};

/**
 * Build a draft invoice from approved shifts. Caller decides whether to group
 * by property + employee (default) or by property only.
 */
export function buildDraftInvoice(args: {
  clientId: string;
  invoiceKind: InvoiceKind;
  periodStart: string;
  periodEnd: string;
  shifts: ReadonlyArray<ApprovedShiftRow>;
  groupBy?: "property_employee" | "property" | "shift";
  notes?: string | null;
}): DraftInvoice {
  const { clientId, invoiceKind, periodStart, periodEnd, shifts, notes } = args;
  const groupBy = args.groupBy ?? "property_employee";
  const taxRate = vatRateFor(invoiceKind);

  type Bucket = {
    description: string;
    minutes: number;
    rateCents: number;
    shiftIds: string[];
    assignmentId: string | null;
  };

  const buckets = new Map<string, Bucket>();
  for (const s of shifts) {
    const rate = resolveRateCents({
      shiftOverrideCents: s.overrideRateCents,
      assignmentRateCents: s.assignmentRateCents,
      clientDefaultRateCents: s.clientDefaultRateCents,
    });
    let key: string;
    let description: string;
    if (groupBy === "shift") {
      key = s.shiftId;
      description = `${s.propertyName} — ${s.employeeName} (${s.starts_at.slice(0, 10)})`;
    } else if (groupBy === "property") {
      key = `${s.propertyId}|${rate}`;
      description = `Reinigung ${s.propertyName}`;
    } else {
      key = `${s.propertyId}|${s.employeeId}|${rate}`;
      description = `${s.propertyName} — ${s.employeeName}`;
    }
    const existing = buckets.get(key);
    if (existing) {
      existing.minutes += s.billableMinutes;
      existing.shiftIds.push(s.shiftId);
    } else {
      buckets.set(key, {
        description,
        minutes: s.billableMinutes,
        rateCents: rate,
        shiftIds: [s.shiftId],
        assignmentId: s.assignmentId,
      });
    }
  }

  const items: DraftLineItem[] = [];
  let pos = 1;
  for (const bucket of buckets.values()) {
    // Quantity = hours (with 2 decimals). Unit price = €/hour (cents).
    const hours = roundDecimal(bucket.minutes / 60, 2);
    if (hours <= 0) continue;
    items.push({
      description: bucket.description,
      quantity: hours,
      unitPriceCents: bucket.rateCents,
      taxRatePercent: taxRate,
      position: pos++,
      // We attach the *first* shift id for traceability; the rest are reflected
      // via shifts.invoice_item_id once the invoice is persisted.
      shiftId: bucket.shiftIds[0] ?? null,
      assignmentId: bucket.assignmentId,
    });
  }

  const totals = summarize(items);
  return {
    clientId,
    invoiceKind,
    periodStart,
    periodEnd,
    items,
    totals,
    notes: notes ?? null,
  };
}

function roundDecimal(value: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(value * f) / f;
}

/**
 * Compute per-assignment planned-vs-actual breakdown. Used by the admin
 * "assignment summary" view.
 */
export function summarizeAssignment(args: {
  assignmentId: string;
  propertyName: string;
  rateCents: number;
  staff: ReadonlyArray<{
    employeeId: string;
    employeeName: string;
    plannedMinutes: number;
    actualMinutes: number;
  }>;
}): AssignmentBreakdown {
  const staff: StaffBillingLine[] = args.staff.map((s) => ({
    employeeId: s.employeeId,
    employeeName: s.employeeName,
    plannedMinutes: s.plannedMinutes,
    actualMinutes: s.actualMinutes,
    rateCents: args.rateCents,
    amountCents: minutesAtRate(s.actualMinutes, args.rateCents),
  }));
  const plannedMinutes = staff.reduce((a, s) => a + s.plannedMinutes, 0);
  const actualMinutes = staff.reduce((a, s) => a + s.actualMinutes, 0);
  return {
    assignmentId: args.assignmentId,
    propertyName: args.propertyName,
    plannedHours: roundDecimal(plannedMinutes / 60, 2),
    actualHours: roundDecimal(actualMinutes / 60, 2),
    rateCents: args.rateCents,
    plannedAmountCents: minutesAtRate(plannedMinutes, args.rateCents),
    actualAmountCents: minutesAtRate(actualMinutes, args.rateCents),
    varianceMinutes: actualMinutes - plannedMinutes,
    staff,
  };
}

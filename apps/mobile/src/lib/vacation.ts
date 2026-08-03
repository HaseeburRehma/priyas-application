/**
 * Vacation / leave requests — loader + submit for the current employee.
 *
 * The `vacation_requests` table stores every leave record (vacation,
 * sick day, unpaid). Mobile field-staff only see their own rows (RLS
 * enforces this at the DB) and can only insert with `status='pending'` —
 * managers approve/deny via the web app or dispatcher-only mobile
 * screens in future turns.
 */

import { getSupabase } from "@/lib/supabase";

export type LeaveKind = "vacation" | "sick" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type VacationRow = {
  id: string;
  kind: LeaveKind;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  created_at: string;
  reviewer_note: string | null;
};

export async function loadMyVacationRequests(
  employeeId: string,
): Promise<VacationRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("vacation_requests")
    .select(
      "id, kind, start_date, end_date, days, reason, status, created_at, reviewer_note",
    )
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as VacationRow[];
}

/** Compute inclusive whole-day count between two ISO dates (YYYY-MM-DD). */
export function dayCount(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const diff =
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
  return Math.max(0, Math.round(diff));
}

export async function submitVacationRequest(args: {
  employeeId: string;
  orgId: string;
  kind: LeaveKind;
  startDate: string;
  endDate: string;
  reason: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (new Date(args.endDate) < new Date(args.startDate)) {
    return { ok: false, error: "end_before_start" };
  }
  const days = dayCount(args.startDate, args.endDate);
  const { data, error } = await supabase
    .from("vacation_requests")
    .insert({
      employee_id: args.employeeId,
      org_id: args.orgId,
      kind: args.kind,
      start_date: args.startDate,
      end_date: args.endDate,
      days,
      reason: args.reason,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export async function cancelVacationRequest(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("vacation_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "pending"); // only pending rows are cancellable
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

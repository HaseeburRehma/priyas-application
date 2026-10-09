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
/** `suggested` = a manager proposed alternative dates (migration 000019);
 *  the proposed range lives in `suggested_start` / `suggested_end`. */
export type LeaveStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "suggested";

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
  /** Only set while status = "suggested". */
  suggested_start?: string | null;
  suggested_end?: string | null;
};

export async function loadMyVacationRequests(
  employeeId: string,
): Promise<VacationRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("vacation_requests")
    .select(
      "id, kind, start_date, end_date, days, reason, status, created_at, reviewer_note, suggested_start, suggested_end",
    )
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as VacationRow[];
}

/** Annual allowance used when the employee row has no
 *  `vacation_days_per_year` — same default the web app shows. */
export const DEFAULT_VACATION_DAYS = 30;

export type VacationBalance = {
  /** Annual allowance (employees.vacation_days_per_year, fallback 30). */
  total: number;
  /** Approved vacation days this year that have already ended. */
  used: number;
  /** Approved vacation days this year that are still ahead / running. */
  approved: number;
  /** total − used − approved, never negative. */
  free: number;
};

/**
 * Vacation balance for the current calendar year. Mirrors the web
 * (`src/lib/api/vacation.ts`): only approved `kind = vacation` rows
 * starting this year count — sick / unpaid leave never eats into the
 * allowance. The split into "used" vs "approved" is by end date.
 */
export async function loadMyVacationBalance(
  employeeId: string,
): Promise<VacationBalance> {
  const supabase = getSupabase();
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;

  const [empRes, vacRes] = await Promise.all([
    supabase
      .from("employees")
      .select("vacation_days_per_year")
      .eq("id", employeeId)
      .maybeSingle(),
    supabase
      .from("vacation_requests")
      .select("days, end_date")
      .eq("employee_id", employeeId)
      .eq("status", "approved")
      .eq("kind", "vacation")
      .gte("start_date", yearStart),
  ]);

  const perYear = (empRes.data as { vacation_days_per_year: number | null } | null)
    ?.vacation_days_per_year;
  const total =
    typeof perYear === "number" && perYear >= 0 ? perYear : DEFAULT_VACATION_DAYS;

  let used = 0;
  let approved = 0;
  for (const r of (vacRes.data ?? []) as Array<{ days: number; end_date: string }>) {
    const d = Number(r.days) || 0;
    if (r.end_date < today) used += d;
    else approved += d;
  }
  used = Math.round(used);
  approved = Math.round(approved);
  return { total, used, approved, free: Math.max(0, total - used - approved) };
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

/** Parse a `YYYY-MM-DD` string as a *local* calendar date (no UTC shift). */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * Compact, locale-aware period label for a leave range, e.g.
 * de: "16. – 20. Nov." / "30. Okt. – 2. Nov." / "16. – 20. Nov. 2026".
 */
export function formatLeavePeriod(
  startIso: string,
  endIso: string,
  locale: string,
  withYear = false,
): string {
  const s = parseLocalDate(startIso);
  const e = parseLocalDate(endIso);
  const endOpts: Intl.DateTimeFormatOptions = withYear
    ? { day: "numeric", month: "short", year: "numeric" }
    : { day: "numeric", month: "short" };
  if (startIso.slice(0, 10) === endIso.slice(0, 10)) {
    return e.toLocaleDateString(locale, endOpts);
  }
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  const startOpts: Intl.DateTimeFormatOptions = sameMonth
    ? { day: "numeric" }
    : withYear && !sameYear
      ? { day: "numeric", month: "short", year: "numeric" }
      : { day: "numeric", month: "short" };
  return `${s.toLocaleDateString(locale, startOpts)} – ${e.toLocaleDateString(locale, endOpts)}`;
}

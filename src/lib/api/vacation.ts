import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/rbac/permissions";

export type VacationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "suggested";

export type VacationRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: VacationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_note: string | null;
  suggested_start: string | null;
  suggested_end: string | null;
  created_at: string;
};

export type VacationData = {
  myEmployeeId: string | null;
  canApprove: boolean;
  canReadAll: boolean;
  requests: VacationRequest[];
  balance: { used: number; total: number };
};

export async function loadVacation(): Promise<VacationData> {
  const supabase = await createSupabaseServerClient();
  const { userId, role } = await getCurrentRole();
  if (!userId) {
    return {
      myEmployeeId: null,
      canApprove: false,
      canReadAll: false,
      requests: [],
      balance: { used: 0, total: 30 },
    };
  }

  const canApprove = role === "admin" || role === "dispatcher";
  const canReadAll = canApprove;

  // Find the employees row linked to this profile (if any).
  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  const myEmployeeId = (emp as { id: string } | null)?.id ?? null;

  // Build query — RLS already restricts, but we add the sort/filter.
  let query = supabase
    .from("vacation_requests")
    .select(
      `id, employee_id, start_date, end_date, days, reason, status,
       reviewed_by, reviewed_at, reviewer_note,
       suggested_start, suggested_end,
       created_at,
       employee:employees ( id, full_name )`,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (!canReadAll && myEmployeeId) {
    query = query.eq("employee_id", myEmployeeId);
  }

  const { data } = await query;
  type Row = {
    id: string;
    employee_id: string;
    start_date: string;
    end_date: string;
    days: number;
    reason: string | null;
    status: VacationStatus;
    reviewed_by: string | null;
    reviewed_at: string | null;
    reviewer_note: string | null;
    suggested_start: string | null;
    suggested_end: string | null;
    created_at: string;
    employee: { id: string; full_name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const requests: VacationRequest[] = rows.map((r) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employee?.full_name ?? "—",
    start_date: r.start_date,
    end_date: r.end_date,
    days: Number(r.days),
    reason: r.reason,
    status: r.status,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
    reviewer_note: r.reviewer_note,
    suggested_start: r.suggested_start,
    suggested_end: r.suggested_end,
    created_at: r.created_at,
  }));

  // My balance: sum approved days for this calendar year.
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
    .toISOString()
    .slice(0, 10);
  let used = 0;
  if (myEmployeeId) {
    const { data: balRows } = await supabase
      .from("vacation_requests")
      .select("days")
      .eq("employee_id", myEmployeeId)
      .eq("status", "approved")
      .gte("start_date", yearStart);
    used = ((balRows ?? []) as Array<{ days: number }>).reduce(
      (s, r) => s + Number(r.days),
      0,
    );
  }

  return {
    myEmployeeId,
    canApprove,
    canReadAll,
    requests,
    balance: { used: Math.round(used), total: 30 },
  };
}

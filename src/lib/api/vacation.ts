import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/rbac/permissions";
import type { LeaveKind } from "@/lib/validators/vacation";

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
  kind: LeaveKind;
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
      `id, employee_id, kind, start_date, end_date, days, reason, status,
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

  // Fan out the list query and the balance query — both depend only
  // on values already resolved. Was 2 sequential hops, now 1.
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
    .toISOString()
    .slice(0, 10);
  const balancePromise = myEmployeeId
    ? supabase
        .from("vacation_requests")
        .select("days")
        .eq("employee_id", myEmployeeId)
        .eq("status", "approved")
        .eq("kind", "vacation")
        .gte("start_date", yearStart)
    : Promise.resolve({ data: [] as Array<{ days: number }> });

  const [{ data }, balRes] = await Promise.all([query, balancePromise]);
  type Row = {
    id: string;
    employee_id: string;
    kind: LeaveKind;
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
    kind: r.kind,
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

  // My balance: sum approved *vacation* days for this calendar year — sick
  // days are tracked separately and must not eat into the annual vacation
  // allowance. Query already fired above in the Promise.all — read result.
  const used = ((balRes.data ?? []) as Array<{ days: number }>).reduce(
    (s, r) => s + Number(r.days),
    0,
  );

  return {
    myEmployeeId,
    canApprove,
    canReadAll,
    requests,
    balance: { used: Math.round(used), total: 30 },
  };
}

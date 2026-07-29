import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/rbac/permissions";
import { getCachedProfile, getCachedUser } from "@/lib/api/current-user";
import { pairCheckInOutEvents } from "@/lib/api/time-entries-pairing";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  subWeeks,
  addDays,
  format,
} from "date-fns";
import type {
  ActivityEntry,
  DashboardData,
  KpiSet,
  TeamLoad,
  TodayShift,
  WeeklyChartData,
  WeeklyChartDay,
} from "./dashboard.types";

// Re-export for callers that still import from this module.
export type {
  ActivityEntry,
  DashboardData,
  KpiSet,
  TeamLoad,
  TodayShift,
  WeeklyChartData,
  WeeklyChartDay,
} from "./dashboard.types";

/* ============================================================================
 * Helpers
 * ========================================================================== */

const TONES: TeamLoad["tone"][] = ["primary", "secondary", "accent"];
const initialsOf = (name: string | null | undefined) =>
  (name ?? "—")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

function pctDelta(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

/* ============================================================================
 * Loader
 * ========================================================================== */

/**
 * Fetches everything the dashboard needs in parallel. Designed for use in a
 * Server Component — the function is `await`ed at the top of the page.
 *
 * Every query is org-scoped via RLS, so we never have to filter by org_id
 * explicitly. Aggregations are intentionally lightweight (counts + small
 * SELECTs) so the page renders fast even on the free tier.
 */
export async function loadDashboardData(): Promise<DashboardData> {
  const supabase = await createSupabaseServerClient();

  // Resolve org_id explicitly so we can pass it as a leading filter on
  // queries (audit_log especially) where the planner needs help picking
  // the right index. RLS still enforces the org boundary; this is a
  // perf hint, not a security control.
  const { userId: roleUserId, orgId } = await getCurrentRole();
  void roleUserId;

  // Cached user + profile — reused across every loader in this request,
  // so this pair collapses to zero extra round-trips when other loaders
  // have already primed them.
  const [cachedUser, cachedProfile] = await Promise.all([
    getCachedUser(),
    getCachedProfile(),
  ]);
  const greetingName = (
    cachedProfile?.fullName ?? cachedUser?.email ?? "—"
  ).split(" ")[0] ?? "—";

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const lastWeekStart = subWeeks(weekStart, 1);
  const lastWeekEnd = subWeeks(weekEnd, 1);

  // Single-round-trip KPI aggregation. All 10 counts + the open-invoice
  // sum are computed server-side by the `dashboard_kpis` SQL function
  // (see migration 000054) and returned as one JSON blob. Replaces
  // 10 separate count() queries — cuts DB round-trips proportional to
  // network latency (huge win on cross-region deployments).
  const { data: kpiRaw, error: kpiErr } = await supabase.rpc(
    "dashboard_kpis" as never,
    {
      p_month_start: monthStart.toISOString(),
      p_today_start: todayStart.toISOString(),
      p_today_end: todayEnd.toISOString(),
    } as never,
  );
  if (kpiErr) throw kpiErr;
  type KpiJson = {
    clients: { active: number; active_last_month: number; added_this_month: number };
    properties: { total: number; total_last_month: number; added_this_month: number };
    shifts_today: { scheduled: number; pending_checkins: number };
    invoices: { open_cents: number; pending_count: number; overdue_count: number };
  };
  const k = kpiRaw as unknown as KpiJson;

  const kpis: KpiSet = {
    activeClients: {
      value: k.clients.active,
      deltaPct: pctDelta(k.clients.active, k.clients.active_last_month),
      addedThisMonth: k.clients.added_this_month,
    },
    managedProperties: {
      value: k.properties.total,
      deltaPct: pctDelta(k.properties.total, k.properties.total_last_month),
      addedThisMonth: k.properties.added_this_month,
    },
    todayShifts: {
      value: k.shifts_today.scheduled,
      pendingCheckins: k.shifts_today.pending_checkins,
    },
    openInvoices: {
      valueCents: Number(k.invoices.open_cents),
      pendingCount: k.invoices.pending_count,
      overdueCount: k.invoices.overdue_count,
    },
  };

  /* ----- Weekly chart: Mon–Sun completed + scheduled counts -------------- */
  const [thisWeekShiftsRes, lastWeekShiftsRes, thisWeekHoursRes, lastWeekHoursRes] =
    await Promise.all([
      supabase
        .from("shifts")
        .select("starts_at, status")
        .is("deleted_at", null)
        .gte("starts_at", weekStart.toISOString())
        .lte("starts_at", weekEnd.toISOString()),
      supabase
        .from("shifts")
        .select("id, status")
        .is("deleted_at", null)
        .gte("starts_at", lastWeekStart.toISOString())
        .lte("starts_at", lastWeekEnd.toISOString()),
      supabase
        .from("time_entries")
        .select("shift_id, employee_id, kind, occurred_at")
        .in("kind", ["check_in", "check_out"])
        .gte("occurred_at", weekStart.toISOString())
        .lte("occurred_at", weekEnd.toISOString()),
      supabase
        .from("time_entries")
        .select("shift_id, employee_id, kind, occurred_at")
        .in("kind", ["check_in", "check_out"])
        .gte("occurred_at", lastWeekStart.toISOString())
        .lte("occurred_at", lastWeekEnd.toISOString()),
    ]);

  const labels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const days: WeeklyChartDay[] = labels.map((label) => ({
    label,
    completed: 0,
    scheduled: 0,
  }));

  const thisShifts = (thisWeekShiftsRes.data ?? []) as Array<{
    starts_at: string;
    status: string;
  }>;
  for (const s of thisShifts) {
    const idx = (new Date(s.starts_at).getDay() + 6) % 7; // Mon=0
    if (idx >= 0 && idx < 7 && days[idx]) {
      days[idx].scheduled += 1;
      if (s.status === "completed") days[idx].completed += 1;
    }
  }
  const completedTotal = days.reduce((s, d) => s + d.completed, 0);
  const scheduledTotal = days.reduce((s, d) => s + d.scheduled, 0);
  const lastShifts = (lastWeekShiftsRes.data ?? []) as Array<{ status: string }>;
  const lastCompleted = lastShifts.filter((s) => s.status === "completed").length;

  const hoursOf = (
    rows: Array<{
      shift_id: string | null;
      employee_id: string | null;
      kind: string;
      occurred_at: string;
    }>,
  ) =>
    pairCheckInOutEvents(rows).reduce((sum, pair) => {
      if (!pair.check_out_at || !pair.check_in_at) return sum;
      const ms =
        new Date(pair.check_out_at).getTime() -
        new Date(pair.check_in_at).getTime();
      return sum + Math.max(0, ms / 3_600_000);
    }, 0);
  const hoursThis = hoursOf(
    (thisWeekHoursRes.data ?? []) as Parameters<typeof hoursOf>[0],
  );
  const hoursLast = hoursOf(
    (lastWeekHoursRes.data ?? []) as Parameters<typeof hoursOf>[0],
  );

  const chart: WeeklyChartData = {
    days,
    completed: completedTotal,
    scheduled: scheduledTotal,
    hours: Math.round(hoursThis),
    completedDeltaPct: pctDelta(completedTotal, lastCompleted),
    hoursDeltaPct: pctDelta(hoursThis, hoursLast),
    weekLabel: "KW " + format(weekStart, "I"),
  };

  /* ----- Today's shifts list -------------------------------------------- */
  const { data: shiftsRows } = await supabase
    .from("shifts")
    .select(
      `id, starts_at, ends_at, status, notes,
       property:properties (
         name, city,
         client:clients ( display_name )
       ),
       employee:employees ( id, full_name )`,
    )
    .is("deleted_at", null)
    .gte("starts_at", todayStart.toISOString())
    .lte("starts_at", todayEnd.toISOString())
    .order("starts_at", { ascending: true })
    .limit(8);

  type ShiftRow = {
    id: string;
    starts_at: string;
    ends_at: string;
    status: TodayShift["status"];
    notes: string | null;
    property: {
      name: string;
      client: { display_name: string } | null;
    } | null;
    employee: { id: string; full_name: string } | null;
  };

  const todayShifts: TodayShift[] = ((shiftsRows ?? []) as unknown as ShiftRow[]).map(
    (s, idx) => {
      const starts = new Date(s.starts_at);
      const ends = new Date(s.ends_at);
      const dur = (ends.getTime() - starts.getTime()) / 3_600_000;
      const propName = s.property?.name ?? "—";
      const clientName = s.property?.client?.display_name ?? "—";
      const flag: TodayShift["flag"] =
        s.status === "completed" ? "done" : s.status === "in_progress" ? "warn" : "ok";
      const empInitials = s.employee
        ? initialsOf(s.employee.full_name)
        : `K${idx + 1}`;
      const tone = TONES[idx % TONES.length] ?? "primary";
      return {
        id: s.id,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        status: s.status,
        property: propName,
        client: clientName,
        zone: null,
        serviceLabel: s.notes ?? "Reinigung",
        durationLabel: `${dur.toFixed(dur % 1 === 0 ? 0 : 1)}h`,
        team: [{ initials: empInitials, tone }],
        flag,
        flagDetail:
          s.status === "in_progress" ? "Check-in läuft" : undefined,
      };
    },
  );

  /* ----- Recent activity (audit_log + actor profile) -------------------- */
  // Pull recent audit entries, then resolve actor names in one follow-up
  // query rather than embedding via PostgREST (audit_log doesn't declare
  // a foreign key on user_id, so the embedded join would need a hint).
  // Explicit org_id filter — gives the planner the leading column on
  // `idx_audit_org_created` instead of relying purely on RLS predicates.
  // Pull a few extra rows here (16 instead of 8) so we still have
  // enough non-system entries to display after we filter out the
  // database-housekeeping rows below.
  let auditQuery = supabase
    .from("audit_log")
    .select("id, action, table_name, record_id, user_id, after, created_at")
    .order("created_at", { ascending: false })
    .limit(16);
  if (orgId) auditQuery = auditQuery.eq("org_id", orgId);
  const { data: auditRows } = await auditQuery;
  type AuditRow = {
    id: number;
    action: string;
    table_name: string;
    record_id: string | null;
    user_id: string | null;
    after: Record<string, unknown> | null;
    created_at: string;
  };

  /**
   * Filter out audit rows that aren't useful to surface in the user-
   * facing activity feed. Two categories get dropped:
   *
   *   1. **Migration / system housekeeping** — rows whose action starts
   *      with `migration.` or `system.` (e.g. "Existing admin profile
   *      observed at security migration 000024…"). Those are produced
   *      by `do $$` blocks during schema upgrades and have no actor,
   *      no link target, and no business meaning to the people using
   *      the dashboard.
   *
   *   2. **No-actor system rows** whose message explicitly mentions
   *      "migration" — a belt-and-braces guard for migrations that
   *      forgot to use the `migration.` action prefix.
   */
  const auditList = ((auditRows ?? []) as AuditRow[])
    .filter((r) => {
      const action = (r.action ?? "").toLowerCase();
      if (action.startsWith("migration.")) return false;
      if (action.startsWith("system.migration")) return false;
      // user_id is null for system rows; combined with a migration
      // mention in the body, that's almost certainly housekeeping
      // noise.
      const message =
        (r.after && typeof r.after.message === "string"
          ? (r.after.message as string)
          : "") ?? "";
      if (!r.user_id && /migration/i.test(message)) return false;
      return true;
    })
    .slice(0, 8);

  const actorIds = Array.from(
    new Set(auditList.map((r) => r.user_id).filter((id): id is string => !!id)),
  );
  const actorByProfileId = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actorRows } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const p of (actorRows ?? []) as Array<{
      id: string;
      full_name: string | null;
    }>) {
      actorByProfileId.set(p.id, p.full_name ?? "");
    }
  }

  const activities: ActivityEntry[] = auditList.map((row) => {
    const kind: ActivityEntry["kind"] = row.table_name.includes("invoice")
      ? "invoice"
      : row.table_name === "time_entries"
        ? "checkin"
        : row.action === "alert"
          ? "alert"
          : "create";
    return {
      id: String(row.id),
      kind,
      body:
        typeof row.after?.message === "string"
          ? row.after.message
          : `${row.action} · ${row.table_name}`,
      actorName: row.user_id
        ? (actorByProfileId.get(row.user_id) ?? null)
        : null,
      table: row.table_name,
      recordId: row.record_id,
      createdAt: row.created_at,
    };
  });

  /* ----- Team utilization ----------------------------------------------- */
  // Hours scheduled this week per employee, divided by their target.
  // Now joins through profiles so the role chip is real ("pm" vs "field"
  // vs "trainee") and the list is sorted by utilization desc instead of
  // by row index. Limited to top 6 so the panel stays compact.
  const { data: empRows } = await supabase
    .from("employees")
    .select(
      `id, full_name, weekly_hours, status,
       profile:profiles ( id, role )`,
    )
    .is("deleted_at", null)
    .eq("status", "active");
  type EmployeeRow = {
    id: string;
    full_name: string;
    weekly_hours: number | null;
    status: string;
    profile: {
      id: string;
      role: "admin" | "dispatcher" | "employee" | null;
    } | null;
  };
  const employees = (empRows ?? []) as unknown as EmployeeRow[];

  const { data: weekShiftsForLoad } = await supabase
    .from("shifts")
    .select("employee_id, starts_at, ends_at")
    .is("deleted_at", null)
    .gte("starts_at", weekStart.toISOString())
    .lte("starts_at", weekEnd.toISOString())
    // Defensive cap: 1000 shifts/week is ~5× the largest seed scenario.
    .limit(1000);

  const hoursByEmp = new Map<string, number>();
  for (const s of (weekShiftsForLoad ?? []) as Array<{
    employee_id: string | null;
    starts_at: string;
    ends_at: string;
  }>) {
    if (!s.employee_id) continue;
    const h =
      (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) /
      3_600_000;
    hoursByEmp.set(s.employee_id, (hoursByEmp.get(s.employee_id) ?? 0) + h);
  }

  // Map profile role → TeamLoad role chip. Mirrors the same mapping the
  // employees list uses (chipFromProfileRole), kept inline here to
  // avoid a server↔server import cycle.
  const roleChipOf = (
    role: "admin" | "dispatcher" | "employee" | null,
  ): TeamLoad["role"] => {
    if (role === "admin" || role === "dispatcher") return "pm";
    return "field";
  };

  const teamLoad: TeamLoad[] = employees
    .map((e, idx): TeamLoad => {
      const hours = hoursByEmp.get(e.id) ?? 0;
      const target = e.weekly_hours ?? 40;
      const pct = Math.min(150, Math.round((hours / target) * 100));
      const tone = TONES[idx % TONES.length] ?? "primary";
      return {
        id: e.id,
        name: e.full_name,
        role: roleChipOf(e.profile?.role ?? null),
        pct,
        initials: initialsOf(e.full_name),
        tone,
        hours: Math.round(hours * 10) / 10,
        target,
      };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  return {
    greetingName,
    kpis,
    chart,
    todayShifts,
    activities,
    teamLoad,
  };
}

// Suppress unused import warnings for date helpers that may be removed by tree-shaking.
void addDays;
// Re-export from utils/format so existing imports still work without a churn.
export { formatEUR, formatLongDate } from "@/lib/utils/format";

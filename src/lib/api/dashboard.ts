import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  // Get the signed-in user's first name for the greeting.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const fullName = (profileRow as { full_name: string | null } | null)
    ?.full_name;
  const greetingName = (fullName ?? user?.email ?? "—").split(" ")[0] ?? "—";

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const lastWeekStart = subWeeks(weekStart, 1);
  const lastWeekEnd = subWeeks(weekEnd, 1);

  // Fire all the simple counts in parallel.
  const [
    activeClientsRes,
    activeClientsLastMonthRes,
    activeClientsAddedRes,
    propsRes,
    propsLastMonthRes,
    propsAddedRes,
    todayShiftsRes,
    todayPendingCheckinsRes,
    openInvoicesRes,
    overdueInvoicesRes,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .lt("created_at", monthStart.toISOString()),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", monthStart.toISOString()),

    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .lt("created_at", monthStart.toISOString()),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", monthStart.toISOString()),

    supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("starts_at", todayStart.toISOString())
      .lte("starts_at", todayEnd.toISOString()),
    supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("starts_at", todayStart.toISOString())
      .lte("starts_at", todayEnd.toISOString())
      .in("status", ["scheduled"]),

    supabase
      .from("invoices")
      .select("total_cents")
      .is("deleted_at", null)
      .in("status", ["sent", "overdue"]),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "overdue"),
  ]);

  const activeClients = activeClientsRes.count ?? 0;
  const activeClientsLastMonth = activeClientsLastMonthRes.count ?? 0;
  const propsCount = propsRes.count ?? 0;
  const propsLastMonth = propsLastMonthRes.count ?? 0;

  const invoiceRows =
    (openInvoicesRes.data ?? []) as ReadonlyArray<{ total_cents: number | null }>;
  const openInvoiceCents = invoiceRows.reduce(
    (sum, r) => sum + Number(r.total_cents ?? 0),
    0,
  );

  const kpis: KpiSet = {
    activeClients: {
      value: activeClients,
      deltaPct: pctDelta(activeClients, activeClientsLastMonth),
      addedThisMonth: activeClientsAddedRes.count ?? 0,
    },
    managedProperties: {
      value: propsCount,
      deltaPct: pctDelta(propsCount, propsLastMonth),
      addedThisMonth: propsAddedRes.count ?? 0,
    },
    todayShifts: {
      value: todayShiftsRes.count ?? 0,
      pendingCheckins: todayPendingCheckinsRes.count ?? 0,
    },
    openInvoices: {
      valueCents: openInvoiceCents,
      pendingCount: invoiceRows.length,
      overdueCount: overdueInvoicesRes.count ?? 0,
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
        .select("check_in_at, check_out_at, break_minutes")
        .gte("check_in_at", weekStart.toISOString())
        .lte("check_in_at", weekEnd.toISOString()),
      supabase
        .from("time_entries")
        .select("check_in_at, check_out_at, break_minutes")
        .gte("check_in_at", lastWeekStart.toISOString())
        .lte("check_in_at", lastWeekEnd.toISOString()),
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
      check_in_at: string;
      check_out_at: string | null;
      break_minutes: number | null;
    }>,
  ) =>
    rows.reduce((sum, r) => {
      if (!r.check_out_at) return sum;
      const ms =
        new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime();
      return sum + Math.max(0, ms / 3_600_000 - (r.break_minutes ?? 0) / 60);
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

  /* ----- Recent activity (audit_log) ------------------------------------ */
  const { data: auditRows } = await supabase
    .from("audit_log")
    .select("id, action, table_name, after, created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  const activities: ActivityEntry[] = ((auditRows ?? []) as Array<{
    id: number;
    action: string;
    table_name: string;
    after: Record<string, unknown> | null;
    created_at: string;
  }>).map((row) => {
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
      body: typeof row.after?.message === "string"
        ? row.after.message
        : `${row.action} · ${row.table_name}`,
      meta: typeof row.after?.meta === "string" ? row.after.meta : "—",
      createdAt: row.created_at,
    };
  });

  /* ----- Team utilization ----------------------------------------------- */
  // Hours scheduled this week per employee, divided by their target (weekly_hours).
  const { data: empRows } = await supabase
    .from("employees")
    .select("id, full_name, weekly_hours, status")
    .is("deleted_at", null)
    .eq("status", "active");
  const employees = (empRows ?? []) as Array<{
    id: string;
    full_name: string;
    weekly_hours: number | null;
    status: string;
  }>;

  const { data: weekShiftsForLoad } = await supabase
    .from("shifts")
    .select("employee_id, starts_at, ends_at")
    .is("deleted_at", null)
    .gte("starts_at", weekStart.toISOString())
    .lte("starts_at", weekEnd.toISOString());

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

  const teamLoad: TeamLoad[] = employees.slice(0, 6).map((e, idx) => {
    const hours = hoursByEmp.get(e.id) ?? 0;
    const target = e.weekly_hours ?? 40;
    const pct = Math.min(100, Math.round((hours / target) * 100));
    const tone = TONES[idx % TONES.length] ?? "primary";
    return {
      id: e.id,
      name: e.full_name,
      role: idx === 0 ? "Team Lead" : "Field Staff",
      pct,
      initials: initialsOf(e.full_name),
      tone,
    };
  });

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

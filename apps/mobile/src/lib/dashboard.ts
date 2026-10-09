/**
 * Admin/dispatcher dashboard loader — org KPIs + team utilization.
 *
 * Uses the same `dashboard_kpis` RPC the web dashboard uses (migration
 * 000054). Falls back to a fan-out of count queries if the RPC isn't
 * deployed on the environment yet, so the mobile app never breaks
 * because of migration lag.
 */

import { getSupabase } from "@/lib/supabase";
import {
  addDays,
  addHours,
  addWeeks,
  endOfMonth,
  endOfWeek,
  startOfDay,
  endOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";

export type OrgKpis = {
  activeClients: number;
  properties: number;
  todayShifts: number;
  todayPendingCheckins: number;
  openInvoiceCents: number;
  overdueCount: number;
  /**
   * Trend inputs (optional — older RPC deployments may not return them).
   * Clients / properties that existed before this month started, and how
   * many were added since. Drive the "▲ x %" badges on the KPI cards.
   */
  activeClientsLastMonth?: number;
  clientsAddedThisMonth?: number;
  propertiesLastMonth?: number;
  propertiesAddedThisMonth?: number;
  /** Count of sent + overdue invoices (the rows behind openInvoiceCents). */
  openInvoiceCount?: number;
};

export type TeamMemberLoad = {
  employee_id: string;
  full_name: string;
  hours_this_week: number;
  weekly_target: number;
};

export async function loadOrgKpis(): Promise<OrgKpis> {
  const supabase = getSupabase();
  const now = new Date();
  const monthStart = startOfMonth(now).toISOString();
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();

  // Try RPC first — one round-trip.
  type KpiJson = {
    clients: { active: number; active_last_month?: number; added_this_month?: number };
    properties: { total: number; total_last_month?: number; added_this_month?: number };
    shifts_today: { scheduled: number; pending_checkins: number };
    invoices: { open_cents: number; pending_count?: number; overdue_count: number };
  };
  const rpc = await supabase.rpc("dashboard_kpis", {
    p_month_start: monthStart,
    p_today_start: todayStart,
    p_today_end: todayEnd,
  });
  if (!rpc.error && rpc.data) {
    const k = rpc.data as KpiJson;
    return {
      activeClients: k.clients.active,
      properties: k.properties.total,
      todayShifts: k.shifts_today.scheduled,
      todayPendingCheckins: k.shifts_today.pending_checkins,
      openInvoiceCents: Number(k.invoices.open_cents),
      overdueCount: k.invoices.overdue_count,
      activeClientsLastMonth: k.clients.active_last_month,
      clientsAddedThisMonth: k.clients.added_this_month,
      propertiesLastMonth: k.properties.total_last_month,
      propertiesAddedThisMonth: k.properties.added_this_month,
      openInvoiceCount: k.invoices.pending_count,
    };
  }

  // Fallback: parallel count fan-out (mirrors the web loader).
  const [c, p, sh, pending, inv, over, cLast, pLast] = await Promise.all([
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("starts_at", todayStart)
      .lte("starts_at", todayEnd),
    supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("starts_at", todayStart)
      .lte("starts_at", todayEnd)
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
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .lt("created_at", monthStart),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .lt("created_at", monthStart),
  ]);
  const invRows = (inv.data ?? []) as Array<{ total_cents: number | null }>;
  const activeClients = c.count ?? 0;
  const properties = p.count ?? 0;
  return {
    activeClients,
    properties,
    todayShifts: sh.count ?? 0,
    todayPendingCheckins: pending.count ?? 0,
    openInvoiceCents: invRows.reduce(
      (s, r) => s + Number(r.total_cents ?? 0),
      0,
    ),
    overdueCount: over.count ?? 0,
    activeClientsLastMonth: cLast.count ?? undefined,
    clientsAddedThisMonth:
      cLast.count != null ? Math.max(0, activeClients - cLast.count) : undefined,
    propertiesLastMonth: pLast.count ?? undefined,
    propertiesAddedThisMonth:
      pLast.count != null ? Math.max(0, properties - pLast.count) : undefined,
    openInvoiceCount: inv.error ? undefined : invRows.length,
  };
}

/* ============================================================================
 * Shift chart (Tag / Woche / Monat) — completed vs. scheduled per bucket
 * plus clocked hours, with "to date" comparison against the previous
 * period. Mirrors the web dashboard's weekly chart (all non-deleted
 * shifts count as scheduled; status "completed" counts as done; hours
 * come from paired check-in / check-out time entries).
 * ========================================================================== */

export type ChartPeriod = "day" | "week" | "month";

export type ShiftChartBucket = {
  /** ISO start of the bucket (3-hour slot, day, or ISO week). */
  start: string;
  completed: number;
  scheduled: number;
  /** Bucket starts after "now". */
  future: boolean;
  /** Saturday / Sunday bucket (week view only). */
  weekend: boolean;
};

export type ShiftChart = {
  period: ChartPeriod;
  /** ISO start of the period (drives the "KW 41" / month label). */
  start: string;
  buckets: ShiftChartBucket[];
  completed: number;
  scheduled: number;
  hours: number;
  /** Completed shifts in the previous period up to the same offset. */
  prevCompleted: number;
  /** Clocked hours in the previous period up to the same offset. */
  prevHours: number;
};

function periodRange(period: ChartPeriod, now: Date) {
  if (period === "day") {
    const start = startOfDay(now);
    return { start, end: endOfDay(now), prevStart: subDays(start, 1) };
  }
  if (period === "month") {
    const start = startOfMonth(now);
    return { start, end: endOfMonth(now), prevStart: subMonths(start, 1) };
  }
  const start = startOfWeek(now, { weekStartsOn: 1 });
  return {
    start,
    end: endOfWeek(now, { weekStartsOn: 1 }),
    prevStart: subWeeks(start, 1),
  };
}

function bucketStarts(period: ChartPeriod, start: Date, end: Date): Date[] {
  const out: Date[] = [];
  if (period === "day") {
    for (let i = 0; i < 8; i++) out.push(addHours(start, i * 3));
  } else if (period === "week") {
    for (let i = 0; i < 7; i++) out.push(addDays(start, i));
  } else {
    let w = startOfWeek(start, { weekStartsOn: 1 });
    while (w.getTime() <= end.getTime()) {
      out.push(w);
      w = addWeeks(w, 1);
    }
  }
  return out;
}

type PairEntry = {
  employee_id: string;
  shift_id: string;
  kind: string;
  occurred_at: string;
};

/** Pair check-in/check-out per (employee, shift) → [checkInMs, hours][]. */
function pairHours(entries: PairEntry[]): Array<[number, number]> {
  const pairs = new Map<string, { in?: number; out?: number }>();
  for (const e of entries) {
    const key = `${e.employee_id}|${e.shift_id}`;
    const p = pairs.get(key) ?? {};
    const ts = new Date(e.occurred_at).getTime();
    if (e.kind === "check_in") p.in = ts;
    else if (e.kind === "check_out") p.out = ts;
    pairs.set(key, p);
  }
  const out: Array<[number, number]> = [];
  for (const p of pairs.values()) {
    if (p.in == null || p.out == null) continue;
    out.push([p.in, Math.max(0, (p.out - p.in) / 3_600_000)]);
  }
  return out;
}

export async function loadShiftChart(
  period: ChartPeriod = "week",
): Promise<ShiftChart> {
  const supabase = getSupabase();
  const now = new Date();
  const { start, end, prevStart } = periodRange(period, now);
  // "To date" comparison: previous period up to the same elapsed offset,
  // so a half-finished week isn't compared against a full one.
  const prevEnd = new Date(
    prevStart.getTime() + Math.max(0, now.getTime() - start.getTime()),
  );

  const [shiftRes, entryRes] = await Promise.all([
    supabase
      .from("shifts")
      .select("starts_at, status")
      .is("deleted_at", null)
      .gte("starts_at", prevStart.toISOString())
      .lte("starts_at", end.toISOString())
      .limit(5000),
    supabase
      .from("time_entries")
      .select("employee_id, shift_id, kind, occurred_at")
      .in("kind", ["check_in", "check_out"])
      .gte("occurred_at", prevStart.toISOString())
      .lte("occurred_at", end.toISOString())
      .limit(10000),
  ]);
  if (shiftRes.error) throw shiftRes.error;

  const starts = bucketStarts(period, start, end);
  const buckets: ShiftChartBucket[] = starts.map((s) => ({
    start: s.toISOString(),
    completed: 0,
    scheduled: 0,
    future: s.getTime() > now.getTime(),
    weekend: period === "week" && (s.getDay() === 0 || s.getDay() === 6),
  }));
  const startMs = start.getTime();
  const endMs = end.getTime();
  const prevStartMs = prevStart.getTime();
  const prevEndMs = prevEnd.getTime();

  let prevCompleted = 0;
  for (const s of (shiftRes.data ?? []) as Array<{ starts_at: string; status: string }>) {
    const ts = new Date(s.starts_at).getTime();
    if (ts >= startMs && ts <= endMs) {
      let idx = 0;
      for (let i = 0; i < starts.length; i++) {
        if (starts[i]!.getTime() <= ts) idx = i;
      }
      const b = buckets[idx];
      if (!b) continue;
      b.scheduled += 1;
      if (s.status === "completed") b.completed += 1;
    } else if (ts >= prevStartMs && ts <= prevEndMs && s.status === "completed") {
      prevCompleted += 1;
    }
  }

  let hours = 0;
  let prevHours = 0;
  for (const [inMs, h] of pairHours((entryRes.data ?? []) as PairEntry[])) {
    if (inMs >= startMs && inMs <= endMs) hours += h;
    else if (inMs >= prevStartMs && inMs <= prevEndMs) prevHours += h;
  }

  return {
    period,
    start: start.toISOString(),
    buckets,
    completed: buckets.reduce((n, b) => n + b.completed, 0),
    scheduled: buckets.reduce((n, b) => n + b.scheduled, 0),
    hours: Math.round(hours * 10) / 10,
    prevCompleted,
    prevHours: Math.round(prevHours * 10) / 10,
  };
}

/* ============================================================================
 * Today's schedule — every shift starting today with property, client and
 * assigned employee. Same query shape as the web dashboard.
 * ========================================================================== */

export type TodayShiftRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  property_id: string | null;
  property_name: string;
  client_name: string | null;
  employee_name: string | null;
};

export async function loadTodaySchedule(): Promise<TodayShiftRow[]> {
  const supabase = getSupabase();
  const now = new Date();
  const { data, error } = await supabase
    .from("shifts")
    .select(
      `id, starts_at, ends_at, status, notes, property_id,
       property:properties ( name, client:clients ( display_name ) ),
       employee:employees ( full_name )`,
    )
    .is("deleted_at", null)
    .gte("starts_at", startOfDay(now).toISOString())
    .lte("starts_at", endOfDay(now).toISOString())
    .order("starts_at", { ascending: true })
    .limit(50);
  if (error) throw error;
  type Row = {
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    notes: string | null;
    property_id: string | null;
    property: { name: string; client: { display_name: string } | null } | null;
    employee: { full_name: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    status: r.status,
    notes: r.notes,
    property_id: r.property_id,
    property_name: r.property?.name ?? "—",
    client_name: r.property?.client?.display_name ?? null,
    employee_name: r.employee?.full_name ?? null,
  }));
}

/* ============================================================================
 * Recent activity — latest audit_log rows (RLS: dispatcher/admin only),
 * minus migration housekeeping, with actor names resolved from profiles.
 * Mirrors the web dashboard's activity feed.
 * ========================================================================== */

export type ActivityRow = {
  id: string;
  kind: "create" | "checkin" | "invoice" | "alert";
  action: string;
  table: string;
  record_id: string | null;
  /** after.message when the writer supplied one (may contain **bold**). */
  message: string | null;
  /** after.meta (e.g. "via WebApp") when present. */
  meta: string | null;
  actor_name: string | null;
  created_at: string;
};

export async function loadRecentActivity(limit = 5): Promise<ActivityRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, action, table_name, record_id, user_id, after, created_at")
    .order("created_at", { ascending: false })
    .limit(16);
  if (error) throw error;
  type Row = {
    id: number | string;
    action: string | null;
    table_name: string | null;
    record_id: string | null;
    user_id: string | null;
    after: Record<string, unknown> | null;
    created_at: string;
  };
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const rows = ((data ?? []) as Row[])
    .filter((r) => {
      const action = (r.action ?? "").toLowerCase();
      if (action.startsWith("migration.") || action.startsWith("system.migration")) {
        return false;
      }
      const msg = str(r.after?.message) ?? "";
      return !(!r.user_id && /migration/i.test(msg));
    })
    .slice(0, limit);

  const actorIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((x): x is string => !!x)),
  );
  const actors = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
      if (p.full_name) actors.set(p.id, p.full_name);
    }
  }

  return rows.map((r) => {
    const table = r.table_name ?? "";
    const action = r.action ?? "";
    return {
      id: String(r.id),
      kind: table.includes("invoice")
        ? "invoice"
        : table === "time_entries"
          ? "checkin"
          : action === "alert"
            ? "alert"
            : "create",
      action,
      table,
      record_id: r.record_id,
      message: str(r.after?.message),
      meta: str(r.after?.meta),
      actor_name: r.user_id ? (actors.get(r.user_id) ?? null) : null,
      created_at: r.created_at,
    };
  });
}

/**
 * Team-utilization for the current week. For each active employee we
 * compute hours worked from their `check_in / check_out` pairs — mirror
 * of the web loader's algorithm.
 */
export async function loadTeamUtilization(): Promise<TeamMemberLoad[]> {
  const supabase = getSupabase();
  const now = new Date();
  const ws = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
  const we = endOfWeek(now, { weekStartsOn: 1 }).toISOString();

  const [empRes, entryRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, weekly_hours")
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name", { ascending: true })
      .limit(50),
    supabase
      .from("time_entries")
      .select("employee_id, shift_id, kind, occurred_at")
      .gte("occurred_at", ws)
      .lte("occurred_at", we),
  ]);

  type Emp = { id: string; full_name: string; weekly_hours: number | null };
  const emps = (empRes.data ?? []) as Emp[];

  type Entry = {
    employee_id: string;
    shift_id: string;
    kind: string;
    occurred_at: string;
  };
  const entries = (entryRes.data ?? []) as Entry[];

  // Pair check-in/check-out per (employee, shift).
  const pairsKey = (e: Entry) => `${e.employee_id}|${e.shift_id}`;
  const pairs = new Map<string, { in?: number; out?: number; employee_id: string }>();
  for (const e of entries) {
    const key = pairsKey(e);
    const p = pairs.get(key) ?? { employee_id: e.employee_id };
    const t = new Date(e.occurred_at).getTime();
    if (e.kind === "check_in") p.in = t;
    else if (e.kind === "check_out") p.out = t;
    pairs.set(key, p);
  }
  const hoursByEmp = new Map<string, number>();
  for (const p of pairs.values()) {
    if (p.in == null || p.out == null) continue;
    const h = (p.out - p.in) / 3_600_000;
    hoursByEmp.set(p.employee_id, (hoursByEmp.get(p.employee_id) ?? 0) + h);
  }

  return emps.map((e) => ({
    employee_id: e.id,
    full_name: e.full_name,
    hours_this_week: Math.round((hoursByEmp.get(e.id) ?? 0) * 10) / 10,
    weekly_target: e.weekly_hours ?? 40,
  }));
}

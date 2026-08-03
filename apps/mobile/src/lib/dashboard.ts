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
  endOfWeek,
  startOfDay,
  endOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type OrgKpis = {
  activeClients: number;
  properties: number;
  todayShifts: number;
  todayPendingCheckins: number;
  openInvoiceCents: number;
  overdueCount: number;
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
    clients: { active: number };
    properties: { total: number };
    shifts_today: { scheduled: number; pending_checkins: number };
    invoices: { open_cents: number; overdue_count: number };
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
    };
  }

  // Fallback: parallel count fan-out (mirrors the web loader).
  const [c, p, sh, pending, inv, over] = await Promise.all([
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
  ]);
  const invRows = (inv.data ?? []) as Array<{ total_cents: number | null }>;
  return {
    activeClients: c.count ?? 0,
    properties: p.count ?? 0,
    todayShifts: sh.count ?? 0,
    todayPendingCheckins: pending.count ?? 0,
    openInvoiceCents: invRows.reduce(
      (s, r) => s + Number(r.total_cents ?? 0),
      0,
    ),
    overdueCount: over.count ?? 0,
  };
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

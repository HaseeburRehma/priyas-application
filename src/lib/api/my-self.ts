import "server-only";
import {
  startOfMonth,
  startOfWeek,
  endOfMonth,
  endOfWeek,
} from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Self-service data for field staff — drives the "My hours" /
 * "Mein Profil" panel on the dashboard. Spec §3.3 maps to:
 *   • Own current and upcoming assignments → covered by /schedule
 *   • Submit vacation requests           → /vacation
 *   • View assigned task lists           → handled per-shift
 *   • Use team chat                      → /chat
 *
 * The widget itself focuses on the at-a-glance numbers a field-staff
 * member actually wants when they open the app: this-week and
 * this-month hours, vacation balance, and outstanding mandatory
 * training. Plus a "download my hours" button (handled by
 * /api/reports/working-time?employee=ME).
 *
 * Returns null when the caller isn't linked to an `employees` row
 * (e.g. admin or dispatcher with no field-staff hat).
 */
export type MySelfData = {
  employee_id: string;
  full_name: string;
  hours_this_week: number;
  hours_this_month: number;
  weekly_target: number;
  vacation_used: number;
  vacation_total: number;
  outstanding_mandatory: Array<{ id: string; title: string }>;
  upcoming_shifts: Array<{
    id: string;
    starts_at: string;
    ends_at: string;
    property_name: string;
    client_name: string;
  }>;
};

export async function loadMySelf(): Promise<MySelfData | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: emp } = await ((supabase.from("employees") as any))
    .select("id, full_name, weekly_hours")
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  type Emp = {
    id: string;
    full_name: string;
    weekly_hours: number | null;
  };
  const me = emp as Emp | null;
  if (!me) return null;

  const now = new Date();
  const ws = startOfWeek(now, { weekStartsOn: 1 });
  const we = endOfWeek(now, { weekStartsOn: 1 });
  const ms = startOfMonth(now);
  const me_ = endOfMonth(now);

  // Hours from time_entries paired to shifts. We sum durations from
  // (check_in.occurred_at, check_out.occurred_at) per (shift, employee).
  const monthEntries = await supabase
    .from("time_entries")
    .select("shift_id, kind, occurred_at")
    .eq("employee_id", me.id)
    .gte("occurred_at", ms.toISOString())
    .lte("occurred_at", me_.toISOString());

  type Pair = { in?: number; out?: number };
  const byShift = new Map<string, Pair>();
  for (const r of (monthEntries.data ?? []) as Array<{
    shift_id: string;
    kind: "check_in" | "check_out";
    occurred_at: string;
  }>) {
    const p = byShift.get(r.shift_id) ?? {};
    const t = new Date(r.occurred_at).getTime();
    if (r.kind === "check_in") p.in = t;
    if (r.kind === "check_out") p.out = t;
    byShift.set(r.shift_id, p);
  }

  let hours_this_week = 0;
  let hours_this_month = 0;
  for (const p of byShift.values()) {
    if (p.in == null || p.out == null) continue;
    const h = (p.out - p.in) / 36e5;
    hours_this_month += h;
    if (p.in >= ws.getTime() && p.in <= we.getTime()) hours_this_week += h;
  }

  // Approved vacation days used this year.
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: vacRows } = await ((supabase.from("vacation_requests") as any))
    .select("days, status")
    .eq("employee_id", me.id)
    .eq("status", "approved")
    .gte("start_date", yearStart);
  const vacation_used = ((vacRows ?? []) as Array<{ days: number }>).reduce(
    (s, r) => s + Number(r.days ?? 0),
    0,
  );

  // Outstanding mandatory training. Reuse the same logic that
  // src/lib/training/lock.ts does for a single employee.
  const { data: mods } = await supabase
    .from("training_modules")
    .select("id, title")
    .eq("is_mandatory", true)
    .is("deleted_at", null);
  const mandatory = ((mods ?? []) as Array<{ id: string; title: string }>);
  let outstanding_mandatory: Array<{ id: string; title: string }> = [];
  if (mandatory.length > 0) {
    const moduleIds = mandatory.map((m) => m.id);
    const { data: assignments } = await supabase
      .from("training_assignments")
      .select("module_id, employee_id")
      .in("module_id", moduleIds);
    type A = { module_id: string; employee_id: string };
    const assignList = (assignments ?? []) as A[];
    const hasAnyAssignment = new Set(assignList.map((a) => a.module_id));
    const assignedToMe = new Set(
      assignList.filter((a) => a.employee_id === me.id).map((a) => a.module_id),
    );
    const applicable = mandatory.filter(
      (m) => !hasAnyAssignment.has(m.id) || assignedToMe.has(m.id),
    );
    if (applicable.length > 0) {
      const { data: progress } = await supabase
        .from("employee_training_progress")
        .select("module_id, completed_at")
        .eq("employee_id", me.id)
        .in(
          "module_id",
          applicable.map((m) => m.id),
        );
      const completed = new Set(
        ((progress ?? []) as Array<{
          module_id: string;
          completed_at: string | null;
        }>)
          .filter((p) => p.completed_at)
          .map((p) => p.module_id),
      );
      outstanding_mandatory = applicable.filter((m) => !completed.has(m.id));
    }
  }

  // Next 5 upcoming shifts.
  const { data: shiftRows } = await supabase
    .from("shifts")
    .select(
      `id, starts_at, ends_at,
       property:properties ( id, name, client:clients ( id, display_name ) )`,
    )
    .eq("employee_id", me.id)
    .is("deleted_at", null)
    .gte("starts_at", now.toISOString())
    .order("starts_at", { ascending: true })
    .limit(5);
  type ShiftRow = {
    id: string;
    starts_at: string;
    ends_at: string;
    property: {
      id: string;
      name: string;
      client: { id: string; display_name: string } | null;
    } | null;
  };
  const upcoming_shifts = ((shiftRows ?? []) as unknown as ShiftRow[]).map(
    (s) => ({
      id: s.id,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      property_name: s.property?.name ?? "—",
      client_name: s.property?.client?.display_name ?? "—",
    }),
  );

  return {
    employee_id: me.id,
    full_name: me.full_name,
    hours_this_week: Math.round(hours_this_week * 10) / 10,
    hours_this_month: Math.round(hours_this_month * 10) / 10,
    weekly_target: me.weekly_hours ?? 40,
    vacation_used,
    vacation_total: 30,
    outstanding_mandatory,
    upcoming_shifts,
  };
}

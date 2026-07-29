/**
 * Personal-scope loader — mirrors `src/lib/api/my-self.ts` in the web
 * app. Returns the caller's own weekly / monthly hours, vacation
 * balance, upcoming shifts, and outstanding mandatory training.
 *
 * The shape matches what `MySelfPanel` on the web renders so the
 * mobile home screen can stay visually aligned.
 */

import {
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { getSupabase } from "@/lib/supabase";

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
    status: string;
  }>;
};

export async function loadMySelf(): Promise<MySelfData | null> {
  const supabase = getSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Best-effort employees row. Anyone without a linked employee record
  // gets `null` here — the home screen renders an empty state.
  const { data: empRow } = await supabase
    .from("employees")
    .select("id, full_name, weekly_hours")
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  type Emp = {
    id: string;
    full_name: string;
    weekly_hours: number | null;
  };
  const me = empRow as Emp | null;
  if (!me) return null;

  const now = new Date();
  const ws = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
  const we = endOfWeek(now, { weekStartsOn: 1 }).toISOString();
  const ms = startOfMonth(now).toISOString();
  const me_ = endOfMonth(now).toISOString();

  // Fetch time_entries for the month; then split week / month sums
  // by pair (check_in, check_out) per shift. Doing it in JS is cheap
  // enough — a month of one employee is bounded.
  const { data: entriesRaw } = await supabase
    .from("time_entries")
    .select("shift_id, kind, occurred_at")
    .eq("employee_id", me.id)
    .gte("occurred_at", ms)
    .lte("occurred_at", me_)
    .order("occurred_at", { ascending: true });

  type Entry = {
    shift_id: string;
    kind: "check_in" | "check_out" | "break_start" | "break_end";
    occurred_at: string;
  };
  const entries = (entriesRaw ?? []) as Entry[];

  const pairs: Record<string, { in?: string; out?: string }> = {};
  for (const e of entries) {
    if (e.kind === "check_in") {
      pairs[e.shift_id] = { ...pairs[e.shift_id], in: e.occurred_at };
    } else if (e.kind === "check_out") {
      pairs[e.shift_id] = { ...pairs[e.shift_id], out: e.occurred_at };
    }
  }

  let hoursWeek = 0;
  let hoursMonth = 0;
  for (const p of Object.values(pairs)) {
    if (!p.in || !p.out) continue;
    const inMs = new Date(p.in).getTime();
    const outMs = new Date(p.out).getTime();
    const hours = Math.max(0, (outMs - inMs) / 3_600_000);
    hoursMonth += hours;
    if (p.in >= ws && p.in <= we) hoursWeek += hours;
  }

  // Vacation — days used YTD from vacation_requests table.
  const { data: vacRaw } = await supabase
    .from("vacation_requests")
    .select("start_date, end_date, status")
    .eq("employee_id", me.id)
    .in("status", ["approved", "pending"]);
  const vacRows =
    (vacRaw ?? []) as Array<{ start_date: string; end_date: string; status: string }>;
  const vacationUsed = vacRows.reduce((s, r) => {
    const days =
      Math.round(
        (new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) /
          86_400_000,
      ) + 1;
    return s + Math.max(0, days);
  }, 0);

  // Outstanding mandatory training. RPC exists on the DB side but we
  // read the rows directly for portability — the mobile app doesn't
  // rely on custom RPCs to keep the surface minimal.
  const { data: trainRaw } = await supabase
    .from("employee_training_progress")
    .select("module_id, completed_at, training_modules!inner(id, title, is_mandatory)")
    .eq("employee_id", me.id)
    .is("completed_at", null);
  type TRow = {
    module_id: string;
    training_modules: { id: string; title: string; is_mandatory: boolean };
  };
  const outstanding = ((trainRaw ?? []) as unknown as TRow[])
    .filter((r) => r.training_modules?.is_mandatory)
    .map((r) => ({ id: r.training_modules.id, title: r.training_modules.title }));

  // Upcoming shifts — next 5 assigned to me.
  const { data: shRaw } = await supabase
    .from("shifts")
    .select(
      "id, starts_at, ends_at, status, properties!inner(id, name, clients!inner(id, name))",
    )
    .eq("employee_id", me.id)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(5);

  type SRow = {
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    properties: {
      id: string;
      name: string;
      clients: { id: string; name: string };
    };
  };
  const upcoming = ((shRaw ?? []) as unknown as SRow[]).map((s) => ({
    id: s.id,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    property_name: s.properties.name,
    client_name: s.properties.clients.name,
    status: s.status,
  }));

  return {
    employee_id: me.id,
    full_name: me.full_name,
    hours_this_week: hoursWeek,
    hours_this_month: hoursMonth,
    weekly_target: me.weekly_hours ?? 40,
    vacation_used: vacationUsed,
    vacation_total: 30,
    outstanding_mandatory: outstanding,
    upcoming_shifts: upcoming,
  };
}

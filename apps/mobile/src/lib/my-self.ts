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
    /** Street line of the property ("Hauptstraße 12"). Optional so rows
     *  restored from an older persisted cache still type-check. */
    address_line1?: string | null;
    /** One-line postal address ("Hauptstraße 12, 10115 Berlin") for
     *  display + handing to the native maps app. */
    address?: string | null;
    /** Client service line — "alltagshilfe" vs. the Priya's cleaning lines. */
    customer_type?: string | null;
  }>;
};

/** How many upcoming shifts `loadMySelf` returns. */
export const UPCOMING_LIMIT = 5;

/** "Hauptstraße 12, 10115 Berlin" — null when the property has no street. */
function formatAddress(p: {
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
}): string | null {
  const street = p.address_line1?.trim();
  if (!street) return null;
  const town = [p.postal_code?.trim(), p.city?.trim()].filter(Boolean).join(" ");
  return town ? `${street}, ${town}` : street;
}

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

  // Fan out all independent queries in parallel — 5 sequential round-trips → 2
  const [entriesRaw, vacRaw, trainRaw, shRaw] = await Promise.all([
    supabase
      .from("time_entries")
      .select("shift_id, kind, occurred_at")
      .eq("employee_id", me.id)
      .gte("occurred_at", ms)
      .lte("occurred_at", me_)
      .order("occurred_at", { ascending: true }),
    supabase
      .from("vacation_requests")
      .select("start_date, end_date, status")
      .eq("employee_id", me.id)
      .in("status", ["approved", "pending"]),
    supabase
      .from("employee_training_progress")
      .select("module_id, completed_at, training_modules!inner(id, title, is_mandatory)")
      .eq("employee_id", me.id)
      .is("completed_at", null),
    // Column names follow the DB schema (clients.display_name,
    // properties.address_line1/postal_code/city) — the earlier
    // `clients(name)` select errored, so this list was always empty.
    // `ends_at >= now` keeps a shift that already started (but hasn't
    // ended) as the "next" one; finished / cancelled shifts are skipped
    // like the web MySelfPanel does.
    supabase
      .from("shifts")
      .select(
        "id, starts_at, ends_at, status, properties!inner(id, name, address_line1, postal_code, city, clients!inner(id, display_name, customer_type))",
      )
      .eq("employee_id", me.id)
      .is("deleted_at", null)
      .gte("ends_at", new Date().toISOString())
      .not("status", "in", '("completed","cancelled","no_show")')
      .order("starts_at", { ascending: true })
      .limit(UPCOMING_LIMIT),
  ]);

  type Entry = {
    shift_id: string;
    kind: "check_in" | "check_out" | "break_start" | "break_end";
    occurred_at: string;
  };
  const entries = (entriesRaw.data ?? []) as Entry[];

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
  const vacRows =
    (vacRaw.data ?? []) as Array<{ start_date: string; end_date: string; status: string }>;
  const vacationUsed = vacRows.reduce((s, r) => {
    const days =
      Math.round(
        (new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) /
          86_400_000,
      ) + 1;
    return s + Math.max(0, days);
  }, 0);

  // Outstanding mandatory training.
  type TRow = {
    module_id: string;
    training_modules: { id: string; title: string; is_mandatory: boolean };
  };
  const outstanding = ((trainRaw.data ?? []) as unknown as TRow[])
    .filter((r) => r.training_modules?.is_mandatory)
    .map((r) => ({ id: r.training_modules.id, title: r.training_modules.title }));

  // Upcoming shifts — next UPCOMING_LIMIT assigned to me.
  type SRow = {
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    properties: {
      id: string;
      name: string;
      address_line1: string | null;
      postal_code: string | null;
      city: string | null;
      clients: { id: string; display_name: string; customer_type: string | null };
    };
  };
  const upcoming = ((shRaw.data ?? []) as unknown as SRow[]).map((s) => ({
    id: s.id,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    property_name: s.properties.name,
    client_name: s.properties.clients.display_name,
    status: s.status,
    address_line1: s.properties.address_line1,
    address: formatAddress(s.properties),
    customer_type: s.properties.clients.customer_type,
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

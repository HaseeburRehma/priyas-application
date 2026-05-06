import "server-only";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  EmployeeDetail,
  EmployeeRoleChip,
  EmployeeRow,
  EmployeeStatus,
  EmployeesListParams,
  EmployeesListResult,
  EmployeesSummary,
} from "./employees.types";

export type {
  EmployeeDetail,
  EmployeeRoleChip,
  EmployeeRow,
  EmployeeStatus,
  EmployeesListParams,
  EmployeesListResult,
  EmployeesSummary,
} from "./employees.types";

const TONES = ["primary", "secondary", "accent", "warning"] as const;
const TEAM_TONES = ["secondary", "primary", "warning"] as const;
const TEAM_LABELS = [
  "Team 01 · Core",
  "Team 02 · Floating",
  "Team 03 · Specialists",
];

const initialsOf = (n: string | null | undefined) =>
  (n ?? "—")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

function inferRoleChip(idx: number): EmployeeRoleChip {
  // Until we model roles per-employee in DB, derive from index for the demo.
  if (idx === 0 || idx % 9 === 5) return "pm";
  if (idx % 7 === 6) return "trainee";
  return "field";
}

/* ============================================================================
 * Summary
 * ========================================================================== */
export async function loadEmployeesSummary(): Promise<EmployeesSummary> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalRes, monthRes, leaveRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "on_leave"),
  ]);

  // Active today = employees with a shift starting today.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const { data: shiftsToday } = await supabase
    .from("shifts")
    .select("employee_id")
    .gte("starts_at", today.toISOString())
    .lt("starts_at", tomorrow.toISOString())
    .is("deleted_at", null);
  const activeIds = new Set(
    ((shiftsToday ?? []) as Array<{ employee_id: string | null }>).flatMap((r) =>
      r.employee_id ? [r.employee_id] : [],
    ),
  );

  return {
    total: totalRes.count ?? 0,
    activeToday: activeIds.size,
    onLeave: leaveRes.count ?? 0,
    pendingOnboarding: 1, // placeholder until onboarding state lands
    newThisMonth: monthRes.count ?? 0,
  };
}

/* ============================================================================
 * Paginated list
 * ========================================================================== */
export async function loadEmployeesList(
  params: EmployeesListParams = {},
): Promise<EmployeesListResult> {
  const {
    q = "",
    role = "all",
    status = "all",
    page = 1,
    pageSize = 25,
    sort = "name",
    direction = "asc",
  } = params;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("employees")
    .select(
      "id, full_name, email, phone, hire_date, status, weekly_hours, hourly_rate_eur",
      { count: "exact" },
    )
    .is("deleted_at", null);

  if (q) {
    const safe = q.replace(/[%_]/g, "");
    query = query.or(
      `full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
    );
  }
  if (status !== "all") query = query.eq("status", status);

  query = query.order(sort === "name" ? "full_name" : "full_name", {
    ascending: direction === "asc",
  });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count } = await query;

  type DbRow = {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    hire_date: string | null;
    status: EmployeeStatus;
    weekly_hours: number | null;
    hourly_rate_eur: number | null;
  };
  const dbRows = (data ?? []) as DbRow[];

  // Hours this week from shifts.
  const ids = dbRows.map((r) => r.id);
  const weeklyHoursByEmp = new Map<string, number>();
  if (ids.length > 0) {
    const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
    const we = endOfWeek(new Date(), { weekStartsOn: 1 });
    const { data: shifts } = await supabase
      .from("shifts")
      .select("employee_id, starts_at, ends_at")
      .in("employee_id", ids)
      .is("deleted_at", null)
      .gte("starts_at", ws.toISOString())
      .lte("starts_at", we.toISOString());
    for (const s of (shifts ?? []) as Array<{
      employee_id: string | null;
      starts_at: string;
      ends_at: string;
    }>) {
      if (!s.employee_id) continue;
      const h =
        (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) /
        3_600_000;
      weeklyHoursByEmp.set(
        s.employee_id,
        (weeklyHoursByEmp.get(s.employee_id) ?? 0) + h,
      );
    }
  }

  const rows: EmployeeRow[] = dbRows
    .map((r, idx): EmployeeRow => {
      const target = r.weekly_hours ?? 40;
      const hours = Math.round(weeklyHoursByEmp.get(r.id) ?? 0);
      const overtime = hours > target;
      const role = inferRoleChip(idx);
      const teamIdx = idx % 3;
      return {
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        phone: r.phone,
        initials: initialsOf(r.full_name),
        tone: TONES[idx % TONES.length] ?? "primary",
        meta: r.hire_date
          ? `DE · EN · ${role === "pm" ? "Projektleitung" : role === "trainee" ? "Trainee" : "Reinigungskraft"} since ${new Date(r.hire_date).getFullYear()}`
          : "DE · EN",
        role_chip: role,
        team_label: TEAM_LABELS[teamIdx] ?? "Team",
        team_tone: TEAM_TONES[teamIdx] ?? "secondary",
        hours_this_week: hours,
        weekly_target: target,
        status: overtime ? "overtime" : (r.status as EmployeeStatus),
        vacation_used: 0,
        vacation_total: 30,
        vacation_label: `${30 - 0} / 30`,
        med_cert: idx === 3,
      };
    })
    .filter((r) => role === "all" || r.role_chip === role);

  return { rows, total: count ?? 0 };
}

/* ============================================================================
 * Detail
 * ========================================================================== */
export async function loadEmployeeDetail(id: string): Promise<EmployeeDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("employees")
    .select(
      "id, full_name, email, phone, hire_date, status, weekly_hours, hourly_rate_eur",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  type Row = {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    hire_date: string | null;
    status: EmployeeStatus;
    weekly_hours: number | null;
    hourly_rate_eur: number | null;
  };
  const r = data as Row | null;
  if (!r) return null;

  const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
  const we = endOfWeek(new Date(), { weekStartsOn: 1 });
  const ms = startOfMonth(new Date());
  const me = endOfMonth(new Date());

  const [thisWeekRes, thisMonthRes, totalRes, upcomingRes, recentTimeRes] = await Promise.all([
    supabase
      .from("shifts")
      .select("starts_at, ends_at")
      .eq("employee_id", id)
      .is("deleted_at", null)
      .gte("starts_at", ws.toISOString())
      .lte("starts_at", we.toISOString()),
    supabase
      .from("shifts")
      .select("starts_at, ends_at, id", { count: "exact" })
      .eq("employee_id", id)
      .is("deleted_at", null)
      .gte("starts_at", ms.toISOString())
      .lte("starts_at", me.toISOString()),
    supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", id)
      .is("deleted_at", null),
    supabase
      .from("shifts")
      .select(
        `id, starts_at, ends_at,
         property:properties ( name, client:clients ( display_name ) )`,
      )
      .eq("employee_id", id)
      .is("deleted_at", null)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(8),
    supabase
      .from("time_entries")
      .select(
        `id, check_in_at, check_out_at,
         shift:shifts ( property:properties ( name ) )`,
      )
      .eq("employee_id", id)
      .order("check_in_at", { ascending: false })
      .limit(8),
  ]);

  const hoursOf = (
    rows: Array<{ starts_at: string; ends_at: string }>,
  ) =>
    rows.reduce(
      (s, r) =>
        s +
        (new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) /
          3_600_000,
      0,
    );
  const hoursThisWeek = Math.round(
    hoursOf((thisWeekRes.data ?? []) as Array<{ starts_at: string; ends_at: string }>),
  );
  const hoursThisMonth = Math.round(
    hoursOf((thisMonthRes.data ?? []) as Array<{ starts_at: string; ends_at: string }>),
  );

  type UpcomingRow = {
    id: string;
    starts_at: string;
    ends_at: string;
    property: { name: string; client: { display_name: string } | null } | null;
  };
  const upcoming = ((upcomingRes.data ?? []) as unknown as UpcomingRow[]).map((s) => ({
    id: s.id,
    starts_at: s.starts_at,
    property_name: s.property?.name ?? "—",
    client_name: s.property?.client?.display_name ?? "—",
    duration_h:
      (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) /
      3_600_000,
  }));

  type TimeRow = {
    id: string;
    check_in_at: string;
    check_out_at: string | null;
    shift: { property: { name: string } | null } | null;
  };
  const recent = ((recentTimeRes.data ?? []) as unknown as TimeRow[]).map((t) => ({
    id: t.id,
    check_in_at: t.check_in_at,
    check_out_at: t.check_out_at,
    property_name: t.shift?.property?.name ?? "—",
    hours:
      t.check_out_at
        ? (new Date(t.check_out_at).getTime() -
            new Date(t.check_in_at).getTime()) /
          3_600_000
        : 0,
  }));

  return {
    id: r.id,
    full_name: r.full_name,
    email: r.email,
    phone: r.phone,
    initials: initialsOf(r.full_name),
    tone: "primary",
    hire_date: r.hire_date,
    status: r.status,
    role_chip: inferRoleChip(0),
    team_label: TEAM_LABELS[0] ?? "Team",
    hourly_rate_eur: r.hourly_rate_eur,
    weekly_hours: r.weekly_hours ?? 40,
    hours_this_week: hoursThisWeek,
    hours_this_month: hoursThisMonth,
    shifts_this_month: thisMonthRes.count ?? 0,
    shifts_total: totalRes.count ?? 0,
    vacation_used: 0,
    vacation_total: 30,
    upcoming_shifts: upcoming,
    recent_time_entries: recent,
  };
}

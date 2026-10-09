/**
 * Employees loaders for the mobile Employees screen.
 *
 * Admin + dispatcher only — RLS enforces this on both endpoints; the
 * screen is also hidden from field staff at the More hub. Kept
 * read-first: mobile is for looking up someone in the field, editing
 * lives on the web wizard.
 *
 * Column note (2026-10): the original selects asked for `role`,
 * `service_line`, `employment_type`, `hourly_cost_cents` and
 * `weekly_hours_target`, none of which any migration declares (see
 * docs/PERF_AUDIT_CLIENT_EMP.md, appendix). PostgREST rejects the whole
 * query when one column is unknown, so the loaders now read the real
 * columns the web app writes (`profiles.role`, `service_type`,
 * `weekly_hours`, `hourly_rate_eur`, …) and map them onto the same
 * exported field names, so callers keep working unchanged.
 */

import { addDays, startOfWeek, subDays } from "date-fns";
import { getSupabase } from "@/lib/supabase";

export type EmployeeStatus = "active" | "on_leave" | "inactive" | "terminated";
export type EmployeeAvailability = "active" | "inactive" | "on_vacation" | "sick";
export type EmployeeRole =
  | "admin"
  | "dispatcher"
  | "employee"
  | "auditor"
  | "customer_contact";

export type EmployeeRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: EmployeeRole | null;
  status: EmployeeStatus;
  service_line: "priya" | "alltagshilfe" | null;
  employment_type: string | null;
  /* ---- Optional, added for the 2026-10 redesign (all real data) ---- */
  /** Availability axis (separate from employment status). */
  availability_status?: EmployeeAvailability | null;
  city?: string | null;
  hire_date?: string | null;
  /** Contracted hours per week (`employees.weekly_hours`). */
  weekly_hours?: number | null;
  /** Planned hours this week (Mon–Sun) from non-cancelled shifts. */
  hours_this_week?: number;
  /** At least one non-cancelled shift starts today. */
  on_shift_today?: boolean;
  /** Annual vacation entitlement (`employees.vacation_days_per_year`). */
  vacation_days_per_year?: number | null;
  /** Approved vacation days starting in the current calendar year. */
  vacation_days_taken?: number;
};

export type EmployeeShiftBrief = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  property_name: string | null;
  client_name: string | null;
  address: string | null;
};

export type EmployeeLeaveBrief = {
  id: string;
  kind: string;
  status: string;
  start_date: string;
  end_date: string;
  days: number;
};

export type EmployeeTrainingSummary = {
  /** Modules that apply to this employee (unassigned = everyone). */
  total: number;
  completed: number;
  /** First outstanding module (mandatory first), if any. */
  next_title: string | null;
};

export type EmployeeDetail = EmployeeRow & {
  hourly_cost_cents: number | null;
  weekly_hours_target: number | null;
  contract_start: string | null;
  skills: string[];
  notes: string | null;
  /* ---- Optional, added for the 2026-10 redesign ---- */
  /** Shift with status `in_progress` (checked in), if any. */
  current_shift?: EmployeeShiftBrief | null;
  /** Next scheduled shifts, soonest first. */
  upcoming_shifts?: EmployeeShiftBrief[];
  /** Scheduled shifts still ahead in the current week. */
  upcoming_this_week?: number;
  /** Completed shifts in the last 90 days. */
  shifts_last_90_days?: number;
  /** This year's approved + pending leave requests. */
  leave?: EmployeeLeaveBrief[];
  training?: EmployeeTrainingSummary | null;
};

type DbEmployee = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: EmployeeStatus;
  availability_status: EmployeeAvailability | null;
  hire_date: string | null;
  weekly_hours: number | string | null;
  vacation_days_per_year: number | null;
  service_type: "priya" | "alltagshilfe" | "both" | null;
  city: string | null;
  profile: { role: EmployeeRole | null } | null;
};

const LIST_COLUMNS = `id, full_name, email, phone, status, availability_status,
  hire_date, weekly_hours, vacation_days_per_year, service_type, city,
  profile:profiles ( role )`;

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapEmployee(r: DbEmployee): EmployeeRow {
  return {
    id: r.id,
    full_name: r.full_name,
    email: r.email,
    phone: r.phone,
    role: r.profile?.role ?? null,
    status: r.status,
    // 'both' means "works in either line" — not a single service line.
    service_line:
      r.service_type === "priya" || r.service_type === "alltagshilfe"
        ? r.service_type
        : null,
    employment_type: null,
    availability_status: r.availability_status ?? null,
    city: r.city,
    hire_date: r.hire_date,
    weekly_hours: num(r.weekly_hours),
    vacation_days_per_year: r.vacation_days_per_year,
  };
}

function hoursBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000);
}

function isSameLocalDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

export async function loadMobileEmployees(args: {
  q?: string;
  serviceLine?: "priya" | "alltagshilfe" | "all";
}): Promise<EmployeeRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("employees")
    .select(LIST_COLUMNS)
    .is("deleted_at", null)
    .order("full_name", { ascending: true })
    .limit(300);

  if (args.q && args.q.trim()) {
    const safe = args.q.trim().replace(/[,()\\%_]/g, "");
    if (safe) {
      query = query.or(
        `full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
      );
    }
  }
  if (args.serviceLine && args.serviceLine !== "all") {
    // Employees flagged 'both' work in either line, so they belong in
    // both filtered views.
    query = query.in("service_type", [args.serviceLine, "both"]);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = ((data ?? []) as unknown as DbEmployee[]).map(mapEmployee);
  if (rows.length === 0) return rows;

  // Week workload + this year's vacation. Both are org-scoped by RLS, so
  // no `.in(ids)` (keeps the URL short for large teams). Failures leave
  // the optional fields undefined — the list still renders.
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);
  const year = now.getFullYear();
  const [shiftsRes, leaveRes] = await Promise.all([
    supabase
      .from("shifts")
      .select("employee_id, starts_at, ends_at, status")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .gte("starts_at", weekStart.toISOString())
      .lt("starts_at", weekEnd.toISOString())
      .limit(5000),
    supabase
      .from("vacation_requests")
      .select("employee_id, days, kind")
      .eq("status", "approved")
      .eq("kind", "vacation")
      .gte("start_date", `${year}-01-01`)
      .lte("start_date", `${year}-12-31`)
      .limit(5000),
  ]);

  const hours = new Map<string, number>();
  const today = new Set<string>();
  if (!shiftsRes.error) {
    for (const s of (shiftsRes.data ?? []) as Array<{
      employee_id: string | null;
      starts_at: string;
      ends_at: string;
    }>) {
      if (!s.employee_id) continue;
      hours.set(s.employee_id, (hours.get(s.employee_id) ?? 0) + hoursBetween(s.starts_at, s.ends_at));
      if (isSameLocalDay(s.starts_at, now)) today.add(s.employee_id);
    }
  }
  const taken = new Map<string, number>();
  if (!leaveRes.error) {
    for (const v of (leaveRes.data ?? []) as Array<{
      employee_id: string;
      days: number | string;
    }>) {
      taken.set(v.employee_id, (taken.get(v.employee_id) ?? 0) + (num(v.days) ?? 0));
    }
  }

  return rows.map((r) => ({
    ...r,
    ...(shiftsRes.error
      ? {}
      : { hours_this_week: hours.get(r.id) ?? 0, on_shift_today: today.has(r.id) }),
    ...(leaveRes.error ? {} : { vacation_days_taken: taken.get(r.id) ?? 0 }),
  }));
}

export async function loadMobileEmployeeDetail(
  id: string,
): Promise<EmployeeDetail | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("employees")
    .select(
      `${LIST_COLUMNS}, hourly_rate_eur, contract_start, notes`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as DbEmployee & {
    hourly_rate_eur: number | string | null;
    contract_start: string | null;
    notes: string | null;
  };

  const now = new Date();
  const year = now.getFullYear();
  const weekEnd = addDays(startOfWeek(now, { weekStartsOn: 1 }), 7);

  // Everything below is optional decoration — each query degrades to
  // "section hidden" on error instead of failing the whole screen.
  const [skillsRes, shiftsRes, leaveRes, modulesRes, assignRes, progressRes] =
    await Promise.all([
      // Skills live on a separate join table in the web schema; keep the
      // mobile detail resilient to it being missing (older orgs may not
      // have any rows) by not throwing on error.
      supabase.from("employee_skills").select("skill").eq("employee_id", id),
      supabase
        .from("shifts")
        .select(
          `id, starts_at, ends_at, status,
           property:properties ( name, address_line1, postal_code, city,
             client:clients ( display_name ) )`,
        )
        .eq("employee_id", id)
        .is("deleted_at", null)
        .gte("starts_at", subDays(now, 90).toISOString())
        .lte("starts_at", addDays(now, 21).toISOString())
        .order("starts_at", { ascending: true })
        .limit(1000),
      supabase
        .from("vacation_requests")
        .select("id, kind, status, start_date, end_date, days")
        .eq("employee_id", id)
        .in("status", ["approved", "pending"])
        .gte("end_date", `${year}-01-01`)
        .lte("start_date", `${year}-12-31`)
        .order("start_date", { ascending: true }),
      supabase
        .from("training_modules")
        .select("id, title, is_mandatory, position")
        .is("deleted_at", null)
        .order("position", { ascending: true }),
      supabase.from("training_assignments").select("module_id, employee_id").limit(5000),
      supabase
        .from("employee_training_progress")
        .select("module_id, completed_at")
        .eq("employee_id", id),
    ]);

  // ---- Shifts → current / upcoming / last-90-days ----
  type DbShift = {
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    property: {
      name: string | null;
      address_line1: string | null;
      postal_code: string | null;
      city: string | null;
      client: { display_name: string | null } | null;
    } | null;
  };
  const brief = (s: DbShift): EmployeeShiftBrief => ({
    id: s.id,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    status: s.status,
    property_name: s.property?.name ?? null,
    client_name: s.property?.client?.display_name ?? null,
    address:
      [s.property?.address_line1, [s.property?.postal_code, s.property?.city].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ") || null,
  });
  let shiftExtras: Partial<EmployeeDetail> = {};
  if (!shiftsRes.error) {
    const shifts = (shiftsRes.data ?? []) as unknown as DbShift[];
    const nowMs = now.getTime();
    const inProgress = shifts.filter((s) => s.status === "in_progress");
    const upcoming = shifts.filter(
      (s) => s.status === "scheduled" && new Date(s.starts_at).getTime() > nowMs,
    );
    shiftExtras = {
      current_shift: inProgress.length > 0 ? brief(inProgress[inProgress.length - 1]!) : null,
      upcoming_shifts: upcoming.slice(0, 3).map(brief),
      upcoming_this_week: upcoming.filter((s) => new Date(s.starts_at) < weekEnd).length,
      shifts_last_90_days: shifts.filter(
        (s) => s.status === "completed" && new Date(s.starts_at).getTime() <= nowMs,
      ).length,
      hours_this_week: shifts
        .filter(
          (s) =>
            s.status !== "cancelled" &&
            new Date(s.starts_at) >= startOfWeek(now, { weekStartsOn: 1 }) &&
            new Date(s.starts_at) < weekEnd,
        )
        .reduce((sum, s) => sum + hoursBetween(s.starts_at, s.ends_at), 0),
    };
  }

  // ---- Training: modules that apply (unassigned = everyone) ----
  let training: EmployeeTrainingSummary | null = null;
  if (!modulesRes.error && !assignRes.error && !progressRes.error) {
    const modules = (modulesRes.data ?? []) as Array<{
      id: string;
      title: string;
      is_mandatory: boolean;
    }>;
    const assigns = (assignRes.data ?? []) as Array<{ module_id: string; employee_id: string }>;
    const assigned = new Set(assigns.map((a) => a.module_id));
    const mine = new Set(assigns.filter((a) => a.employee_id === id).map((a) => a.module_id));
    const done = new Set(
      ((progressRes.data ?? []) as Array<{ module_id: string; completed_at: string | null }>)
        .filter((p) => p.completed_at)
        .map((p) => p.module_id),
    );
    const applicable = modules.filter((m) => !assigned.has(m.id) || mine.has(m.id));
    if (applicable.length > 0) {
      const open = applicable.filter((m) => !done.has(m.id));
      const next = open.find((m) => m.is_mandatory) ?? open[0] ?? null;
      training = {
        total: applicable.length,
        completed: applicable.length - open.length,
        next_title: next?.title ?? null,
      };
    }
  }

  return {
    ...mapEmployee(r),
    hourly_cost_cents: num(r.hourly_rate_eur) != null ? Math.round(num(r.hourly_rate_eur)! * 100) : null,
    weekly_hours_target: num(r.weekly_hours),
    contract_start: r.contract_start,
    notes: r.notes,
    skills: ((skillsRes.data ?? []) as Array<{ skill: string }>).map((s) => s.skill),
    ...shiftExtras,
    leave: leaveRes.error
      ? undefined
      : ((leaveRes.data ?? []) as Array<EmployeeLeaveBrief & { days: number | string }>).map(
          (v) => ({ ...v, days: num(v.days) ?? 0 }),
        ),
    training,
  };
}

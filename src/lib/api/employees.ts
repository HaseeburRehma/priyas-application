import "server-only";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeQ } from "@/lib/utils/postgrest-sanitize";
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

// NOTE: TEAM_TONES + TEAM_LABELS removed in 2026-05; the schema doesn't
// model real teams yet, and shipping fake "Team 01 · Core" labels was
// confusing the operations team. team_label / team_tone now come back
// as null and the UI shows a "—" placeholder.

const initialsOf = (n: string | null | undefined) =>
  (n ?? "—")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/**
 * Map a `profiles.role` value (admin/dispatcher/employee) to the
 * Employees-page chip vocabulary (pm/field/trainee).
 *
 *   admin       → pm (project lead / management)
 *   dispatcher  → pm
 *   employee    → field
 *   (no profile) → field (default)
 *
 * "trainee" is currently a placeholder UI category — we'll map there
 * if-and-when the data model adds an explicit "trainee" role or
 * "in_training" status. For now, employees with at least one
 * outstanding mandatory module surface as trainees instead.
 */
function chipFromProfileRole(
  profileRole: "admin" | "dispatcher" | "employee" | null,
  hasOutstandingMandatory: boolean,
): EmployeeRoleChip {
  if (profileRole === "admin" || profileRole === "dispatcher") return "pm";
  if (hasOutstandingMandatory) return "trainee";
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
    .is("deleted_at", null)
    // Defensive cap — single day shouldn't exceed this in practice.
    .limit(1000);
  const activeIds = new Set(
    ((shiftsToday ?? []) as Array<{ employee_id: string | null }>).flatMap((r) =>
      r.employee_id ? [r.employee_id] : [],
    ),
  );

  // "Pending onboarding" — spec §4.9 — employees who haven't yet
  // completed every mandatory training module that applies to them.
  // We compute this by finding active employees with at least one
  // mandatory module that isn't marked complete in
  // employee_training_progress.
  const pendingOnboarding = await countEmployeesPendingOnboarding(supabase);

  return {
    total: totalRes.count ?? 0,
    activeToday: activeIds.size,
    onLeave: leaveRes.count ?? 0,
    pendingOnboarding: pendingOnboarding.count,
    pendingOnboardingPreview: pendingOnboarding.preview,
    newThisMonth: monthRes.count ?? 0,
  };
}

/**
 * Count employees with outstanding mandatory training. Returns the
 * total count and a small preview (first name + days-since-hire) for
 * the dashboard card. Skips employees with no `hire_date` set so the
 * "day N" hint doesn't fall back to confusing values.
 */
async function countEmployeesPendingOnboarding(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ count: number; preview: string | null }> {
  // 1) Mandatory modules.
  const { data: modulesRows } = await supabase
    .from("training_modules")
    .select("id")
    .eq("is_mandatory", true)
    .is("deleted_at", null);
  const mandatoryIds = ((modulesRows ?? []) as Array<{ id: string }>).map(
    (m) => m.id,
  );
  if (mandatoryIds.length === 0) {
    return { count: 0, preview: null };
  }

  // 2) Active employees. We only need IDs up-front — the count below
  //    doesn't need names. Names + hire_date are resolved later for the
  //    single preview row, killing the wide select that would otherwise
  //    pull every active employee's full profile.
  const { data: employees } = await supabase
    .from("employees")
    .select("id")
    .is("deleted_at", null)
    .eq("status", "active")
    .limit(500);
  type Emp = { id: string };
  const empList = (employees ?? []) as Emp[];
  if (empList.length === 0) return { count: 0, preview: null };

  // 3) Completed-progress rows for these employees and these modules.
  const empIds = empList.map((e) => e.id);
  const { data: progress } = await supabase
    .from("employee_training_progress")
    .select("employee_id, module_id, completed_at")
    .in("employee_id", empIds)
    .in("module_id", mandatoryIds);
  const completedSet = new Set(
    ((progress ?? []) as Array<{
      employee_id: string;
      module_id: string;
      completed_at: string | null;
    }>)
      .filter((p) => p.completed_at)
      .map((p) => `${p.employee_id}|${p.module_id}`),
  );

  // 4) Optional: training_assignments narrows which modules apply to
  //    which employees. Modules without any assignments are "shared"
  //    (apply to everyone); modules with assignments only apply to
  //    listed employees.
  const { data: assignments } = await supabase
    .from("training_assignments")
    .select("module_id, employee_id")
    .in("module_id", mandatoryIds);
  type Assign = { module_id: string; employee_id: string };
  const assignmentList = (assignments ?? []) as Assign[];
  const hasAnyAssignment = new Set(assignmentList.map((a) => a.module_id));
  const assignedToByModule = new Map<string, Set<string>>();
  for (const a of assignmentList) {
    let s = assignedToByModule.get(a.module_id);
    if (!s) {
      s = new Set();
      assignedToByModule.set(a.module_id, s);
    }
    s.add(a.employee_id);
  }

  // 5) Bucket employees by whether anything mandatory remains.
  const pending: Emp[] = [];
  for (const e of empList) {
    for (const moduleId of mandatoryIds) {
      const applies =
        !hasAnyAssignment.has(moduleId) ||
        assignedToByModule.get(moduleId)?.has(e.id);
      if (!applies) continue;
      if (!completedSet.has(`${e.id}|${moduleId}`)) {
        pending.push(e);
        break; // one outstanding module is enough to count this person
      }
    }
  }

  // Preview = first pending employee. Resolve full_name + hire_date for
  // ONLY that one row so the heavy select stays out of the loop.
  // "day N" = days since hire.
  let preview: string | null = null;
  const first = pending[0];
  if (first) {
    const { data: firstRow } = await supabase
      .from("employees")
      .select("full_name, hire_date")
      .eq("id", first.id)
      .maybeSingle();
    const r = firstRow as
      | { full_name: string; hire_date: string | null }
      | null;
    if (r) {
      if (r.hire_date) {
        const days = Math.max(
          1,
          Math.round(
            (Date.now() - new Date(r.hire_date).getTime()) / 86_400_000,
          ),
        );
        preview = `${r.full_name} · day ${days}`;
      } else {
        preview = r.full_name;
      }
    }
  }

  return { count: pending.length, preview };
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
    ids,
  } = params;
  const supabase = await createSupabaseServerClient();

  // Canonical query order (mirrors loadClientsList):
  //   1. base select with count: "exact" + soft-delete guard
  //   2. ALL DB-level filters (q, status, …) so `count` reflects the
  //      filtered scope
  //   3. .order()
  //   4. .range() — applied LAST, AFTER filters, so pages slice the
  //      filtered set rather than the unfiltered table.
  //
  // Caveat: `role` is JS-derived (role_chip combines profiles.role with
  // outstanding-training state — see chipFromProfileRole()). When the
  // role filter is active we must fetch the full DB-filtered set,
  // apply the chip filter, and paginate + count in JS so `total` and
  // page boundaries are correct. Otherwise `count` would reflect the
  // unfiltered DB scope and pages would come back short.
  const needsPostFilter = role !== "all";

  let query = supabase
    .from("employees")
    .select(
      `id, full_name, email, phone, hire_date, status, weekly_hours, hourly_rate_eur,
       profile:profiles ( id, role )`,
      { count: "exact" },
    )
    .is("deleted_at", null);

  if (q) {
    // sanitizeQ defends against PostgREST `.or()` filter injection — see
    // src/lib/utils/postgrest-sanitize.ts.
    const safe = sanitizeQ(q);
    if (safe) {
      query = query.or(
        `full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
      );
    }
  }
  if (status !== "all") query = query.eq("status", status);
  // `ids` constrains the universe — used by bulk-export to scope the
  // CSV to the user's current selection.
  if (ids && ids.length > 0) {
    query = query.in("id", [...ids]);
  }

  // Real DB columns only: `name` → full_name, `status` → status. Unknown
  // sort values fall back to `full_name` so we never surface a 400 from
  // a stale URL parameter.
  const sortCol = sort === "status" ? "status" : "full_name";
  query = query.order(sortCol, { ascending: direction === "asc" });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  // Only apply DB range when no JS-derived filters are active.
  if (!needsPostFilter) {
    query = query.range(from, to);
  }

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
    profile: {
      id: string;
      role: "admin" | "dispatcher" | "employee" | null;
    } | null;
  };
  const dbRows = (data ?? []) as unknown as DbRow[];

  // Hours this week from shifts.
  const rowIds = dbRows.map((r) => r.id);
  const weeklyHoursByEmp = new Map<string, number>();
  if (rowIds.length > 0) {
    const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
    const we = endOfWeek(new Date(), { weekStartsOn: 1 });
    const { data: shifts } = await supabase
      .from("shifts")
      .select("employee_id, starts_at, ends_at")
      .in("employee_id", rowIds)
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

  // Compute "has outstanding mandatory training" per employee — drives
  // the "trainee" chip without requiring an explicit DB column.
  const trainingPending = await computeOutstandingMandatoryByEmployee(
    supabase,
    rowIds,
  );

  const allRows: EmployeeRow[] = dbRows.map((r, idx): EmployeeRow => {
    const target = r.weekly_hours ?? 40;
    const hours = Math.round(weeklyHoursByEmp.get(r.id) ?? 0);
    const overtime = hours > target;
    const profileRole = r.profile?.role ?? null;
    const roleChip = chipFromProfileRole(
      profileRole,
      trainingPending.has(r.id),
    );
    // Languages: until we model an explicit per-employee language
    // pref, list both DE and EN as the system defaults. When a
    // profile has `locale` set we surface that as the primary.
    const languages: Array<"de" | "en" | "ta"> = ["de", "en"];
    return {
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      phone: r.phone,
      initials: initialsOf(r.full_name),
      tone: TONES[idx % TONES.length] ?? "primary",
      hire_year: r.hire_date
        ? new Date(r.hire_date).getFullYear()
        : null,
      languages,
      role_chip: roleChip,
      // No real "teams" table yet — surface as null so the UI can
      // show a "—" placeholder rather than fake "Team 01 · Core".
      team_label: null,
      team_tone: null,
      hours_this_week: hours,
      weekly_target: target,
      status: overtime ? "overtime" : (r.status as EmployeeStatus),
      vacation_used: 0,
      vacation_total: 30,
      vacation_label: `${30 - 0} / 30`,
      med_cert: false,
    };
  });

  // When the JS-derived `role` filter is active we paginate in-memory
  // so that `total` reflects the filtered count and the returned page
  // matches the user's filtered view. Otherwise rely on DB-level
  // range above.
  if (needsPostFilter) {
    const filtered = allRows.filter(
      (r) => (role as EmployeeRoleChip | "all") === "all" || r.role_chip === role,
    );
    const paged = filtered.slice(from, from + pageSize);
    return { rows: paged, total: filtered.length };
  }

  return { rows: allRows, total: count ?? 0 };
}

/**
 * For a given list of employee_ids, returns the set of those who have
 * at least one outstanding mandatory training module. Mirrors the
 * logic in src/lib/training/lock.ts but vectorised so the Employees
 * list query stays a constant number of round-trips regardless of
 * page size.
 */
async function computeOutstandingMandatoryByEmployee(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  employeeIds: string[],
): Promise<Set<string>> {
  if (employeeIds.length === 0) return new Set();
  const { data: modules } = await supabase
    .from("training_modules")
    .select("id")
    .eq("is_mandatory", true)
    .is("deleted_at", null);
  const mandatoryIds = ((modules ?? []) as Array<{ id: string }>).map(
    (m) => m.id,
  );
  if (mandatoryIds.length === 0) return new Set();

  const { data: assignments } = await supabase
    .from("training_assignments")
    .select("module_id, employee_id")
    .in("module_id", mandatoryIds);
  type Assign = { module_id: string; employee_id: string };
  const assignList = (assignments ?? []) as Assign[];
  const hasAnyAssignment = new Set(assignList.map((a) => a.module_id));
  const assignedToByModule = new Map<string, Set<string>>();
  for (const a of assignList) {
    let s = assignedToByModule.get(a.module_id);
    if (!s) {
      s = new Set();
      assignedToByModule.set(a.module_id, s);
    }
    s.add(a.employee_id);
  }

  const { data: progress } = await supabase
    .from("employee_training_progress")
    .select("employee_id, module_id, completed_at")
    .in("employee_id", employeeIds)
    .in("module_id", mandatoryIds);
  const completedSet = new Set(
    ((progress ?? []) as Array<{
      employee_id: string;
      module_id: string;
      completed_at: string | null;
    }>)
      .filter((p) => p.completed_at)
      .map((p) => `${p.employee_id}|${p.module_id}`),
  );

  const pending = new Set<string>();
  for (const empId of employeeIds) {
    for (const moduleId of mandatoryIds) {
      const applies =
        !hasAnyAssignment.has(moduleId) ||
        assignedToByModule.get(moduleId)?.has(empId);
      if (!applies) continue;
      if (!completedSet.has(`${empId}|${moduleId}`)) {
        pending.add(empId);
        break;
      }
    }
  }
  return pending;
}

/* ============================================================================
 * Detail
 * ========================================================================== */
export async function loadEmployeeDetail(id: string): Promise<EmployeeDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("employees")
    .select(
      `id, full_name, email, phone, hire_date, status, weekly_hours, hourly_rate_eur,
       profile:profiles ( id, role )`,
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
    profile: {
      id: string;
      role: "admin" | "dispatcher" | "employee" | null;
    } | null;
  };
  const r = data as unknown as Row | null;
  if (!r) return null;

  // Has the employee got any outstanding mandatory training? Drives
  // the same role-chip categorisation the list uses.
  const detailPending = await computeOutstandingMandatoryByEmployee(
    supabase,
    [r.id],
  );

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
    role_chip: chipFromProfileRole(
      r.profile?.role ?? null,
      detailPending.has(r.id),
    ),
    auth_role: r.profile?.role ?? null,
    profile_id: r.profile?.id ?? null,
    // No real teams modeled yet — UI shows "—" when null.
    team_label: null,
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

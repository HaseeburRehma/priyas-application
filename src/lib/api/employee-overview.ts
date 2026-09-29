import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/rbac/permissions";
import { measureAsync } from "@/lib/utils/perf";

export type EmpoyeeServiceLine = "priyas" | "everyday" | "both";

export type EmployeeOverviewKpis = {
  activeEmployees: number;
  inUseToday: number;
  averageOccupancyPercent: number;
  occupancyDeltaPp: number;
  certificatesDueIn90Days: number;
  onboardingOpen: number;
  onboardingOpenSampleName: string | null;
  onboardingOpenSampleModule: string | null;
};

export type EmployeeTodayBuckets = {
  inUseNow: number;
  laterToday: number;
  freeToday: number;
  vacationOrSick: number;
};

export type ServiceDistribution = {
  priyas: number;
  everyday: number;
  both: number;
};

export type WorkloadRow = {
  employeeId: string;
  name: string;
  initials: string;
  serviceLine: EmpoyeeServiceLine;
  team: string;
  hoursThisWeek: number;
  weeklyHours: number;
  utilizationPercent: number;
  tone: "ok" | "warning" | "danger" | "idle";
};

export type AttendanceTotals = {
  punctualityPercent: number;
  present: number;
  delayed: number;
  onHoliday: number;
  reportedSick: number;
};

export type CertificateRow = {
  id: string;
  title: string;
  employeeName: string | null;
  validUntil: string;
  daysUntil: number | null;
  status: "ok" | "in_4_months" | "in_2_months" | "urgent" | "training_underway" | "onboarding";
};

export type PersonnelEvent = {
  id: string;
  type:
    | "employee_created"
    | "module_completed"
    | "capacity_alert"
    | "shift_handover"
    | "vacation_scheduled"
    | "rating";
  message: string;
  ts: string;
  actor: string | null;
};

export type EmployeeOverviewData = {
  asOf: string;
  kpis: EmployeeOverviewKpis;
  today: EmployeeTodayBuckets;
  serviceDistribution: ServiceDistribution;
  workload: WorkloadRow[];
  attendance: AttendanceTotals;
  certificates: CertificateRow[];
  events: PersonnelEvent[];
};

/* ---------- loader ----------------------------------------------------- */

const ISO_DAY = 24 * 60 * 60 * 1000;

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function toneFor(pct: number): WorkloadRow["tone"] {
  if (pct <= 0) return "idle";
  if (pct >= 110) return "danger";
  if (pct >= 100) return "warning";
  return "ok";
}

export function loadEmployeeOverview(): Promise<EmployeeOverviewData> {
  return measureAsync("loadEmployeeOverview", _loadEmployeeOverview);
}

async function _loadEmployeeOverview(): Promise<EmployeeOverviewData> {
  const supabase = await createSupabaseServerClient();
  const { orgId } = await getCurrentRole();
  if (!orgId) {
    throw new Error("Profile is not attached to an organization yet");
  }
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + ISO_DAY);
  const dow = (now.getDay() + 6) % 7;
  const weekStart = new Date(startOfDay.getTime() - dow * ISO_DAY);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * ISO_DAY);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Fan-out ALL independent queries in a single Promise.all.
  // Previously 8 sequential round-trips → 1 parallel batch.
  type EmpRow = {
    id: string;
    full_name: string;
    status: "active" | "on_leave" | "inactive";
    weekly_hours: number | null;
    system_unlocked_at: string | null;
    profile_id: string | null;
  };
  type ShiftRow = {
    id: string;
    employee_id: string | null;
    starts_at: string;
    ends_at: string;
    status: "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";
    property: { client: { customer_type: string } | null } | null;
  };
  type CertProgress = {
    employee_id: string;
    completed_at: string | null;
    module: { id: string; title: string } | null;
    employee: { full_name: string } | null;
  };
  type AuditRow = {
    id: string;
    created_at: string;
    user_id: string | null;
    action: string;
    table_name: string;
    record_id: string;
    after: Record<string, unknown> | null;
  };

  const [
    empRes,
    shiftRes,
    vacRes,
    lastShiftRes,
    teRes,
    vacMonthRes,
    certRes,
    auditRes,
  ] = await Promise.all([
    // 1) Employees
    supabase
      .from("employees")
      .select("id, full_name, status, weekly_hours, system_unlocked_at, profile_id")
      .is("deleted_at", null)
      .eq("org_id", orgId)
      .order("full_name", { ascending: true })
      .limit(500),
    // 2) This week's shifts (including today)
    supabase
      .from("shifts")
      .select(
        `id, employee_id, starts_at, ends_at, status,
         property:properties ( client:clients ( customer_type ) )`,
      )
      .is("deleted_at", null)
      .eq("org_id", orgId)
      .gte("starts_at", weekStart.toISOString())
      .lt("starts_at", new Date(endOfDay.getTime() + 3 * ISO_DAY).toISOString()),
    // 3) Vacation today
    supabase
      .from("vacation_requests")
      .select("employee_id, status, start_date, end_date")
      .eq("status", "approved")
      .eq("org_id", orgId)
      .lte("start_date", startOfDay.toISOString().slice(0, 10))
      .gte("end_date", startOfDay.toISOString().slice(0, 10)),
    // 4) Last week's shifts for delta
    supabase
      .from("shifts")
      .select("employee_id, starts_at, ends_at")
      .is("deleted_at", null)
      .eq("org_id", orgId)
      .gte("starts_at", lastWeekStart.toISOString())
      .lt("starts_at", weekStart.toISOString()),
    // 5) Time entries this month (attendance)
    supabase
      .from("time_entries")
      .select("id, shift_id, occurred_at, kind, manual")
      .eq("kind", "check_in")
      .eq("org_id", orgId)
      .gte("occurred_at", monthStart.toISOString()),
    // 6) Vacation this month
    supabase
      .from("vacation_requests")
      .select("id")
      .eq("status", "approved")
      .eq("org_id", orgId)
      .gte("start_date", monthStart.toISOString().slice(0, 10)),
    // 7) Certificates (training progress)
    supabase
      .from("employee_training_progress")
      .select(
        `employee_id, completed_at,
         module:training_modules ( id, title ),
         employee:employees ( full_name )`,
      )
      .not("completed_at", "is", null)
      .eq("org_id", orgId),
    // 8) Personnel events (audit log last 7 days)
    supabase
      .from("audit_log")
      .select("id, created_at, user_id, action, table_name, record_id, after")
      .in("table_name", ["employees", "employee_training_progress", "vacation_requests", "shifts"])
      .eq("org_id", orgId)
      .gte("created_at", new Date(now.getTime() - 7 * ISO_DAY).toISOString())
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const employees = ((empRes.data ?? []) as EmpRow[]).filter((e) => !!e.full_name);
  const shifts = (shiftRes.data ?? []) as unknown as ShiftRow[];

  const activeEmployees = employees.filter((e) => e.status === "active").length;
  const onboardingOpenList = employees.filter((e) => e.system_unlocked_at == null);
  const onboardingOpen = onboardingOpenList.length;

  // ---- Today's shifts → in-use buckets + service distribution --------
  const todayShifts = shifts.filter((s) => {
    const t = new Date(s.starts_at).getTime();
    return t >= startOfDay.getTime() && t < endOfDay.getTime();
  });
  const inUseNow = todayShifts.filter((s) => {
    const start = new Date(s.starts_at).getTime();
    const end = new Date(s.ends_at).getTime();
    return start <= now.getTime() && end > now.getTime();
  }).length;
  const laterToday = todayShifts.filter(
    (s) => new Date(s.starts_at).getTime() > now.getTime(),
  ).length;

  const employeeServiceLines = new Map<string, EmpoyeeServiceLine>();
  for (const s of todayShifts) {
    if (!s.employee_id) continue;
    const ct = s.property?.client?.customer_type ?? "residential";
    const line: EmpoyeeServiceLine = ct === "alltagshilfe" ? "everyday" : "priyas";
    const prev = employeeServiceLines.get(s.employee_id);
    if (prev && prev !== line) employeeServiceLines.set(s.employee_id, "both");
    else if (!prev) employeeServiceLines.set(s.employee_id, line);
  }
  const serviceDistribution: ServiceDistribution = { priyas: 0, everyday: 0, both: 0 };
  for (const v of employeeServiceLines.values()) serviceDistribution[v] += 1;

  // ---- Vacation today -----------------------------------------------
  const onVacationToday = new Set(
    ((vacRes.data ?? []) as Array<{ employee_id: string }>).map((r) => r.employee_id),
  );
  const busyToday = new Set(todayShifts.map((s) => s.employee_id).filter(Boolean));
  const freeToday = employees.filter(
    (e) =>
      e.status === "active" &&
      !busyToday.has(e.id) &&
      !onVacationToday.has(e.id),
  ).length;

  // ---- Hours this week per employee ---------------------------------
  const hoursThisWeekByEmployee = new Map<string, number>();
  for (const s of shifts) {
    if (!s.employee_id) continue;
    const startMs = new Date(s.starts_at).getTime();
    if (startMs < weekStart.getTime() || startMs >= weekStart.getTime() + 7 * ISO_DAY) continue;
    const dur = Math.max(0, new Date(s.ends_at).getTime() - startMs) / (60 * 60 * 1000);
    hoursThisWeekByEmployee.set(
      s.employee_id,
      (hoursThisWeekByEmployee.get(s.employee_id) ?? 0) + dur,
    );
  }

  let totalThisWeek = 0;
  for (const v of hoursThisWeekByEmployee.values()) totalThisWeek += v;
  let totalLastWeek = 0;
  for (const r of (lastShiftRes.data ?? []) as Array<{ starts_at: string; ends_at: string }>) {
    const dur = Math.max(
      0,
      new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime(),
    ) / (60 * 60 * 1000);
    totalLastWeek += dur;
  }
  const targetSum =
    employees.reduce((a, e) => a + Number(e.weekly_hours ?? 40), 0) || 1;
  const averageOccupancyPercent =
    Math.round((totalThisWeek / targetSum) * 100);
  const lastWeekPct = Math.round((totalLastWeek / targetSum) * 100);
  const occupancyDeltaPp = averageOccupancyPercent - lastWeekPct;

  // ---- Team workload list -------------------------------------------
  const teamMap: Record<string, string> = {};
  for (const e of employees) teamMap[e.id] = "Team Operations";
  const workload: WorkloadRow[] = employees
    .filter((e) => e.status === "active")
    .map((e) => {
      const hrs = hoursThisWeekByEmployee.get(e.id) ?? 0;
      const target = Number(e.weekly_hours ?? 40);
      const pct = target ? Math.round((hrs / target) * 100) : 0;
      return {
        employeeId: e.id,
        name: e.full_name,
        initials: initialsOf(e.full_name),
        serviceLine: employeeServiceLines.get(e.id) ?? "priyas",
        team: teamMap[e.id] ?? "—",
        hoursThisWeek: Math.round(hrs * 10) / 10,
        weeklyHours: target,
        utilizationPercent: pct,
        tone: toneFor(pct),
      };
    })
    .sort((a, b) => b.utilizationPercent - a.utilizationPercent)
    .slice(0, 8);

  // ---- Attendance ---------------------------------------------------
  const teRows = teRes.data ?? [];
  const present = teRows.length;
  const delayed = (teRows as Array<{ manual: boolean }>).filter(
    (r) => r.manual === true,
  ).length;
  const onHoliday = (vacMonthRes.data ?? []).length;
  const reportedSick = 0;
  const totalAttendance = present + delayed + onHoliday + reportedSick || 1;
  const punctualityPercent = Math.round(
    ((present - delayed) / totalAttendance) * 100,
  );

  // ---- Certificates due within 90 days ------------------------------
  const certificates: CertificateRow[] = ((certRes.data ?? []) as unknown as CertProgress[])
    .filter((r) => r.module && r.completed_at)
    .map((r) => {
      const completedMs = new Date(r.completed_at!).getTime();
      const validUntilMs = completedMs + 365 * ISO_DAY;
      const daysUntil = Math.round((validUntilMs - now.getTime()) / ISO_DAY);
      let status: CertificateRow["status"] = "ok";
      if (daysUntil < 0) status = "urgent";
      else if (daysUntil <= 30) status = "urgent";
      else if (daysUntil <= 60) status = "in_2_months";
      else if (daysUntil <= 120) status = "in_4_months";
      return {
        id: `${r.module!.id}-${r.employee_id}`,
        title: r.module!.title,
        employeeName: r.employee?.full_name ?? null,
        validUntil: new Date(validUntilMs).toISOString().slice(0, 10),
        daysUntil,
        status,
      };
    })
    .filter((c) => c.daysUntil !== null && c.daysUntil <= 120)
    .sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0))
    .slice(0, 8);
  const certificatesDueIn90Days = certificates.filter(
    (c) => c.daysUntil !== null && c.daysUntil <= 90,
  ).length;

  // ---- Personnel events feed ----------------------------------------
  const events: PersonnelEvent[] = ((auditRes.data ?? []) as unknown as AuditRow[]).map(
    (r) => {
      let type: PersonnelEvent["type"] = "employee_created";
      if (r.table_name === "employee_training_progress" && r.action === "update")
        type = "module_completed";
      else if (r.table_name === "vacation_requests" && r.action === "create")
        type = "vacation_scheduled";
      else if (r.table_name === "shifts" && r.action === "reassign")
        type = "shift_handover";
      else if (r.action === "rating") type = "rating";
      else if (r.action === "capacity_alert") type = "capacity_alert";
      else if (r.table_name === "employees" && r.action === "create")
        type = "employee_created";
      const after = r.after ?? {};
      const message =
        (typeof after.message === "string" && after.message) ||
        `${r.action} · ${r.table_name}`;
      return {
        id: r.id,
        type,
        message,
        ts: r.created_at,
        actor: null,
      };
    },
  );

  return {
    asOf: now.toISOString(),
    kpis: {
      activeEmployees,
      inUseToday: todayShifts.filter((s) => s.employee_id).length,
      averageOccupancyPercent,
      occupancyDeltaPp,
      certificatesDueIn90Days,
      onboardingOpen,
      onboardingOpenSampleName: onboardingOpenList[0]?.full_name ?? null,
      onboardingOpenSampleModule: null,
    },
    today: {
      inUseNow,
      laterToday,
      freeToday,
      vacationOrSick: onVacationToday.size,
    },
    serviceDistribution,
    workload,
    attendance: {
      punctualityPercent,
      present: Math.max(0, present - delayed),
      delayed,
      onHoliday,
      reportedSick,
    },
    certificates,
    events,
  };
}

/**
 * Client-safe dashboard types. Lives in its own module so client components
 * (KpiGrid, WeeklyChart, etc.) can import the shapes without dragging the
 * server-only `loadDashboardData()` — and its `next/headers` dependency —
 * into the browser bundle.
 */

export type KpiSet = {
  activeClients: { value: number; deltaPct: number; addedThisMonth: number };
  managedProperties: { value: number; deltaPct: number; addedThisMonth: number };
  todayShifts: { value: number; pendingCheckins: number };
  openInvoices: {
    valueCents: number;
    pendingCount: number;
    overdueCount: number;
  };
};

export type WeeklyChartDay = {
  label: string;
  completed: number;
  scheduled: number;
};

export type WeeklyChartData = {
  days: WeeklyChartDay[];
  completed: number;
  scheduled: number;
  hours: number;
  completedDeltaPct: number;
  hoursDeltaPct: number;
  weekLabel: string;
};

export type TodayShift = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";
  property: string;
  client: string;
  zone: string | null;
  serviceLabel: string;
  durationLabel: string;
  team: { initials: string; tone: "primary" | "secondary" | "accent" }[];
  flag: "ok" | "warn" | "done";
  flagDetail?: string;
};

export type ActivityEntry = {
  id: string;
  kind: "create" | "checkin" | "invoice" | "alert";
  /** HTML-safe message text — usually the audit_log row's after.message. */
  body: string;
  /** Actor name (the profile that performed the action), or null. */
  actorName: string | null;
  /** Underlying table — drives the deep-link from the activity feed. */
  table: string;
  /** Underlying record id — also used for the deep-link. */
  recordId: string | null;
  createdAt: string;
};

/**
 * Role chip on TeamUtilization rows. Mirrors `EmployeeRoleChip` from the
 * employees module so the dashboard and the /employees list speak the
 * same vocabulary instead of dashboard-only strings ("Team Lead").
 */
export type TeamLoadRole = "pm" | "field" | "trainee";

export type TeamLoad = {
  id: string;
  name: string;
  role: TeamLoadRole;
  pct: number;
  initials: string;
  tone: "primary" | "secondary" | "accent";
  /** Hours worked or scheduled this week. */
  hours: number;
  /** Weekly target (employees.weekly_hours, fallback 40). */
  target: number;
};

export type DashboardData = {
  greetingName: string;
  kpis: KpiSet;
  chart: WeeklyChartData;
  todayShifts: TodayShift[];
  activities: ActivityEntry[];
  teamLoad: TeamLoad[];
};

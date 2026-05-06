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
  body: string;
  meta: string;
  createdAt: string;
};

export type TeamLoad = {
  id: string;
  name: string;
  role: string;
  pct: number;
  initials: string;
  tone: "primary" | "secondary" | "accent";
};

export type DashboardData = {
  greetingName: string;
  kpis: KpiSet;
  chart: WeeklyChartData;
  todayShifts: TodayShift[];
  activities: ActivityEntry[];
  teamLoad: TeamLoad[];
};

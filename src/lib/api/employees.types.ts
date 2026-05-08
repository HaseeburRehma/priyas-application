export type EmployeeStatus = "active" | "on_leave" | "inactive";

export type EmployeeRoleChip = "pm" | "field" | "trainee";

export type EmployeeRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  initials: string;
  tone: "primary" | "secondary" | "accent" | "warning";
  /**
   * Year extracted from hire_date — let the client build a localised
   * "Projektleitung seit 2026" / "Project Lead since 2026" / Tamil
   * string. Avoids leaking English fragments through a translated UI.
   */
  hire_year: number | null;
  /** Single-letter language codes the employee speaks. */
  languages: ReadonlyArray<"de" | "en" | "ta">;
  role_chip: EmployeeRoleChip;
  /** Real team label when assigned, null otherwise. UI shows "—". */
  team_label: string | null;
  team_tone: "primary" | "secondary" | "warning" | null;
  hours_this_week: number;
  weekly_target: number;
  status: EmployeeStatus | "overtime";
  vacation_used: number;
  vacation_total: number;
  vacation_label: string;
  med_cert: boolean;
};

export type EmployeesSummary = {
  total: number;
  activeToday: number;
  onLeave: number;
  pendingOnboarding: number;
  /** First pending employee — used as the dashboard card subtitle. */
  pendingOnboardingPreview?: string | null;
  newThisMonth: number;
};

export type EmployeesListParams = {
  q?: string;
  role?: EmployeeRoleChip | "all";
  team?: string | "all";
  status?: EmployeeStatus | "all";
  page?: number;
  pageSize?: number;
  sort?: "name" | "hours" | "status";
  direction?: "asc" | "desc";
};

export type EmployeesListResult = {
  rows: EmployeeRow[];
  total: number;
};

export type EmployeeDetail = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  initials: string;
  tone: "primary" | "secondary" | "accent" | "warning";
  hire_date: string | null;
  status: EmployeeStatus;
  role_chip: EmployeeRoleChip;
  team_label: string | null;
  hourly_rate_eur: number | null;
  weekly_hours: number;
  // Aggregates
  hours_this_week: number;
  hours_this_month: number;
  shifts_this_month: number;
  shifts_total: number;
  vacation_used: number;
  vacation_total: number;
  // Recent shifts
  upcoming_shifts: Array<{
    id: string;
    starts_at: string;
    property_name: string;
    client_name: string;
    duration_h: number;
  }>;
  recent_time_entries: Array<{
    id: string;
    check_in_at: string;
    check_out_at: string | null;
    property_name: string;
    hours: number;
  }>;
};

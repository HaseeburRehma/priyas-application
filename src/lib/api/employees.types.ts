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

/**
 * Sortable columns wired through to the DB query. `hours` is computed
 * JS-side from `shifts.starts_at`/`ends_at` (no materialised aggregate
 * yet) so we can't push it down as an `.order()` clause.
 */
export type EmployeesSortField = "name" | "status";

export type EmployeesListParams = {
  q?: string;
  role?: EmployeeRoleChip | "all";
  team?: string | "all";
  status?: EmployeeStatus | "all";
  page?: number;
  pageSize?: number;
  sort?: EmployeesSortField;
  direction?: "asc" | "desc";
  /**
   * Restrict the result set to these IDs. Used for bulk-export CSVs
   * that should only contain the user's current selection.
   */
  ids?: ReadonlyArray<string>;
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
  /**
   * The auth role from `profiles.role` (or null when the invite hasn't
   * been accepted yet). Drives the "Change role" UI on the detail
   * page — distinct from `role_chip`, which is a presentation-only
   * combination of role + training state.
   */
  auth_role: "admin" | "dispatcher" | "employee" | null;
  /** `employees.profile_id` so the client can guard against self-role-change. */
  profile_id: string | null;
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

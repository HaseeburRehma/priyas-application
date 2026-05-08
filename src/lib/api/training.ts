import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/rbac/permissions";

export type TrainingModule = {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  is_mandatory: boolean;
  position: number;
  locale: string;
  created_at: string;
};

export type TrainingProgress = {
  module_id: string;
  started_at: string | null;
  completed_at: string | null;
};

export type TrainingAssignment = {
  module_id: string;
  employee_id: string;
  due_date: string | null;
  assigned_at: string;
};

/**
 * Roster row shown in the AssignmentEditor picker. We carry the
 * employee's `status` and `profile_id` so the manager UI can:
 *   • Show a "on leave" / "inactive" chip — they're still assignable
 *     (e.g. for a returning-from-leave checklist) but the manager
 *     should know.
 *   • Show a "no app account" hint when profile_id is null — that
 *     employee can't receive in-app notifications, so the assignment
 *     gets recorded but they won't be auto-pinged.
 */
export type AssignableEmployee = {
  id: string;
  full_name: string;
  status: "active" | "on_leave" | "inactive";
  has_profile: boolean;
};

export type TrainingHubData = {
  myEmployeeId: string | null;
  canManage: boolean;
  modules: TrainingModule[];
  /** Keyed by module_id — only includes the current employee's progress. */
  progress: Record<string, TrainingProgress>;
  /**
   * For managers: every assignment in the org, keyed by module_id then
   * employee_id. Empty for non-managers.
   */
  assignmentsByModule: Record<string, Record<string, TrainingAssignment>>;
  /**
   * For managers: the org's employee roster for the picker. Includes
   * status + profile-link metadata so the UI can render context chips.
   */
  employees: AssignableEmployee[];
};

export async function loadTrainingHub(): Promise<TrainingHubData> {
  const supabase = await createSupabaseServerClient();
  const { userId, role } = await getCurrentRole();
  const canManage = role === "admin" || role === "dispatcher";

  if (!userId) {
    return {
      myEmployeeId: null,
      canManage,
      modules: [],
      progress: {},
      assignmentsByModule: {},
      employees: [],
    };
  }

  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  const myEmployeeId = (emp as { id: string } | null)?.id ?? null;

  const { data: rows } = await supabase
    .from("training_modules")
    .select(
      "id, title, description, video_url, is_mandatory, position, locale, created_at",
    )
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  let modules = ((rows ?? []) as unknown as TrainingModule[]).map((m) => ({
    ...m,
    is_mandatory: !!m.is_mandatory,
  }));

  // Pull all assignments. Managers want them all; employees only need to
  // know which modules apply to them so we can filter the list.
  const { data: assignmentRows } = await supabase
    .from("training_assignments")
    .select("module_id, employee_id, due_date, assigned_at");
  const assignments =
    (assignmentRows ?? []) as unknown as TrainingAssignment[];

  // Index by module → employee.
  const assignmentsByModule: Record<
    string,
    Record<string, TrainingAssignment>
  > = {};
  for (const a of assignments) {
    if (!assignmentsByModule[a.module_id]) assignmentsByModule[a.module_id] = {};
    assignmentsByModule[a.module_id]![a.employee_id] = a;
  }

  // Visibility rule: a module is visible to employee X if it has zero
  // assignments (shared module) OR has an assignment row for X.
  if (!canManage && myEmployeeId) {
    modules = modules.filter((m) => {
      const ass = assignmentsByModule[m.id];
      if (!ass) return true; // shared
      return !!ass[myEmployeeId];
    });
  }

  let progress: Record<string, TrainingProgress> = {};
  if (myEmployeeId) {
    const { data: progRows } = await supabase
      .from("employee_training_progress")
      .select("module_id, started_at, completed_at")
      .eq("employee_id", myEmployeeId);
    progress = Object.fromEntries(
      ((progRows ?? []) as TrainingProgress[]).map((r) => [r.module_id, r]),
    );
  }

  // Manager-only: roster for the assignment picker.
  //
  // Important: do NOT filter by status='active'. An employee on leave
  // can still be pre-assigned a module to complete on return, and an
  // explicit-inactive employee may need to acknowledge a final
  // training step before offboarding. The UI surfaces status as a chip
  // so the manager can see context without it silently hiding rows.
  //
  // Soft-deleted rows ARE excluded — those represent employees who
  // have been removed from the system entirely.
  let employees: AssignableEmployee[] = [];
  if (canManage) {
    const { data: empRows } = await supabase
      .from("employees")
      .select("id, full_name, status, profile_id")
      .is("deleted_at", null)
      .order("status", { ascending: true }) // active first
      .order("full_name", { ascending: true });
    type EmployeeRow = {
      id: string;
      full_name: string;
      status: "active" | "on_leave" | "inactive";
      profile_id: string | null;
    };
    employees = ((empRows ?? []) as unknown as EmployeeRow[]).map((r) => ({
      id: r.id,
      full_name: r.full_name,
      status: r.status ?? "active",
      has_profile: !!r.profile_id,
    }));
  }

  return {
    myEmployeeId,
    canManage,
    modules,
    progress,
    assignmentsByModule,
    employees,
  };
}

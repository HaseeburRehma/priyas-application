import "server-only";

/**
 * Returns the list of mandatory training modules a given employee has NOT
 * yet completed. Used by the schedule actions to block shift assignment
 * for staff who haven't finished onboarding.
 *
 * "Mandatory" = `training_modules.is_mandatory = true`. The visibility
 * filter from training_assignments is honored: a module assigned to
 * specific employees only counts as mandatory for those employees.
 */
export async function getOutstandingMandatoryModules(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  employeeId: string,
): Promise<Array<{ id: string; title: string }>> {
  const { data: modules } = await supabase
    .from("training_modules")
    .select("id, title")
    .eq("is_mandatory", true)
    .is("deleted_at", null);

  type Mod = { id: string; title: string };
  const all = (modules ?? []) as Mod[];
  if (all.length === 0) return [];

  // Restrict to modules either unscoped (no assignments at all) or
  // explicitly assigned to this employee.
  const moduleIds = all.map((m) => m.id);
  const { data: assignments } = await supabase
    .from("training_assignments")
    .select("module_id, employee_id")
    .in("module_id", moduleIds);
  type Assign = { module_id: string; employee_id: string };
  const assignList = (assignments ?? []) as Assign[];

  const hasAnyAssignment = new Set(assignList.map((a) => a.module_id));
  const assignedToMe = new Set(
    assignList
      .filter((a) => a.employee_id === employeeId)
      .map((a) => a.module_id),
  );

  const applicable = all.filter(
    (m) => !hasAnyAssignment.has(m.id) || assignedToMe.has(m.id),
  );

  if (applicable.length === 0) return [];

  const { data: progress } = await supabase
    .from("employee_training_progress")
    .select("module_id, completed_at")
    .eq("employee_id", employeeId)
    .in(
      "module_id",
      applicable.map((m) => m.id),
    );
  type Prog = { module_id: string; completed_at: string | null };
  const completed = new Set(
    ((progress ?? []) as Prog[])
      .filter((p) => p.completed_at != null)
      .map((p) => p.module_id),
  );

  return applicable.filter((m) => !completed.has(m.id));
}

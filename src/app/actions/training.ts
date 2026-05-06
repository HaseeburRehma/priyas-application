"use server";

import { revalidatePath } from "next/cache";
import {
  trainingProgressSchema,
  upsertTrainingModuleSchema,
} from "@/lib/validators/training";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function audit(action: string, recordId: string, message: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("audit_log") as any)).insert({
    org_id: orgId,
    user_id: user.id,
    action,
    table_name: "training_modules",
    record_id: recordId,
    after: { message, meta: "via WebApp" },
  });
}

/* ---------------- Module CRUD (managers only) ---------------- */

export async function upsertTrainingModuleAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("training.manage");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = upsertTrainingModuleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  if (input.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await ((supabase.from("training_modules") as any))
      .update({
        title: input.title,
        description: input.description || null,
        video_url: input.video_url || null,
        is_mandatory: input.is_mandatory,
        position: input.position,
        locale: input.locale,
      })
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    await audit("update", input.id, `Modul aktualisiert: ${input.title}`);
    revalidatePath(routes.training);
    return { ok: true, data: { id: input.id } };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("training_modules") as any))
    .insert({
      org_id: orgId,
      title: input.title,
      description: input.description || null,
      video_url: input.video_url || null,
      is_mandatory: input.is_mandatory,
      position: input.position,
      locale: input.locale,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const newId = (data as { id: string }).id;
  await audit("create", newId, `Modul erstellt: ${input.title}`);
  revalidatePath(routes.training);
  return { ok: true, data: { id: newId } };
}

export async function deleteTrainingModuleAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("training.manage");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // Soft delete via deleted_at to preserve audit trail.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("training_modules") as any))
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit("delete", id, "Modul archiviert.");
  revalidatePath(routes.training);
  return { ok: true, data: { id } };
}

/* ---------------- Assignments (managers scope modules) ---------------- */

export async function setTrainingAssignmentsAction(
  moduleId: string,
  employeeIds: string[],
  dueDate: string | null = null,
): Promise<ActionResult<{ module_id: string; count: number }>> {
  try {
    await requirePermission("training.manage");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // Replace the assignment set: delete all current rows for this module,
  // then insert the new set. Cheaper than diffing for the typical small N.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: delErr } = await ((supabase.from("training_assignments") as any))
    .delete()
    .eq("module_id", moduleId);
  if (delErr) return { ok: false, error: delErr.message };

  if (employeeIds.length > 0) {
    const rows = employeeIds.map((employee_id) => ({
      org_id: orgId,
      module_id: moduleId,
      employee_id,
      due_date: dueDate,
      assigned_by: user?.id ?? null,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await ((supabase.from("training_assignments") as any))
      .insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }

  await audit(
    "assign",
    moduleId,
    `Modul-Zuweisungen aktualisiert (${employeeIds.length} Empfänger).`,
  );
  revalidatePath(routes.training);
  return {
    ok: true,
    data: { module_id: moduleId, count: employeeIds.length },
  };
}

/* ---------------- Progress (employee marks own) ---------------- */

export async function updateTrainingProgressAction(
  raw: unknown,
): Promise<ActionResult<{ module_id: string }>> {
  try {
    await requirePermission("training.complete");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = trainingProgressSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // Map this user to their employees row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: emp } = await ((supabase.from("employees") as any))
    .select("id")
    .eq("profile_id", user?.id ?? "")
    .maybeSingle();
  const employeeId = (emp as { id: string } | null)?.id;
  if (!employeeId) return { ok: false, error: "No employee profile linked" };

  const now = new Date().toISOString();
  const patch: {
    employee_id: string;
    module_id: string;
    org_id: string;
    started_at?: string | null;
    completed_at?: string | null;
  } = {
    employee_id: employeeId,
    module_id: input.module_id,
    org_id: orgId,
  };
  if (input.state === "start") {
    patch.started_at = now;
    patch.completed_at = null;
  } else if (input.state === "complete") {
    patch.started_at = now;
    patch.completed_at = now;
  } else {
    patch.started_at = null;
    patch.completed_at = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("employee_training_progress") as any))
    .upsert(patch, { onConflict: "employee_id,module_id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.training);
  return { ok: true, data: { module_id: input.module_id } };
}

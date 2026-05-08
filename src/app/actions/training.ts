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
): Promise<
  ActionResult<{
    module_id: string;
    count: number;
    notified: number;
    skippedNoProfile: number;
  }>
> {
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

  // ---- Resolve module title up-front for the notification body. -----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: moduleRow } = await ((supabase.from("training_modules") as any))
    .select("title, is_mandatory")
    .eq("id", moduleId)
    .maybeSingle();
  const moduleTitle =
    (moduleRow as { title: string | null } | null)?.title ?? "Modul";
  const moduleIsMandatory =
    (moduleRow as { is_mandatory: boolean | null } | null)?.is_mandatory ===
    true;

  // ---- Diff existing assignments against the requested set. ---------
  // Why diff instead of delete-then-insert: deleting destroys
  // `assigned_at` history and the `due_date` previously set per row.
  // We want "kept" rows untouched, "added" rows freshly inserted, and
  // "removed" rows deleted.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignmentsTable = supabase.from("training_assignments") as any;
  const { data: existingRows, error: readErr } = await assignmentsTable
    .select("employee_id, due_date")
    .eq("module_id", moduleId);
  if (readErr) return { ok: false, error: readErr.message };
  const existing = new Map<string, { due_date: string | null }>();
  for (const r of (existingRows ?? []) as Array<{
    employee_id: string;
    due_date: string | null;
  }>) {
    existing.set(r.employee_id, { due_date: r.due_date });
  }
  const requested = new Set(employeeIds);

  const toAdd: string[] = [];
  for (const id of employeeIds) {
    if (!existing.has(id)) toAdd.push(id);
  }
  const toRemove: string[] = [];
  for (const id of existing.keys()) {
    if (!requested.has(id)) toRemove.push(id);
  }

  // Apply removals first.
  if (toRemove.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: delErr } = await ((supabase.from("training_assignments") as any))
      .delete()
      .eq("module_id", moduleId)
      .in("employee_id", toRemove);
    if (delErr) return { ok: false, error: delErr.message };
  }

  // Apply additions.
  if (toAdd.length > 0) {
    const rows = toAdd.map((employee_id) => ({
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

  // Optionally update due_date on kept rows when the manager selected
  // a different date. We only touch the rows where the date actually
  // changed, so the audit trail stays meaningful.
  const toUpdateDate: string[] = [];
  for (const id of employeeIds) {
    const prev = existing.get(id);
    if (prev && prev.due_date !== dueDate) toUpdateDate.push(id);
  }
  if (toUpdateDate.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await ((supabase.from("training_assignments") as any))
      .update({ due_date: dueDate })
      .eq("module_id", moduleId)
      .in("employee_id", toUpdateDate);
    if (updErr) return { ok: false, error: updErr.message };
  }

  // ---- Fan out notifications to newly-assigned employees. -----------
  // Only notify on `toAdd` — re-saving an unchanged set shouldn't spam.
  // We need to map employee_id → profile_id; employees without a linked
  // profile silently skip (the row is still saved).
  let notified = 0;
  let skippedNoProfile = 0;
  if (toAdd.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: empRows } = await ((supabase.from("employees") as any))
      .select("id, profile_id")
      .in("id", toAdd);
    type Row = { id: string; profile_id: string | null };
    const profileIds: string[] = [];
    for (const r of (empRows ?? []) as Row[]) {
      if (r.profile_id) profileIds.push(r.profile_id);
      else skippedNoProfile += 1;
    }

    if (profileIds.length > 0) {
      const { emitNotification } = await import("@/lib/notifications/emit");
      const titlePrefix = moduleIsMandatory
        ? "Pflichtschulung zugewiesen"
        : "Schulung zugewiesen";
      const dueSuffix = dueDate ? ` · fällig ${dueDate}` : "";
      await Promise.all(
        profileIds.map((user_id) =>
          emitNotification({
            user_id,
            org_id: orgId,
            category: "training_assigned",
            title: `${titlePrefix}: ${moduleTitle}`,
            body: `Bitte schließe das Modul ab${dueSuffix}.`,
            link_url: routes.training,
            push: true,
          }).then(
            () => {
              notified += 1;
            },
            () => {
              /* best-effort */
            },
          ),
        ),
      );
    }
  }

  await audit(
    "assign",
    moduleId,
    `Modul-Zuweisungen aktualisiert (added: ${toAdd.length}, removed: ${toRemove.length}, kept: ${employeeIds.length - toAdd.length}).`,
  );
  revalidatePath(routes.training);
  return {
    ok: true,
    data: {
      module_id: moduleId,
      count: employeeIds.length,
      notified,
      skippedNoProfile,
    },
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
    signature_svg?: string | null;
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

    // Spec §4.9 — mandatory-module completion requires a digital
    // signature. Stored inline as image/svg+xml markup in
    // employee_training_progress.signature_svg (added in migration 000025).
    // The UI gate enforces "must sign" for is_mandatory modules; the
    // server stays permissive for non-mandatory modules so people can
    // mark optional reading material done with one click.
    if (input.signature_svg) {
      patch.signature_svg = input.signature_svg;
    }
  } else {
    patch.started_at = null;
    patch.completed_at = null;
    patch.signature_svg = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("employee_training_progress") as any))
    .upsert(patch, { onConflict: "employee_id,module_id" });
  if (error) return { ok: false, error: error.message };

  await audit(
    input.state,
    input.module_id,
    input.state === "complete"
      ? input.signature_svg
        ? "Modul abgeschlossen + signiert."
        : "Modul abgeschlossen."
      : input.state === "start"
        ? "Modul gestartet."
        : "Modul-Fortschritt zurückgesetzt.",
  );

  revalidatePath(routes.training);
  return { ok: true, data: { module_id: input.module_id } };
}

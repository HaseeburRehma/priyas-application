"use server";

import { revalidatePath } from "next/cache";
import {
  createShiftSchema,
  updateShiftSchema,
} from "@/lib/validators/shifts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { getOutstandingMandatoryModules } from "@/lib/training/lock";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
/**
 * Translate the Postgres exclusion constraint violation (SQLSTATE 23P01,
 * raised by the `shifts_no_employee_overlap` constraint added in migration
 * 000033) into the same `conflict` shape as the JS-side `detectShiftConflicts`
 * check, so the UI behaves identically whether the JS or DB caught the race.
 * Returns null when the error wasn't an overlap so the caller can re-raise.
 */
function translateOverlapError(
  err: { code?: string; message?: string } | null,
):
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | null {
  if (!err) return null;
  if (err.code === "23P01" || /shifts_no_employee_overlap/i.test(err.message ?? "")) {
    return {
      ok: false,
      error: "Mitarbeiter ist in diesem Zeitraum bereits eingeplant.",
      fieldErrors: { employee_id: ["doppelte Buchung"] },
    };
  }
  return null;
}


/**
 * Detect any conflict that should block a shift from being saved:
 *  • The same employee is already booked in the requested window
 *    (excluding `excludeShiftId` so editing your own shift doesn't fight itself).
 *  • The employee has approved vacation that overlaps this window.
 *  • The property has a recorded closure on any day in this window.
 *
 * Returns an `ActionResult` failure when a conflict exists, or `null` when
 * the shift is safe to save.
 */
async function detectShiftConflicts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  property_id: string,
  employee_id: string | null,
  starts_at: string,
  ends_at: string,
  excludeShiftId?: string,
): Promise<{ ok: false; error: string; fieldErrors?: Record<string, string[]> } | null> {
  const startDate = starts_at.slice(0, 10);
  const endDate = ends_at.slice(0, 10);

  // 1) Double booking on the employee
  if (employee_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase.from("shifts") as any)
      .select("id")
      .eq("employee_id", employee_id)
      .is("deleted_at", null)
      .lt("starts_at", ends_at)
      .gt("ends_at", starts_at)
      .limit(1);
    if (excludeShiftId) q = q.neq("id", excludeShiftId);
    const { data: clash } = await q;
    if ((clash ?? []).length > 0) {
      return {
        ok: false,
        error: "Mitarbeiter ist in diesem Zeitraum bereits eingeplant.",
        fieldErrors: { employee_id: ["doppelte Buchung"] },
      };
    }

    // 2) Vacation overlap
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: vacationRows } = await ((supabase.from("vacation_requests") as any))
      .select("id, start_date, end_date")
      .eq("employee_id", employee_id)
      .eq("status", "approved")
      .lte("start_date", endDate)
      .gte("end_date", startDate)
      .limit(1);
    if ((vacationRows ?? []).length > 0) {
      return {
        ok: false,
        error: "Mitarbeiter ist in dieser Zeit im Urlaub.",
        fieldErrors: { employee_id: ["Urlaub"] },
      };
    }
  }

  // 3) Property closure overlap
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: closureRows } = await ((supabase.from("property_closures") as any))
    .select("id, reason")
    .eq("property_id", property_id)
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .limit(1);
  if ((closureRows ?? []).length > 0) {
    return {
      ok: false,
      error: "An diesem Tag ist das Objekt geschlossen.",
      fieldErrors: { starts_at: ["Schließung"] },
    };
  }

  return null;
}

async function audit(
  action: string,
  recordId: string,
  message: string,
) {
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
    table_name: "shifts",
    record_id: recordId,
    after: { message, meta: "via WebApp" },
  });
}

export async function createShiftAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("shift.create");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const { rateLimit } = await import("@/lib/rate-limit/guard");
  const rl = await rateLimit("write", "shift.create");
  if (rl) return { ok: false, error: rl };
  const parsed = createShiftSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
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

  // Training lock: an employee with outstanding mandatory training cannot
  // be assigned to a shift. Surface the missing modules in the error.
  if (input.employee_id) {
    const outstanding = await getOutstandingMandatoryModules(
      supabase,
      input.employee_id,
    );
    if (outstanding.length > 0) {
      return {
        ok: false,
        error:
          "Mitarbeiter hat Pflichtschulungen offen: " +
          outstanding.map((m) => m.title).join(", "),
        fieldErrors: { employee_id: ["Pflichtschulung offen"] },
      };
    }
  }

  // Conflict checks: double-booking, vacation overlap, closure overlap.
  const conflict = await detectShiftConflicts(
    supabase,
    input.property_id,
    input.employee_id ?? null,
    input.starts_at,
    input.ends_at,
  );
  if (conflict) return conflict;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("shifts") as any))
    .insert({
      org_id: orgId,
      property_id: input.property_id,
      employee_id: input.employee_id ?? null,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      notes: input.notes || null,
      status: "scheduled",
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    const overlap = translateOverlapError(error);
    if (overlap) return overlap;
    return { ok: false, error: error.message };
  }

  const newId = (data as { id: string }).id;
  await audit(
    "create",
    newId,
    `Schicht <strong>${input.starts_at}</strong> wurde geplant.`,
  );

  revalidatePath(routes.schedule);
  revalidatePath(routes.dashboard);
  return { ok: true, data: { id: newId } };
}

export async function updateShiftAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("shift.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = updateShiftSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();

  if (input.employee_id) {
    const outstanding = await getOutstandingMandatoryModules(
      supabase,
      input.employee_id,
    );
    if (outstanding.length > 0) {
      return {
        ok: false,
        error:
          "Mitarbeiter hat Pflichtschulungen offen: " +
          outstanding.map((m) => m.title).join(", "),
        fieldErrors: { employee_id: ["Pflichtschulung offen"] },
      };
    }
  }

  const conflict = await detectShiftConflicts(
    supabase,
    input.property_id,
    input.employee_id ?? null,
    input.starts_at,
    input.ends_at,
    input.id, // exclude the shift being edited from the double-book check
  );
  if (conflict) return conflict;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("shifts") as any))
    .update({
      property_id: input.property_id,
      employee_id: input.employee_id ?? null,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      notes: input.notes || null,
    })
    .eq("id", input.id);
  if (error) {
    const overlap = translateOverlapError(error);
    if (overlap) return overlap;
    return { ok: false, error: error.message };
  }
  await audit("update", input.id, "Schicht aktualisiert.");
  revalidatePath(routes.schedule);
  return { ok: true, data: { id: input.id } };
}

export async function deleteShiftAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    // Re-use shift.update — we treat soft-cancel as an update, not a destructive
    // delete. Hard-delete would be admin-only via RLS.
    await requirePermission("shift.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("shifts") as any))
    .update({ deleted_at: new Date().toISOString(), status: "cancelled" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit("delete", id, "Schicht gelöscht.");
  revalidatePath(routes.schedule);
  return { ok: true, data: { id } };
}

/**
 * Patch only the employee on an existing shift. Lighter than
 * updateShiftAction (no property/time required) and used by the detail-panel
 * "Reassign" button. We still run the full conflict-detection net (training
 * lock, double-booking, vacation, closure) against the new assignee.
 */
export async function reassignShiftAction(input: {
  id: string;
  employee_id: string | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("shift.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  if (!input.id || typeof input.id !== "string") {
    return { ok: false, error: "Validation failed" };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: loadErr } = await ((supabase.from("shifts") as any))
    .select("id, property_id, starts_at, ends_at, status")
    .eq("id", input.id)
    .maybeSingle();
  if (loadErr || !existing) {
    return { ok: false, error: loadErr?.message ?? "Schicht nicht gefunden." };
  }
  const row = existing as {
    id: string;
    property_id: string;
    starts_at: string;
    ends_at: string;
    status: string;
  };

  if (input.employee_id) {
    const outstanding = await getOutstandingMandatoryModules(
      supabase,
      input.employee_id,
    );
    if (outstanding.length > 0) {
      return {
        ok: false,
        error:
          "Mitarbeiter hat Pflichtschulungen offen: " +
          outstanding.map((m) => m.title).join(", "),
        fieldErrors: { employee_id: ["Pflichtschulung offen"] },
      };
    }
  }

  const conflict = await detectShiftConflicts(
    supabase,
    row.property_id,
    input.employee_id,
    row.starts_at,
    row.ends_at,
    row.id,
  );
  if (conflict) return conflict;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("shifts") as any))
    .update({ employee_id: input.employee_id ?? null })
    .eq("id", input.id);
  if (error) {
    const overlap = translateOverlapError(error);
    if (overlap) return overlap;
    return { ok: false, error: error.message };
  }
  await audit("update", input.id, "Schicht neu zugewiesen.");
  revalidatePath(routes.schedule);
  return { ok: true, data: { id: input.id } };
}

/**
 * Flip status="completed" on a shift. The completion semantics live in
 * `updateShiftAction` (which requires the full payload); this thin wrapper
 * exists so the detail-panel button doesn't have to re-send the whole
 * shift just to mark it done.
 */
export async function completeShiftAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("shift.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  if (!id || typeof id !== "string") {
    return { ok: false, error: "Validation failed" };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("shifts") as any))
    .update({ status: "completed" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit("update", id, "Schicht abgeschlossen.");
  revalidatePath(routes.schedule);
  revalidatePath(routes.dashboard);
  return { ok: true, data: { id } };
}

/**
 * Flip status="cancelled" without setting `deleted_at`. Cancellation keeps
 * the row visible (and auditable) — distinct from `deleteShiftAction`'s
 * soft-delete which hides it.
 */
export async function cancelShiftAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("shift.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  if (!id || typeof id !== "string") {
    return { ok: false, error: "Validation failed" };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("shifts") as any))
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit("cancel", id, "Schicht abgesagt.");
  revalidatePath(routes.schedule);
  revalidatePath(routes.dashboard);
  return { ok: true, data: { id } };
}

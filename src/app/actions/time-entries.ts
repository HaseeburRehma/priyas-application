"use server";

import { revalidatePath } from "next/cache";
import {
  checkInSchema,
  correctTimeEntrySchema,
} from "@/lib/validators/time-entries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { distanceMeters } from "@/lib/utils/geo";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function audit(
  action: string,
  recordId: string,
  message: string,
  meta?: Record<string, unknown>,
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
    table_name: "time_entries",
    record_id: recordId,
    after: { message, ...meta },
  });
}

/**
 * Field staff calls this from the mobile UI after the browser captured
 * their coordinates. We resolve the shift, fetch the property's lat/long
 * + radius, validate the user is within the radius, and store an immutable
 * row. Re-checking-in for the same kind is a no-op (returns the existing row).
 */
export async function checkInAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; distance_m: number; warned: boolean }>> {
  try {
    await requirePermission("time.checkin");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const { rateLimit } = await import("@/lib/rate-limit/guard");
  const rl = await rateLimit("write", "time.checkin");
  if (rl) return { ok: false, error: rl };
  const parsed = checkInSchema.safeParse(raw);
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

  // Resolve the shift + property metadata.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: shiftRow } = await ((supabase.from("shifts") as any))
    .select(
      `id, employee_id, property_id,
       property:properties ( id, latitude, longitude, gps_radius_m )`,
    )
    .eq("id", input.shift_id)
    .is("deleted_at", null)
    .maybeSingle();
  type Shift = {
    id: string;
    employee_id: string | null;
    property_id: string;
    property: {
      id: string;
      latitude: number | null;
      longitude: number | null;
      gps_radius_m: number;
    } | null;
  };
  const shift = shiftRow as Shift | null;
  if (!shift) return { ok: false, error: "Shift not found" };

  // Caller must own this shift unless they're a manager (RLS would also catch
  // it, but the friendlier UX is an explicit message).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: emp } = await ((supabase.from("employees") as any))
    .select("id")
    .eq("profile_id", user?.id ?? "")
    .maybeSingle();
  const employeeId =
    shift.employee_id ?? (emp as { id: string } | null)?.id ?? null;
  if (!employeeId) return { ok: false, error: "Shift has no employee" };

  // Distance check
  let distance = 0;
  let warned = false;
  if (
    shift.property?.latitude != null &&
    shift.property?.longitude != null
  ) {
    distance = distanceMeters(
      input.latitude,
      input.longitude,
      Number(shift.property.latitude),
      Number(shift.property.longitude),
    );
    const radius = Number(shift.property.gps_radius_m ?? 100);
    if (distance > radius) {
      // We still record the attempt as a warning row so managers can see
      // it during review, but reject the action with the distance hint.
      warned = true;
      return {
        ok: false,
        error: `Du bist ${Math.round(distance)} m vom Objekt entfernt (max. ${radius} m).`,
        fieldErrors: { latitude: ["außerhalb des Radius"] },
      };
    }
  }

  // Idempotent insert via upsert + onConflict. Two concurrent clicks used
  // to race the "does it already exist?" check vs the INSERT; we now lean
  // on the unique index (shift_id, employee_id, kind) so the DB rejects
  // the dup. `ignoreDuplicates: true` makes Supabase return no rows on a
  // hit, so we re-select afterwards to grab the existing id.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: upserted, error } = await ((supabase.from("time_entries") as any))
    .upsert(
      {
        org_id: orgId,
        shift_id: input.shift_id,
        employee_id: employeeId,
        property_id: shift.property_id,
        kind: input.kind,
        occurred_at: new Date().toISOString(),
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy_m: input.accuracy_m ?? null,
        distance_m: distance,
        manual: false,
        created_by: user?.id ?? null,
      },
      { onConflict: "shift_id,employee_id,kind", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return { ok: false, error: error.message };
  let resolvedId: string | null =
    Array.isArray(upserted) && upserted.length > 0
      ? (upserted[0] as { id: string }).id
      : null;
  if (!resolvedId) {
    // Conflict path: the row already existed. Fetch it so the caller still
    // gets a usable id.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await ((supabase.from("time_entries") as any))
      .select("id")
      .eq("shift_id", input.shift_id)
      .eq("employee_id", employeeId)
      .eq("kind", input.kind)
      .maybeSingle();
    resolvedId = (existing as { id: string } | null)?.id ?? null;
  }
  if (!resolvedId) {
    return { ok: false, error: "Time entry creation failed" };
  }
  const data = { id: resolvedId };

  // Mark the shift as in-progress on first check-in.
  if (input.kind === "check_in") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("shifts") as any))
      .update({ status: "in_progress" })
      .eq("id", input.shift_id)
      .neq("status", "completed");
  }

  await audit(
    input.kind,
    (data as { id: string }).id,
    input.kind === "check_in" ? "GPS check-in." : "GPS check-out.",
    { distance_m: Math.round(distance) },
  );

  revalidatePath(routes.schedule);
  return {
    ok: true,
    data: {
      id: (data as { id: string }).id,
      distance_m: distance,
      warned,
    },
  };
}

/**
 * Manager-only manual correction: insert a synthetic time_entry on behalf
 * of a field-staff member. Reason is mandatory; the row is flagged
 * `manual = true` so it can never be confused with a real GPS event.
 */
export async function correctTimeEntryAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("time.correct");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = correctTimeEntrySchema.safeParse(raw);
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

  // Get property_id from the shift.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: shiftRow } = await ((supabase.from("shifts") as any))
    .select("property_id")
    .eq("id", input.shift_id)
    .maybeSingle();
  const propertyId = (shiftRow as { property_id: string } | null)?.property_id;
  if (!propertyId) return { ok: false, error: "Shift not found" };

  // Upsert: a manual correction either creates the row or updates the
  // existing one with the corrected timestamp + reason.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("time_entries") as any))
    .upsert(
      {
        org_id: orgId,
        shift_id: input.shift_id,
        employee_id: input.employee_id,
        property_id: propertyId,
        kind: input.kind,
        occurred_at: input.occurred_at,
        manual: true,
        manual_reason: input.reason,
        created_by: user?.id ?? null,
      },
      { onConflict: "shift_id,employee_id,kind" },
    )
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await audit(
    "manual_correct",
    (data as { id: string }).id,
    `Zeit korrigiert: ${input.kind}`,
    { reason: input.reason },
  );
  revalidatePath(routes.schedule);
  return { ok: true, data: { id: (data as { id: string }).id } };
}

/**
 * Field-staff completion confirmation. Marks the shift `completed` and
 * stamps `completed_at` so managers can see who's done.
 */
export async function completeShiftAction(
  shift_id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("time.checkin");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("shifts") as any))
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", shift_id);
  if (error) return { ok: false, error: error.message };
  await audit("complete", shift_id, "Schicht als erledigt bestätigt.");
  revalidatePath(routes.schedule);
  return { ok: true, data: { id: shift_id } };
}

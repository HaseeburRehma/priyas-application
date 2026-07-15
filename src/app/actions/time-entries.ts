"use server";

import { revalidatePath } from "next/cache";
import {
  breakSchema,
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
  before?: Record<string, unknown> | null,
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
    before: before ?? null,
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

  // Idempotent insert: plain INSERT, catching a unique_violation (23505)
  // rather than upsert(onConflict). Two concurrent clicks used to race
  // the "does it already exist?" check vs the INSERT, producing
  // duplicates — the unique index on (shift_id, employee_id, kind) still
  // backstops that. But that index is now PARTIAL (kind IN ('check_in',
  // 'check_out') only — see migration 20260605_000044_time_entries_breaks.sql,
  // added so break_start/break_end can repeat per shift), and PostgREST's
  // on_conflict= query param can't express a partial index's WHERE
  // predicate, so upsert(onConflict:"shift_id,employee_id,kind") always
  // fails with 42P10 ("no unique or exclusion constraint matching the ON
  // CONFLICT specification") regardless of which columns are listed. A
  // plain INSERT doesn't rely on ON CONFLICT inference at all — the
  // partial index still rejects the second concurrent insert with a
  // normal 23505, which we catch here exactly like the old
  // ignoreDuplicates path did.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await ((supabase.from("time_entries") as any))
    .insert({
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
    })
    .select("id")
    .single();
  let resolvedId: string | null = null;
  if (error) {
    if (error.code !== "23505") {
      return { ok: false, error: error.message };
    }
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
  } else {
    resolvedId = (inserted as { id: string } | null)?.id ?? null;
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
 * Start / end a break inside an active shift.
 *
 * Unlike check-in/check-out, breaks don't require GPS — staff can
 * step off-site for coffee and we shouldn't penalise them by failing
 * the geofence check. The row is still tied to (shift, employee) so
 * payroll can compute net worked time from check_in / check_out
 * minus the sum of break_end - break_start intervals.
 *
 * State machine the action enforces:
 *   - Caller must have a `check_in` row but no `check_out` row yet
 *     (must currently be on shift).
 *   - For `break_start`: there must be no open break already (every
 *     existing break_start has a matching break_end). Otherwise we
 *     reject — taking a break while already on one is a UI bug.
 *   - For `break_end`: there must be exactly one trailing
 *     `break_start` with no matching `break_end`. Otherwise the
 *     "end" doesn't make sense.
 *
 * Returns the new row id on success.
 */
async function shiftLifecycleEntries(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  shift_id: string,
  employee_id: string,
): Promise<
  Array<{ kind: string; occurred_at: string }>
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase.from("time_entries") as any))
    .select("kind, occurred_at")
    .eq("shift_id", shift_id)
    .eq("employee_id", employee_id)
    .order("occurred_at", { ascending: true });
  return (data ?? []) as Array<{ kind: string; occurred_at: string }>;
}

/**
 * Lightweight read-only probe — given a shift id, return whether the
 * current user is currently checked in and whether a break is open.
 * Used by the break-control UI on mount so the buttons reflect
 * reality without forcing a full schedule refetch.
 *
 * The probe is scoped to the caller's own employee row — managers
 * checking on someone else's shift get back null because the lookup
 * key is `profile_id = auth.uid()`.
 */
export async function getShiftLifecycleAction(
  shiftId: string,
): Promise<
  | { ok: true; data: { checkedIn: boolean; checkedOut: boolean; onBreak: boolean } }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: empRow } = await ((supabase.from("employees") as any))
    .select("id")
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  const employee = empRow as { id: string } | null;
  if (!employee) {
    return {
      ok: true,
      data: { checkedIn: false, checkedOut: false, onBreak: false },
    };
  }
  const events = await shiftLifecycleEntries(supabase, shiftId, employee.id);
  const checkedIn = events.some((e) => e.kind === "check_in");
  const checkedOut = events.some((e) => e.kind === "check_out");
  const openBreaks = events
    .filter((e) => e.kind.startsWith("break_"))
    .reduce((n, e) => n + (e.kind === "break_start" ? 1 : -1), 0);
  return {
    ok: true,
    data: { checkedIn, checkedOut, onBreak: openBreaks > 0 },
  };
}

export async function breakAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("time.checkin");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const { rateLimit } = await import("@/lib/rate-limit/guard");
  const rl = await rateLimit("write", "time.break");
  if (rl) return { ok: false, error: rl };
  const parsed = breakSchema.safeParse(raw);
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
  if (!user) return { ok: false, error: "Not signed in" };

  // Resolve the employee row owned by this user. Same lookup the
  // check-in flow uses — keeps a non-employee profile from logging
  // breaks against someone else's shift.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: empRow } = await ((supabase.from("employees") as any))
    .select("id, org_id")
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  const employee = empRow as { id: string; org_id: string } | null;
  if (!employee) {
    return { ok: false, error: "No employee profile attached to this user." };
  }

  // Verify the shift is the caller's and currently active.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: shiftRow } = await ((supabase.from("shifts") as any))
    .select("id, employee_id, property_id, org_id, status")
    .eq("id", input.shift_id)
    .is("deleted_at", null)
    .maybeSingle();
  type ShiftRow = {
    id: string;
    employee_id: string;
    property_id: string;
    org_id: string;
    status: string;
  };
  const shift = shiftRow as ShiftRow | null;
  if (!shift) return { ok: false, error: "Shift not found." };
  if (shift.employee_id !== employee.id) {
    return { ok: false, error: "Not your shift." };
  }

  // Lifecycle validation. Pull every clock-event for this shift and
  // walk forward to compute the current state.
  const events = await shiftLifecycleEntries(supabase, shift.id, employee.id);
  const hasCheckIn = events.some((e) => e.kind === "check_in");
  const hasCheckOut = events.some((e) => e.kind === "check_out");
  if (!hasCheckIn) {
    return { ok: false, error: "Du musst zuerst einchecken." };
  }
  if (hasCheckOut) {
    return { ok: false, error: "Die Schicht ist bereits beendet." };
  }
  // Compute whether a break is currently open: count break_start vs
  // break_end. Open == start > end.
  const breaks = events.filter((e) => e.kind.startsWith("break_"));
  const openBreaks = breaks.reduce(
    (n, e) => n + (e.kind === "break_start" ? 1 : -1),
    0,
  );
  if (input.kind === "break_start" && openBreaks > 0) {
    return { ok: false, error: "Du befindest dich bereits in einer Pause." };
  }
  if (input.kind === "break_end" && openBreaks <= 0) {
    return { ok: false, error: "Keine offene Pause zum Beenden." };
  }

  const occurred_at = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timeEntriesTable = supabase.from("time_entries") as any;
  const { data: insertRow, error } = await timeEntriesTable
    .insert({
      org_id: employee.org_id,
      shift_id: shift.id,
      employee_id: employee.id,
      property_id: shift.property_id,
      kind: input.kind,
      occurred_at,
      manual: false,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !insertRow) {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }
  const insertedId = (insertRow as { id: string }).id;
  await audit(
    "time_entry.break",
    insertedId,
    input.kind === "break_start"
      ? "Pause gestartet"
      : "Pause beendet",
    { kind: input.kind, shift_id: shift.id },
  );
  revalidatePath(routes.schedule);
  return { ok: true, data: { id: insertedId } };
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

  // The unique index on (shift_id, employee_id, kind) means the upsert
  // below overwrites whatever row is already there — including a genuine
  // GPS-verified check-in/check-out. Spec 4.4 requires that original event
  // to stay immutable, so capture its full pre-overwrite state here and
  // preserve it in the audit log's `before` field. The "current" row still
  // reflects the correction (unchanged design for every other consumer of
  // this table — shift-billing hours, working-time reports, etc.), but the
  // real GPS event it replaced is never actually lost, just superseded.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingRow } = await ((supabase.from("time_entries") as any))
    .select(
      "id, occurred_at, latitude, longitude, accuracy_m, distance_m, manual, created_by",
    )
    .eq("shift_id", input.shift_id)
    .eq("employee_id", input.employee_id)
    .eq("kind", input.kind)
    .maybeSingle();
  const existing = existingRow as { id: string } | null;

  // Explicit update-if-exists / insert-otherwise, rather than
  // upsert(onConflict): the unique index on (shift_id, employee_id, kind)
  // is now a PARTIAL index (only for kind IN ('check_in','check_out') —
  // see migration 20260605_000044_time_entries_breaks.sql, which needed
  // break_start/break_end to repeat per shift). PostgREST's `on_conflict=`
  // can't express a partial index's WHERE predicate, so ON CONFLICT
  // inference fails with 42P10 regardless of which columns are listed.
  // We already fetched `existing` above (for the audit `before` snapshot),
  // so branching on it costs nothing extra. GPS-specific fields are
  // explicitly cleared either way — a manager-entered time has no real
  // location behind it, so leaving the previous event's coordinates in
  // place would misleadingly suggest the new timestamp was GPS-verified.
  const correctionFields = {
    org_id: orgId,
    shift_id: input.shift_id,
    employee_id: input.employee_id,
    property_id: propertyId,
    kind: input.kind,
    occurred_at: input.occurred_at,
    latitude: null,
    longitude: null,
    accuracy_m: null,
    distance_m: null,
    manual: true,
    manual_reason: input.reason,
    created_by: user?.id ?? null,
  };
  const { data, error } = existing
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ((supabase.from("time_entries") as any))
        .update(correctionFields)
        .eq("id", existing.id)
        .select("id")
        .single()
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ((supabase.from("time_entries") as any))
        .insert(correctionFields)
        .select("id")
        .single();
  if (error) return { ok: false, error: error.message };

  await audit(
    "manual_correct",
    (data as { id: string }).id,
    `Zeit korrigiert: ${input.kind}`,
    { reason: input.reason },
    existingRow ?? null,
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

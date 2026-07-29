"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError, getCurrentRole } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { getCachedUser } from "@/lib/api/current-user";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function audit(action: string, recordId: string, message: string) {
  const supabase = await createSupabaseServerClient();
  const user = await getCachedUser();
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

/** Sum of check_in/check_out time_entries for a shift, in minutes. Null if the pair is incomplete. */
async function computeActualMinutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  shiftId: string,
): Promise<number | null> {
  const { data: entryRows } = await supabase
    .from("time_entries")
    .select("kind, occurred_at")
    .eq("shift_id", shiftId)
    .in("kind", ["check_in", "check_out"]);
  type Entry = { kind: string; occurred_at: string };
  let checkIn: number | null = null;
  let checkOut: number | null = null;
  for (const e of (entryRows ?? []) as Entry[]) {
    const t = new Date(e.occurred_at).getTime();
    if (e.kind === "check_in") checkIn = t;
    if (e.kind === "check_out") checkOut = t;
  }
  return checkIn != null && checkOut != null
    ? Math.round((checkOut - checkIn) / 60_000)
    : null;
}

/**
 * Approve a completed shift for billing. This is the missing link between
 * time tracking and invoicing: `prepareDraftForRange()` (invoice-draft.ts)
 * only ever picks up shifts with `billing_status = 'approved'`, but until
 * this action existed nothing in the app ever set that — shifts sat in
 * 'pending' forever and could never be billed.
 *
 * Billable minutes default to the real check-in/check-out duration; falls
 * back to the scheduled window when no GPS check-in/out pair was recorded
 * (e.g. a manually-logged shift), and `overrideMinutes` lets the approver
 * correct either case (rounding, an early checkout, etc.) before locking it in.
 */
export async function approveShiftBillingAction(
  shiftId: string,
  overrideMinutes?: number,
): Promise<ActionResult<{ id: string; billableMinutes: number }>> {
  try {
    await requirePermission("shift.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const { userId } = await getCurrentRole();
  if (!userId) return { ok: false, error: "Nicht angemeldet." };

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: shiftRow } = await ((supabase.from("shifts") as any))
    .select("id, status, billing_status, starts_at, ends_at")
    .eq("id", shiftId)
    .is("deleted_at", null)
    .maybeSingle();
  const shift = shiftRow as
    | { id: string; status: string; billing_status: string; starts_at: string; ends_at: string }
    | null;
  if (!shift) return { ok: false, error: "Schicht nicht gefunden." };
  if (shift.status !== "completed") {
    return { ok: false, error: "Nur abgeschlossene Schichten können zur Abrechnung freigegeben werden." };
  }
  if (shift.billing_status !== "pending") {
    return { ok: false, error: "Schicht wurde bereits freigegeben oder abgelehnt." };
  }

  const computedMinutes = await computeActualMinutes(supabase, shiftId);
  const scheduledMinutes = Math.round(
    (new Date(shift.ends_at).getTime() - new Date(shift.starts_at).getTime()) / 60_000,
  );
  const finalMinutes = overrideMinutes ?? computedMinutes ?? scheduledMinutes;
  if (!Number.isFinite(finalMinutes) || finalMinutes <= 0) {
    return { ok: false, error: "Ungültige Dauer." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("shifts") as any))
    .update({
      billing_status: "approved",
      actual_minutes: computedMinutes ?? finalMinutes,
      billable_minutes: finalMinutes,
      approved_by: userId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", shiftId);
  if (error) return { ok: false, error: error.message };

  await audit(
    "shift_billing_approve",
    shiftId,
    `Schicht zur Abrechnung freigegeben (${finalMinutes} Min.).`,
  );
  revalidatePath(routes.schedule);
  revalidatePath(routes.scheduleBillingApproval);
  revalidatePath(routes.invoiceNew);
  return { ok: true, data: { id: shiftId, billableMinutes: finalMinutes } };
}

/** Reject a completed shift for billing (e.g. disputed hours) with a reason. */
export async function rejectShiftBillingAction(
  shiftId: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("shift.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Bitte einen Grund angeben." };

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: shiftRow } = await ((supabase.from("shifts") as any))
    .select("id, billing_status")
    .eq("id", shiftId)
    .is("deleted_at", null)
    .maybeSingle();
  const shift = shiftRow as { id: string; billing_status: string } | null;
  if (!shift) return { ok: false, error: "Schicht nicht gefunden." };
  if (shift.billing_status !== "pending") {
    return { ok: false, error: "Schicht wurde bereits bearbeitet." };
  }

  const { userId } = await getCurrentRole();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("shifts") as any))
    .update({
      billing_status: "rejected",
      rejection_reason: trimmed,
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", shiftId);
  if (error) return { ok: false, error: error.message };

  await audit("shift_billing_reject", shiftId, `Schicht abgelehnt: ${trimmed}`);
  revalidatePath(routes.schedule);
  revalidatePath(routes.scheduleBillingApproval);
  return { ok: true, data: { id: shiftId } };
}

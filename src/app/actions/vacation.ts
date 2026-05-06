"use server";

import { revalidatePath } from "next/cache";
import {
  createVacationSchema,
  respondVacationSuggestionSchema,
  reviewVacationSchema,
  suggestVacationSchema,
} from "@/lib/validators/vacation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

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
    table_name: "vacation_requests",
    record_id: recordId,
    after: { message, meta: "via WebApp" },
  });
}

function dayCount(start: string, end: string): number {
  const ms =
    new Date(end).getTime() - new Date(start).getTime() + 86_400_000;
  return Math.max(1, Math.round(ms / 86_400_000));
}

export async function createVacationRequestAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("vacation.request");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = createVacationSchema.safeParse(raw);
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

  const days = dayCount(input.start_date, input.end_date);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("vacation_requests") as any))
    .insert({
      org_id: orgId,
      employee_id: input.employee_id,
      start_date: input.start_date,
      end_date: input.end_date,
      days,
      reason: input.reason || null,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const newId = (data as { id: string }).id;
  await audit("create", newId, `Urlaubsantrag eingereicht (${days} Tage).`);
  revalidatePath(routes.vacation);
  return { ok: true, data: { id: newId } };
}

export async function reviewVacationRequestAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("vacation.approve");
    void ctx;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = reviewVacationSchema.safeParse(raw);
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
  const { error } = await ((supabase.from("vacation_requests") as any))
    .update({
      status: input.approve ? "approved" : "rejected",
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
      reviewer_note: input.reviewer_note || null,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  await audit(
    input.approve ? "approve" : "reject",
    input.id,
    input.approve ? "Urlaub genehmigt." : "Urlaub abgelehnt.",
  );
  revalidatePath(routes.vacation);
  return { ok: true, data: { id: input.id } };
}

export async function cancelVacationRequestAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("vacation.request");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("vacation_requests") as any))
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit("cancel", id, "Urlaubsantrag zurückgezogen.");
  revalidatePath(routes.vacation);
  return { ok: true, data: { id } };
}

/**
 * Manager-only — propose alternative dates instead of approve/reject.
 * Sets status="suggested"; the employee then accepts or counter-suggests.
 */
export async function suggestVacationDatesAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("vacation.approve");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = suggestVacationSchema.safeParse(raw);
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
  const { error } = await ((supabase.from("vacation_requests") as any))
    .update({
      status: "suggested",
      suggested_start: input.suggested_start,
      suggested_end: input.suggested_end,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
      reviewer_note: input.reviewer_note || null,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  await audit(
    "suggest",
    input.id,
    `Alternative Daten vorgeschlagen: ${input.suggested_start} → ${input.suggested_end}`,
  );
  revalidatePath(routes.vacation);
  return { ok: true, data: { id: input.id } };
}

/**
 * Employee response to a suggested alternative.
 *  • accept = true → applies the suggested dates as canonical and approves
 *  • accept = false → reverts to "pending" so the manager can re-review
 *    (the employee can also call cancel to withdraw entirely)
 */
export async function respondVacationSuggestionAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("vacation.request");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = respondVacationSuggestionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Validation failed" };
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await ((supabase.from("vacation_requests") as any))
    .select("id, suggested_start, suggested_end, status")
    .eq("id", input.id)
    .maybeSingle();
  type Row = {
    id: string;
    suggested_start: string | null;
    suggested_end: string | null;
    status: string;
  };
  const r = row as Row | null;
  if (!r || r.status !== "suggested") {
    return { ok: false, error: "Kein offener Vorschlag." };
  }

  if (input.accept) {
    if (!r.suggested_start || !r.suggested_end) {
      return { ok: false, error: "Keine Alternativdaten hinterlegt." };
    }
    const startMs = new Date(r.suggested_start).getTime();
    const endMs = new Date(r.suggested_end).getTime();
    const days = Math.max(
      1,
      Math.round((endMs - startMs) / 86_400_000) + 1,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await ((supabase.from("vacation_requests") as any))
      .update({
        status: "approved",
        start_date: r.suggested_start,
        end_date: r.suggested_end,
        days,
        suggested_start: null,
        suggested_end: null,
      })
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    await audit("accept_suggestion", input.id, "Vorschlag angenommen.");
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await ((supabase.from("vacation_requests") as any))
      .update({
        status: "pending",
        suggested_start: null,
        suggested_end: null,
      })
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    await audit("reject_suggestion", input.id, "Vorschlag abgelehnt.");
  }

  revalidatePath(routes.vacation);
  return { ok: true, data: { id: input.id } };
}

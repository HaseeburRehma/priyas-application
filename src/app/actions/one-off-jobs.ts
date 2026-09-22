"use server";

/**
 * Feature-update #17 · Quick / one-time cleaning jobs.
 *
 * Persists to public.one_off_jobs. Invoicing is handled manually by
 * Priya's team (no Lexware path); this action just records the fact
 * that <employee> did <hours> hours of <description> on <date> for a
 * one-off customer who was never given a full clients row.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { createOneOffJobSchema } from "@/lib/validators/one-off-jobs";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createOneOffJobAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    // Same RBAC as normal shift creation — dispatcher + admin.
    await requirePermission("shift.create");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }

  const parsed = createOneOffJobSchema.safeParse(raw);
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
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("one_off_jobs") as any))
    .insert({
      org_id: orgId,
      employee_id: input.employee_id,
      performed_on: input.performed_on,
      description: input.description,
      hours: input.hours,
      invoice_note: input.invoice_note || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.schedule);
  return { ok: true, data: { id: (data as { id: string }).id } };
}

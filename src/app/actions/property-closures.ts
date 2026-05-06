"use server";

import { revalidatePath } from "next/cache";
import { upsertPropertyClosureSchema } from "@/lib/validators/property-closures";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function upsertPropertyClosureAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("property.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = upsertPropertyClosureSchema.safeParse(raw);
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

  const row = {
    org_id: orgId,
    property_id: input.property_id,
    start_date: input.start_date,
    end_date: input.end_date,
    reason: input.reason,
    notes: input.notes || null,
    created_by: user?.id ?? null,
  };

  if (input.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await ((supabase.from("property_closures") as any))
      .update(row)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.property(input.property_id));
    return { ok: true, data: { id: input.id } };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("property_closures") as any))
    .insert(row)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.property(input.property_id));
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function deletePropertyClosureAction(
  id: string,
  property_id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("property.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("property_closures") as any))
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.property(property_id));
  return { ok: true, data: { id } };
}

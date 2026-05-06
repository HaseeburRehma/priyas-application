"use server";

import { revalidatePath } from "next/cache";
import { upsertClientContactSchema } from "@/lib/validators/client-contacts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function upsertClientContactAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("client.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = upsertClientContactSchema.safeParse(raw);
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

  // Enforce at-most-one primary: clear existing primary on this client if
  // we're setting a new one. (Partial unique index also catches this at DB.)
  if (input.is_primary) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("client_contacts") as any))
      .update({ is_primary: false })
      .eq("client_id", input.client_id)
      .eq("is_primary", true);
  }

  const row = {
    org_id: orgId,
    client_id: input.client_id,
    full_name: input.full_name.trim(),
    role: input.role || null,
    email: input.email || null,
    phone: input.phone || null,
    is_primary: input.is_primary,
    notes: input.notes || null,
  };

  if (input.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await ((supabase.from("client_contacts") as any))
      .update(row)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(routes.client(input.client_id));
    return { ok: true, data: { id: input.id } };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("client_contacts") as any))
    .insert(row)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.client(input.client_id));
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function deleteClientContactAction(
  id: string,
  client_id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("client.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("client_contacts") as any))
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.client(client_id));
  return { ok: true, data: { id } };
}

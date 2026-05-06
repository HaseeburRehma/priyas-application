"use server";

import { revalidatePath } from "next/cache";
import {
  createPropertySchema,
  updatePropertySchema,
} from "@/lib/validators/properties";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
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
    table_name: "properties",
    record_id: recordId,
    after: { message, meta: "via WebApp" },
  });
}

export async function createPropertyAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("property.create");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const parsed = createPropertySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
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

  const input = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("properties") as any))
    .insert({
      org_id: orgId,
      client_id: input.client_id,
      name: input.name,
      address_line1: input.address_line1,
      address_line2: input.address_line2 || null,
      postal_code: input.postal_code,
      city: input.city,
      country: input.country || "DE",
      size_sqm: typeof input.size_sqm === "number" ? input.size_sqm : null,
      notes: input.notes || null,
      floor: input.floor || null,
      building_section: input.building_section || null,
      access_code: input.access_code || null,
      allergies: input.allergies || null,
      restricted_areas: input.restricted_areas || null,
      safety_regulations: input.safety_regulations || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const newId = (data as { id: string }).id;
  await audit("create", newId, `Objekt <strong>${input.name}</strong> wurde angelegt.`);
  revalidatePath(routes.properties);
  revalidatePath(routes.dashboard);
  return { ok: true, data: { id: newId } };
}

export async function updatePropertyAction(
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
  const parsed = updatePropertySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("properties") as any))
    .update({
      client_id: input.client_id,
      name: input.name,
      address_line1: input.address_line1,
      address_line2: input.address_line2 || null,
      postal_code: input.postal_code,
      city: input.city,
      country: input.country || "DE",
      size_sqm: typeof input.size_sqm === "number" ? input.size_sqm : null,
      notes: input.notes || null,
      floor: input.floor || null,
      building_section: input.building_section || null,
      access_code: input.access_code || null,
      allergies: input.allergies || null,
      restricted_areas: input.restricted_areas || null,
      safety_regulations: input.safety_regulations || null,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  await audit("update", input.id, `Objekt <strong>${input.name}</strong> aktualisiert.`);
  revalidatePath(routes.property(input.id));
  revalidatePath(routes.properties);
  return { ok: true, data: { id: input.id } };
}

export async function deletePropertyAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("property.delete");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  // Soft-delete: set deleted_at so RLS hides the row from normal queries.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("properties") as any))
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit("delete", id, "Objekt entfernt.");
  revalidatePath(routes.properties);
  return { ok: true, data: { id } };
}

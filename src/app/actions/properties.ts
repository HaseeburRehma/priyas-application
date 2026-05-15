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
  before: unknown = null,
  extra: Record<string, unknown> = {},
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
    before: before ?? null,
    after: { message, meta: "via WebApp", ...extra },
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

  // Capture pre-update snapshot so the audit row carries a real
  // `before` diff. Without this the audit log loses half the change
  // history (only new values land in `after`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: beforeRow } = await ((supabase.from("properties") as any))
    .select(
      "client_id, name, address_line1, address_line2, postal_code, city, country, size_sqm, notes, floor, building_section, access_code, allergies, restricted_areas, safety_regulations",
    )
    .eq("id", input.id)
    .maybeSingle();

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
  await audit(
    "update",
    input.id,
    `Objekt <strong>${input.name}</strong> aktualisiert.`,
    beforeRow ?? null,
  );
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
  // Capture pre-delete snapshot for the audit log.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: beforeRow } = await ((supabase.from("properties") as any))
    .select("name, address_line1, postal_code, city, deleted_at")
    .eq("id", id)
    .maybeSingle();
  // Soft-delete: set deleted_at so RLS hides the row from normal queries.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("properties") as any))
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit("delete", id, "Objekt entfernt.", beforeRow ?? null);
  revalidatePath(routes.properties);
  return { ok: true, data: { id } };
}

/* ============================================================================
 * Bulk actions — operate on an array of property IDs.
 * Each returns a per-row summary so the caller can surface partial success.
 * ========================================================================== */

export type BulkActionSummary = {
  ok: true;
  data: {
    ok: number;
    failed: number;
    /** Stable per-row errors so the UI can highlight rows on retry. */
    errors: Array<{ id: string; error: string }>;
  };
};

/**
 * Bulk soft-delete (archive) properties. Iterates through the input
 * list and mirrors `deletePropertyAction` for each. Stops early if
 * the caller lacks `property.delete` — same permission gate as the
 * single-item action so the rule is consistent.
 */
export async function bulkArchivePropertiesAction(
  ids: string[],
): Promise<BulkActionSummary | { ok: false; error: string }> {
  try {
    await requirePermission("property.delete");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: true, data: { ok: 0, failed: 0, errors: [] } };
  }
  // De-dupe + guard against absurd payload sizes.
  const unique = Array.from(new Set(ids.filter((s) => typeof s === "string")));
  if (unique.length > 500) {
    return { ok: false, error: "Too many items selected (max 500)." };
  }

  const supabase = await createSupabaseServerClient();
  const errors: Array<{ id: string; error: string }> = [];
  let success = 0;
  const nowIso = new Date().toISOString();

  for (const id of unique) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: beforeRow } = await ((supabase.from("properties") as any))
      .select("name, address_line1, postal_code, city, deleted_at")
      .eq("id", id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await ((supabase.from("properties") as any))
      .update({ deleted_at: nowIso })
      .eq("id", id);
    if (error) {
      errors.push({ id, error: error.message });
      continue;
    }
    await audit(
      "delete",
      id,
      "Objekt entfernt (Bulk-Aktion).",
      beforeRow ?? null,
    );
    success += 1;
  }

  revalidatePath(routes.properties);
  return {
    ok: true,
    data: { ok: success, failed: errors.length, errors },
  };
}

/**
 * Bulk reassign selected properties to a new client. Requires
 * `property.update`. Each row's `client_id` is overwritten and an
 * audit entry is logged.
 */
export async function bulkAssignPropertiesAction(
  ids: string[],
  clientId: string,
): Promise<BulkActionSummary | { ok: false; error: string }> {
  try {
    await requirePermission("property.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  if (typeof clientId !== "string" || clientId.length === 0) {
    return { ok: false, error: "Missing client_id" };
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: true, data: { ok: 0, failed: 0, errors: [] } };
  }
  const unique = Array.from(new Set(ids.filter((s) => typeof s === "string")));
  if (unique.length > 500) {
    return { ok: false, error: "Too many items selected (max 500)." };
  }

  const supabase = await createSupabaseServerClient();
  const errors: Array<{ id: string; error: string }> = [];
  let success = 0;

  for (const id of unique) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: beforeRow } = await ((supabase.from("properties") as any))
      .select("name, client_id")
      .eq("id", id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await ((supabase.from("properties") as any))
      .update({ client_id: clientId })
      .eq("id", id);
    if (error) {
      errors.push({ id, error: error.message });
      continue;
    }
    await audit(
      "update",
      id,
      `Objekt einem anderen Kunden zugewiesen (Bulk-Aktion).`,
      beforeRow ?? null,
      { client_id: clientId },
    );
    success += 1;
  }

  revalidatePath(routes.properties);
  return {
    ok: true,
    data: { ok: success, failed: errors.length, errors },
  };
}

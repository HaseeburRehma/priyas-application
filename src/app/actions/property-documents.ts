"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// SECURITY: validate shape AND scope. Without this a same-org user could
// pass an arbitrary `storage_path` belonging to a different property and
// have its PDF surface in the wrong property's UI.
const setConceptSchema = z.object({
  property_id: z.string().uuid(),
  storage_path: z.string().min(1).max(500).nullable(),
});

/**
 * Record an already-uploaded cleaning concept PDF on a property.
 *
 * Flow: the browser uploads the file directly to the `property-documents`
 * bucket (RLS scoped to org). On success it calls this action with the
 * resulting Storage path; we persist that path on the properties row.
 */
export async function setCleaningConceptAction(
  property_id: string,
  storage_path: string | null,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("property.update");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }

  const parsed = setConceptSchema.safeParse({ property_id, storage_path });
  if (!parsed.success) {
    return { ok: false, error: "Validation failed" };
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

  // SECURITY: verify the property belongs to the caller's org BEFORE we
  // touch it. RLS still enforces this at the DB layer but we want an
  // explicit, early failure with a clean error message.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propRow } = await ((supabase.from("properties") as any))
    .select("id, org_id")
    .eq("id", input.property_id)
    .maybeSingle();
  const property = propRow as { id: string; org_id: string } | null;
  if (!property || property.org_id !== orgId) {
    return { ok: false, error: "Forbidden" };
  }

  // When clearing (null) we skip the path checks below.
  if (input.storage_path !== null) {
    // Storage convention is `${orgId}/${propertyId}/...` — see
    // CleaningConceptCard. Reject any path that doesn't scope to BOTH the
    // caller's org AND the target property.
    if (!input.storage_path.startsWith(`${orgId}/`)) {
      return { ok: false, error: "Invalid storage path" };
    }
    if (!input.storage_path.includes(`/${input.property_id}/`)) {
      return { ok: false, error: "Invalid storage path" };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("properties") as any))
    .update({ cleaning_concept_path: input.storage_path })
    .eq("id", input.property_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.property(input.property_id));
  return { ok: true, data: { id: input.property_id } };
}

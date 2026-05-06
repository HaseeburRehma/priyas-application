"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

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
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("properties") as any))
    .update({ cleaning_concept_path: storage_path })
    .eq("id", property_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(routes.property(property_id));
  return { ok: true, data: { id: property_id } };
}

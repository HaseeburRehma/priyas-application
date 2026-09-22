"use server";

/**
 * Feature-update #18 · Supply-flag resolution.
 *
 * Field staff INSERT rows into supply_flags via the mobile app (the
 * mobile-side UI ships in a later commit). This action is the web
 * PM's counterpart — mark a flag resolved once the missing supplies
 * have been ordered / brought.
 *
 * Insert path stays where field staff already write it (mobile app
 * uses the anon-key + RLS insert policy from migration 000062).
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Mark a supply flag as resolved. Requires the same permission the
 * damage-resolve flow uses (dispatcher + admin) so PMs can clear
 * these but individual field staff can't.
 *
 * `clientId` is passed alongside `flagId` for the revalidatePath
 * cascade — the flag's linked client's detail page is the surface
 * that renders these.
 */
export async function resolveSupplyFlagAction(
  flagId: string,
  clientId: string,
): Promise<ActionResult<null>> {
  try {
    await requirePermission("damage.resolve");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("supply_flags") as any))
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq("id", flagId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.client(clientId));
  return { ok: true, data: null };
}

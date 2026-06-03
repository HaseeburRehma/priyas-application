"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { routes } from "@/lib/constants/routes";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Flip `employees.system_unlocked_at` to NOW() for the calling user
 * once every mandatory training module is signed off.
 *
 * The check is server-side so a tampered client can't bypass the gate:
 * we re-run `employee_has_outstanding_mandatory_training()` here before
 * stamping the unlock. Returns the new unlock timestamp so the page can
 * show a confirmation toast and navigate to the dashboard.
 */
export async function unlockSystemAction(): Promise<
  ActionResult<{ unlockedAt: string }>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Resolve employee row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: empRow } = await ((supabase.from("employees") as any))
    .select("id, system_unlocked_at")
    .eq("profile_id", user.id)
    .maybeSingle();
  const emp = empRow as
    | { id: string; system_unlocked_at: string | null }
    | null;
  if (!emp) return { ok: false, error: "no_employee_row" };
  if (emp.system_unlocked_at) {
    // Already unlocked — nothing to do, but treat as success so a
    // duplicated click from the UI doesn't show an error.
    return { ok: true, data: { unlockedAt: emp.system_unlocked_at } };
  }

  // Authoritative recheck — refuse to unlock if any mandatory module
  // is still incomplete. The RPC was added in migration 000039 so the
  // generated supabase types may not include its signature yet; cast
  // through `any` until `supabase gen types` is re-run.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: outstanding } = await (supabase.rpc as any)(
    "employee_has_outstanding_mandatory_training",
    { p_employee_id: emp.id },
  );
  if (outstanding === true) {
    return {
      ok: false,
      error: "Mandatory training modules still pending. Complete them first.",
    };
  }

  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("employees") as any))
    .update({ system_unlocked_at: nowIso })
    .eq("id", emp.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(routes.dashboard);
  revalidatePath(routes.onboardVideos);
  return { ok: true, data: { unlockedAt: nowIso } };
}

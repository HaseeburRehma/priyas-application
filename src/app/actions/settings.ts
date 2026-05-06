"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateSettingsAction(
  patch: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    await requirePermission("settings.update");
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // Read existing JSON data, deep-merge top-level keys, write back.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cur } = await ((supabase.from("settings") as any))
    .select("data")
    .eq("org_id", orgId)
    .maybeSingle();
  const existing = ((cur as { data: Record<string, unknown> } | null)?.data) ?? {};
  const merged = { ...existing, ...patch };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("settings") as any))
    .upsert({ org_id: orgId, data: merged });
  if (error) return { ok: false, error: error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("audit_log") as any)).insert({
    org_id: orgId,
    user_id: user?.id ?? null,
    action: "update",
    table_name: "settings",
    record_id: null,
    after: { keys: Object.keys(patch) },
  });

  revalidatePath(routes.settings);
  return { ok: true };
}

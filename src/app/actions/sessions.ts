"use server";

/**
 * Per-user session controls — currently a single action:
 * `signOutOtherDevicesAction()` invalidates all sessions for the
 * signed-in user except the one making the request.
 *
 * Supabase exposes this via `supabase.auth.signOut({ scope: 'others' })`,
 * which calls `auth.sign_out` server-side with the `others` scope and
 * invalidates the refresh tokens on every other device. The current
 * session's tokens are kept, so the user stays signed in here.
 *
 * Audit-logged so admins can spot abuse (e.g. someone repeatedly
 * forcing logout on a colleague's device).
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function signOutOtherDevicesAction(): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  // `scope: 'others'` invalidates every other refresh token while
  // keeping the current request's session intact. The user stays
  // signed-in on this device but every other tab/device gets bumped
  // to the login screen the next time they try to refresh.
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { ok: false, error: error.message };

  // Best-effort audit row. Non-blocking — if the insert fails we
  // still return success because the actual sign-out succeeded.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileTable = supabase.from("profiles") as any;
    const { data: profile } = await profileTable
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId =
      (profile as { org_id: string | null } | null)?.org_id ?? null;
    if (orgId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ((supabase.from("audit_log") as any)).insert({
        org_id: orgId,
        user_id: user.id,
        action: "session.signed_out_others",
        table_name: "auth.sessions",
        record_id: user.id,
        after: { scope: "others", message: "Signed out all other devices" },
      });
    }
  } catch {
    // Audit is opportunistic — keep the success result.
  }

  return { ok: true };
}

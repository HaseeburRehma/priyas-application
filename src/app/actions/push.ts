"use server";

import { pushSubscriptionSchema } from "@/lib/validators/push";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Persist a Web Push subscription for the current user. Idempotent:
 * upserts on the unique `endpoint` so re-subscribing on the same device
 * just refreshes the keys + last_seen_at.
 */
export async function registerPushSubscriptionAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = pushSubscriptionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid subscription" };
  const sub = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("push_subscriptions") as any))
    .upsert(
      {
        org_id: orgId,
        profile_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: sub.user_agent || null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    )
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { id: (data as { id: string }).id } };
}

/**
 * Remove a subscription by endpoint. Used when the user denies permission
 * later, clears their browser data, or when the Push Service tells us a
 * subscription has expired (404/410 from `web-push.sendNotification`).
 */
export async function unregisterPushSubscriptionAction(
  endpoint: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("push_subscriptions") as any))
    .delete()
    .eq("endpoint", endpoint)
    .eq("profile_id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

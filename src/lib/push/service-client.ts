import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/constants/env";

/**
 * Service-role client for push fan-out. Push targets *other* users
 * (e.g. "new client" → every admin), but `push_subscriptions` and
 * `user_devices` RLS only expose a user's own rows — so the lookup
 * can't run on the caller's session. Null when the key isn't set
 * (local dev); callers then skip delivery.
 */
export function createPushServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
}

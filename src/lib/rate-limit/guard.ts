import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consume, LIMITS, type RateLimitOptions } from "./limiter";

type LimitName = keyof typeof LIMITS;

/**
 * Rate-limit guard for server actions. Returns `null` when the call is
 * allowed; returns a string error message when the user has overflowed
 * the limit (use it directly as the `error` field in your ActionResult).
 *
 *   const blocked = await rateLimit("write", "client.create");
 *   if (blocked) return { ok: false, error: blocked };
 *
 * Keys are scoped per (user, action). For unauthenticated callers we fall
 * back to "anon" — that's intentional: the auth boundary already filters
 * most abuse, and we don't trust client-side IP headers.
 */
export async function rateLimit(
  bucket: LimitName,
  action: string,
  override?: RateLimitOptions,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const key = `${user?.id ?? "anon"}:${action}`;
  const result = consume(key, override ?? LIMITS[bucket]);
  if (result.ok) return null;
  const sec = Math.ceil(result.retryAfterMs / 1000);
  return `Zu viele Anfragen. Bitte versuche es in ${sec}s erneut.`;
}

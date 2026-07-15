import "server-only";

import crypto from "node:crypto";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Shared device-fingerprint + revocation-lookup primitives.
 *
 * The algorithm (sha256(userId|ua|lang), hex, first 40 chars) must stay
 * byte-identical across three call sites: this Node implementation (used
 * by Server Actions/Server Components), the Edge-native reimplementation
 * in `src/lib/supabase/middleware.ts` (Edge runtime has no `node:crypto`),
 * and any future Bearer-token API route that can't rely on either.
 */
export function computeDeviceFingerprint(
  userId: string,
  ua: string,
  lang: string,
): string {
  return crypto
    .createHash("sha256")
    .update(`${userId}|${ua}|${lang}`)
    .digest("hex")
    .slice(0, 40);
}

/**
 * True if the given (userId, fingerprint) pair has a `revoked_at` set in
 * `user_devices` — i.e. the user hit "Revoke" in Settings → Sessions &
 * Devices for this browser/device and it hasn't signed in fresh since.
 */
export async function isDeviceRevokedForFingerprint(
  supabase: SupabaseServerClient,
  userId: string,
  fingerprint: string,
): Promise<boolean> {
  const { data } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("user_devices" as any)
    .select("revoked_at")
    .eq("user_id", userId)
    .eq("fingerprint", fingerprint)
    .maybeSingle();
  return Boolean((data as { revoked_at: string | null } | null)?.revoked_at);
}

/**
 * Convenience wrapper for server-only call sites that have access to
 * `next/headers` (Server Components, Server Actions, and API routes
 * called with the browser's cookies — not the future Bearer-token mobile
 * tier, which computes its own fingerprint from the request object
 * directly since `next/headers` isn't meaningful there).
 */
export async function isCurrentDeviceRevoked(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<boolean> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  const lang = h.get("accept-language")?.split(",")[0] ?? "";
  const fp = computeDeviceFingerprint(userId, ua, lang);
  return isDeviceRevokedForFingerprint(supabase, userId, fp);
}

"use server";

import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consumeAsync } from "@/lib/rate-limit/limiter";
import { loginSchema } from "@/lib/validators/auth";

type LoginResult =
  | { ok: true; data: { needsMfa: boolean; factorId: string | null } }
  | { ok: false; error: string };

/**
 * Server-side login. Wraps supabase.auth.signInWithPassword so that:
 *   1. We can rate-limit by email (10 attempts / 5 min, per LIMITS.login).
 *      The browser-side call had no rate limit at all, leaving the
 *      endpoint open to credential-stuffing.
 *   2. The auth cookie is set by the SSR helper, identical to what the
 *      browser SDK would have done — the rest of the app keeps working
 *      unchanged.
 *
 * After a successful sign-in, we check whether the account has a verified
 * TOTP factor. If yes, we surface that back to the form so it can collect
 * the 6-digit code and call supabase.auth.mfa.challenge() + verify().
 *
 * The MFA challenge itself stays in the browser because the SDK keeps the
 * factor handle on the client session — re-creating that on the server
 * would cost an extra round-trip. AAL escalation is therefore: server
 * sign-in → browser MFA challenge → browser verify.
 */
export async function loginAction(raw: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "auth.errorInvalid" };
  }
  const { email, password } = parsed.data;

  // Two-tier rate limit.
  //  • Tier A (tight): per (email, IP). Stops a single attacker from
  //    burning attempts against one account from one network. Was 10/5min
  //    per email before — that let a throttled attacker DoS real users by
  //    spamming the right email with garbage. Keying on (email|IP) means
  //    real users on a different IP are unaffected by attacker noise.
  //  • Tier B (broader): per email only, looser cap as defence-in-depth
  //    against distributed credential stuffing across many IPs.
  //
  // x-forwarded-for is set by the platform load balancer (Vercel / proxy).
  // The first hop is the real client; we fall back to "unknown" so the
  // bucket still applies when the header is absent (e.g. local dev).
  const emailKey = email.trim().toLowerCase();
  const xff = (await headers()).get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() ?? "unknown";

  const pairLimit = await consumeAsync(`login:${emailKey}|${ip}`, {
    max: 5,
    windowMs: 60_000,
  });
  if (!pairLimit.ok) {
    const sec = Math.ceil(pairLimit.retryAfterMs / 1000);
    return {
      ok: false,
      error: `Zu viele Login-Versuche. Bitte in ${sec}s erneut versuchen.`,
    };
  }
  const emailLimit = await consumeAsync(`login:${emailKey}`, {
    max: 15,
    windowMs: 60_000,
  });
  if (!emailLimit.ok) {
    const sec = Math.ceil(emailLimit.retryAfterMs / 1000);
    return {
      ok: false,
      error: `Zu viele Login-Versuche. Bitte in ${sec}s erneut versuchen.`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    return { ok: false, error: "auth.errorInvalid" };
  }

  // After a successful primary auth, see whether MFA is required.
  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel === "aal1") {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = (factors?.totp ?? []).find(
      (f) => f.status === "verified",
    );
    if (verified) {
      return {
        ok: true,
        data: { needsMfa: true, factorId: verified.id },
      };
    }
  }

  return { ok: true, data: { needsMfa: false, factorId: null } };
}

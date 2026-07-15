"use server";

import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consumeAsync, LIMITS } from "@/lib/rate-limit/limiter";
import { loginSchema, registerSchema, forgotPasswordSchema } from "@/lib/validators/auth";
import { env } from "@/lib/constants/env";
import { routes } from "@/lib/constants/routes";
import { recordCurrentDeviceAction } from "./devices";

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
    // Log the underlying Supabase error to Vercel logs so we can see
    // why login is actually failing (bad creds vs. config vs. network).
    // The user still sees the friendly translation key — we don't leak
    // internals to the UI.
    // eslint-disable-next-line no-console
    console.error("[loginAction] supabase signIn failed:", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    // Surface configuration errors (not just bad password) so the user
    // sees something actionable instead of "Invalid credentials" forever.
    if (
      error.message?.toLowerCase().includes("fetch") ||
      error.message?.toLowerCase().includes("network") ||
      error.status === 0
    ) {
      return {
        ok: false,
        error: "Supabase nicht erreichbar. Bitte prüfe NEXT_PUBLIC_SUPABASE_URL und Netzwerk.",
      };
    }
    if (error.message?.toLowerCase().includes("email not confirmed")) {
      return {
        ok: false,
        error: "E-Mail-Adresse nicht bestätigt. Bitte Bestätigungslink in der E-Mail anklicken.",
      };
    }
    return { ok: false, error: "auth.errorInvalid" };
  }

  // A successful password check is exactly "the user signs in again" per
  // the revoke-device contract (see user_devices migration comment) — clear
  // any prior revocation for this browser's fingerprint now, before MFA.
  // Best-effort: a failure here must never block an otherwise-valid login.
  await recordCurrentDeviceAction({ freshSignIn: true }).catch(() => {});

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

/* ---------------------------------------------------------------------------
 * Register / forgot-password — moved server-side for rate limiting.
 *
 * Both used to call the Supabase browser SDK directly from the client
 * component with no throttling at all (unlike login, which already went
 * through loginAction). Combined with the app having no CAPTCHA on either
 * flow, that left self-serve signup and password-reset open to scripted
 * abuse — credential stuffing via mass account creation, or a reset-email
 * bombing campaign against a real user's inbox. Real CAPTCHA needs a
 * third-party provider (hCaptcha/Turnstile) account and site key that
 * aren't part of this environment; rate limiting is the actionable
 * mitigation available here, mirroring loginAction's (email|IP) + email
 * two-tier pattern.
 * ------------------------------------------------------------------------- */

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function clientIp(): Promise<string> {
  const xff = (await headers()).get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() ?? "unknown";
}

export async function registerAction(
  raw: unknown,
): Promise<ActionResult<{ needsEmailConfirm: boolean }>> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { fullName, email, password } = parsed.data;
  const emailKey = email.trim().toLowerCase();
  const ip = await clientIp();

  const pairLimit = await consumeAsync(`register:${emailKey}|${ip}`, LIMITS.register);
  if (!pairLimit.ok) {
    const sec = Math.ceil(pairLimit.retryAfterMs / 1000);
    return {
      ok: false,
      error: `Zu viele Registrierungsversuche. Bitte in ${sec}s erneut versuchen.`,
    };
  }
  const ipLimit = await consumeAsync(`register:${ip}`, {
    max: LIMITS.register.max * 3,
    windowMs: LIMITS.register.windowMs,
  });
  if (!ipLimit.ok) {
    const sec = Math.ceil(ipLimit.retryAfterMs / 1000);
    return {
      ok: false,
      error: `Zu viele Registrierungsversuche. Bitte in ${sec}s erneut versuchen.`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // SECURITY: never accept `role` or `org_id` from the client — see
      // the comment this used to carry in RegisterForm.tsx. handle_new_user()
      // (server-side, security definer) is the sole authority.
      data: { full_name: fullName },
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=${encodeURIComponent(
        routes.dashboard,
      )}`,
    },
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[registerAction] supabase signUp failed:", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    const msg = (error.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      return { ok: false, error: "auth.errorEmailInUse" };
    }
    if (msg.includes("password")) {
      return { ok: false, error: "auth.errorWeakPassword" };
    }
    return { ok: false, error: error.message || "auth.errorGeneric" };
  }

  return { ok: true, data: { needsEmailConfirm: true } };
}

export async function requestPasswordResetAction(
  raw: unknown,
): Promise<ActionResult<void>> {
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    // Same generic response either way — never confirm/deny whether the
    // input was even well-formed enough to look up, matching the
    // account-enumeration-safe behaviour the UI already had.
    return { ok: true, data: undefined };
  }
  const emailKey = parsed.data.email.trim().toLowerCase();
  const ip = await clientIp();

  const pairLimit = await consumeAsync(
    `pwreset:${emailKey}|${ip}`,
    LIMITS.passwordReset,
  );
  const ipLimit = await consumeAsync(`pwreset:${ip}`, {
    max: LIMITS.passwordReset.max * 3,
    windowMs: LIMITS.passwordReset.windowMs,
  });
  if (!pairLimit.ok || !ipLimit.ok) {
    // Rate-limited: still return ok:true with no email sent. Surfacing a
    // distinct "too many attempts" error here would let an attacker use
    // response timing/shape to enumerate which emails exist accounts for
    // vs which are merely rate-limited — the UI already shows the same
    // "if an account exists…" message regardless, so silently no-op.
    return { ok: true, data: undefined };
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}${routes.resetPassword}`,
  });
  // Never surface Supabase's error here either, for the same
  // account-enumeration reason — the UI shows one message regardless of
  // whether the address is registered or the call failed.
  return { ok: true, data: undefined };
}

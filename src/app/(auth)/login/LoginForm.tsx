"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { loginSchema, type LoginInput } from "@/lib/validators/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { env } from "@/lib/constants/env";
import { routes } from "@/lib/constants/routes";

/**
 * Right-hand form panel for the login screen.
 *
 * Behaviour
 *  - Validates with Zod.
 *  - Calls supabase.auth.signInWithPassword.
 *  - "Remember me" toggles whether the SDK uses a session-only cookie or a
 *    long-lived one. We rely on Supabase's default 30-day refresh token here.
 *  - Google OAuth: signInWithOAuth(provider="google"). Apple is wired up
 *    behind the same call but disabled until the provider is configured in
 *    Supabase Dashboard → Authentication → Providers.
 */
export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const search = useSearchParams();
  // `next` arrives as an arbitrary string from the URL, so we explicitly
  // narrow it through Next's `Route` brand for typed-routes compatibility.
  const next = (search.get("next") ?? routes.dashboard) as Route;
  const [showPw, setShowPw] = useState(false);
  const [submitting, startTransition] = useTransition();
  const [mfa, setMfa] = useState<{ factorId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: true },
  });

  const remember = watch("rememberMe");

  async function onSubmit(values: LoginInput) {
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        toast.error(t("errorInvalid"));
        return;
      }
      // Check if user has TOTP factors requiring AAL2 escalation.
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel === "aal1") {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const verified = (factors?.totp ?? []).find(
          (f) => f.status === "verified",
        );
        if (verified) {
          setMfa({ factorId: verified.id });
          return;
        }
      }
      router.replace(next);
      router.refresh();
    });
  }

  async function verifyMfa() {
    if (!mfa) return;
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const challenge = await supabase.auth.mfa.challenge({
        factorId: mfa.factorId,
      });
      if (challenge.error) {
        toast.error(challenge.error.message);
        return;
      }
      const verifyRes = await supabase.auth.mfa.verify({
        factorId: mfa.factorId,
        challengeId: challenge.data!.id,
        code: mfaCode,
      });
      if (verifyRes.error) {
        toast.error(t("mfaWrongCode"));
        return;
      }
      router.replace(next);
      router.refresh();
    });
  }

  async function _signInWithGoogle() {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) toast.error(t("errorGeneric"));
  }

  return (
    <section className="relative flex flex-col bg-white">
      {/* Top: meta + language switcher */}
      <div className="flex items-center justify-end gap-3 px-12 pt-8 text-[12px] text-neutral-500">
        <span>{t("newHere")}</span>
        <Link
          href={routes.register}
          className="text-[13px] font-medium text-primary-600 hover:text-primary-700 hover:underline"
        >
          {t("createAccount")}
        </Link>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-2 text-[12px] font-medium text-neutral-700 transition hover:border-primary-500"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <circle cx={12} cy={12} r={10} />
            <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
          </svg>
          Deutsch
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Form body */}
      <div className="grid flex-1 place-items-center px-12 py-6">
        {mfa ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verifyMfa();
            }}
            className="w-full max-w-[400px]"
            noValidate
          >
            <h2 className="mb-2 text-[28px] font-bold tracking-tightest text-neutral-900">
              {t("mfaTitle")}
            </h2>
            <p className="mb-8 text-[14px] text-neutral-500">{t("mfaSub")}</p>
            <label className="mb-4 flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-neutral-700">
                {t("mfaCodeLabel")}
              </span>
              <input
                autoFocus
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={mfaCode}
                onChange={(e) =>
                  setMfaCode(e.target.value.replace(/\D/g, ""))
                }
                className="input font-mono tracking-[0.4em]"
                placeholder="••••••"
              />
            </label>
            <button
              type="submit"
              disabled={submitting || mfaCode.length !== 6}
              className={cn(
                "btn btn--primary w-full",
                (submitting || mfaCode.length !== 6) && "opacity-80",
              )}
              style={{ minHeight: 52, padding: 14 }}
            >
              {submitting ? "…" : t("mfaVerify")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMfa(null);
                setMfaCode("");
              }}
              className="mt-3 w-full text-center text-[13px] text-neutral-500 hover:text-neutral-700"
            >
              {t("mfaCancel")}
            </button>
          </form>
        ) : (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="w-full max-w-[400px]"
          noValidate
        >
          <h2 className="mb-2 text-[28px] font-bold tracking-tightest text-neutral-900">
            {t("loginTitle")}
          </h2>
          <p className="mb-8 text-[14px] text-neutral-500">{t("loginSub")}</p>

          {/* Email */}
          <div className="mb-4 flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[13px] font-medium text-neutral-700">
              {t("email")}
            </label>
            <div className="relative flex items-center">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-3.5 h-[18px] w-[18px] text-neutral-400"
              >
                <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" />
                <path d="M22 6l-10 7L2 6" />
              </svg>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                className={cn(
                  "input pl-11",
                  errors.email && "border-error-500",
                )}
                {...register("email")}
              />
            </div>
            {errors.email && (
              <p className="text-[12px] text-error-700">
                {errors.email.message?.startsWith("auth.")
                  ? t(errors.email.message.replace(/^auth\./, "") as never)
                  : errors.email.message}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="mb-4 flex flex-col gap-1.5">
            <label htmlFor="pw" className="text-[13px] font-medium text-neutral-700">
              {t("password")}
            </label>
            <div className="relative flex items-center">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-3.5 h-[18px] w-[18px] text-neutral-400"
              >
                <rect x={3} y={11} width={18} height={11} rx={2} />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <input
                id="pw"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                placeholder={t("passwordPlaceholder")}
                className={cn(
                  "input px-11",
                  errors.password && "border-error-500",
                )}
                {...register("password")}
              />
              <button
                type="button"
                aria-label="Toggle password visibility"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-3.5 text-neutral-400 transition hover:text-neutral-600"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[18px] w-[18px]"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                  <circle cx={12} cy={12} r={3} />
                </svg>
              </button>
            </div>
            {errors.password && (
              <p className="text-[12px] text-error-700">
                {errors.password.message?.startsWith("auth.")
                  ? t(errors.password.message.replace(/^auth\./, "") as never)
                  : errors.password.message}
              </p>
            )}
          </div>

          {/* Remember + forgot */}
          <div className="my-2 mb-6 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-neutral-700">
              <button
                type="button"
                role="checkbox"
                aria-checked={remember}
                onClick={() => setValue("rememberMe", !remember)}
                className={cn(
                  "grid h-[18px] w-[18px] place-items-center rounded-[4px] border-[1.5px] bg-white transition",
                  remember
                    ? "border-primary-500 bg-primary-500"
                    : "border-neutral-300",
                )}
              >
                {remember && (
                  <span
                    aria-hidden
                    className="block h-[5px] w-[9px] -translate-y-px translate-x-px rotate-[-45deg] border-b-2 border-l-2 border-white"
                  />
                )}
              </button>
              {t("rememberMe")}
            </label>
            <Link
              href={routes.forgotPassword}
              className="text-[13px] font-medium text-primary-600 hover:text-primary-700 hover:underline"
            >
              {t("forgotPassword")}
            </Link>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "btn btn--primary w-full",
              submitting && "cursor-not-allowed opacity-80",
            )}
            style={{ minHeight: 52, padding: 14 }}
          >
            {submitting ? (
              <span
                aria-hidden
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
            ) : (
              <>
                {t("submit")}
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3 text-[12px] text-neutral-400">
            <span className="h-px flex-1 bg-neutral-200" />
            {t("or")}
            <span className="h-px flex-1 bg-neutral-200" />
          </div>

          {/* SSO — temporarily disabled until OAuth providers are
              re-configured in Supabase. Re-enable by removing `disabled`
              and the cursor-not-allowed/opacity classes. */}
          <div className="flex gap-3">
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Sign-in via Google is temporarily unavailable"
              className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-sm border-[1.5px] border-neutral-200 bg-white px-3 py-3 text-[13px] font-medium text-neutral-700 opacity-60"
            >
              <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden>
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Google
            </button>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Sign-in via Apple is temporarily unavailable"
              className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-sm border-[1.5px] border-neutral-200 bg-white px-3 py-3 text-[13px] font-medium text-neutral-700 opacity-60"
            >
              <svg viewBox="0 0 24 24" width={16} height={16} fill="#000" aria-hidden>
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              Apple
            </button>
          </div>

          <div className="mt-7 border-t border-neutral-100 pt-5 text-center text-[13px] text-neutral-500">
            Having trouble signing in?{" "}
            <a href="#" className="font-medium text-primary-600 hover:underline">
              Contact your administrator
            </a>
          </div>
        </form>
        )}
      </div>

      {/* Foot */}
      <div className="flex items-center justify-between border-t border-neutral-100 px-12 py-6 text-[11px] text-neutral-400">
        <div className="flex gap-[18px]">
          <a className="hover:text-neutral-600" href="#">
            Datenschutz policy
          </a>
          <a className="hover:text-neutral-600" href="#">
            AGB of service
          </a>
          <a className="hover:text-neutral-600" href="#">
            Impressum
          </a>
        </div>
        <div>v1.0 · secure connection</div>
      </div>
    </section>
  );
}

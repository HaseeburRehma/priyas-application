"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { registerSchema, type RegisterInput } from "@/lib/validators/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { env } from "@/lib/constants/env";
import { routes } from "@/lib/constants/routes";

/**
 * Self-serve registration. Creates an auth user with metadata that the
 * `handle_new_user()` Postgres trigger picks up to provision the matching
 * row in public.profiles, attaching them to the default org as 'employee'.
 *
 * Requires `enable_signup = true` in supabase/config.toml AND in
 * Supabase Dashboard → Authentication → Settings.
 */
export function RegisterForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [submitting, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      acceptTerms: false,
    },
  });

  const accepted = watch("acceptTerms");

  async function onSubmit(values: RegisterInput) {
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          // Picked up by handle_new_user() to create the profiles row.
          data: {
            full_name: values.fullName,
            org_id: env.NEXT_PUBLIC_DEFAULT_ORG_ID,
            role: "employee",
          },
          emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=${encodeURIComponent(
            routes.dashboard,
          )}`,
        },
      });

      if (error) {
        if (
          error.message.toLowerCase().includes("already") ||
          error.message.toLowerCase().includes("registered")
        ) {
          toast.error(t("errorEmailInUse"));
          return;
        }
        if (error.message.toLowerCase().includes("password")) {
          toast.error(t("errorWeakPassword"));
          return;
        }
        toast.error(t("errorGeneric"));
        return;
      }

      router.replace(routes.registerCheckEmail);
    });
  }

  async function signInWithGoogle() {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=${encodeURIComponent(
          routes.dashboard,
        )}`,
        queryParams: {
          // First-time OAuth users land in handle_new_user() too. Make sure
          // their profile gets attached to the default org.
          // (Supabase forwards this through to raw_user_meta_data.)
        },
      },
    });
    if (error) toast.error(t("errorGeneric"));
  }

  return (
    <section className="relative flex flex-col bg-white">
      {/* Top: link back to sign-in */}
      <div className="flex items-center justify-end gap-3 px-12 pt-8 text-[12px] text-neutral-500">
        <span>{t("haveAccount")}</span>
        <Link
          href={routes.login}
          className="text-[13px] font-medium text-primary-600 hover:text-primary-700 hover:underline"
        >
          {t("signInLink")}
        </Link>
      </div>

      <div className="grid flex-1 place-items-center px-12 py-6">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="w-full max-w-[400px]"
          noValidate
        >
          <h2 className="mb-2 text-[28px] font-bold tracking-tightest text-neutral-900">
            {t("registerTitle")}
          </h2>
          <p className="mb-8 text-[14px] text-neutral-500">{t("registerSub")}</p>

          {/* Full name */}
          <div className="mb-4 flex flex-col gap-1.5">
            <label htmlFor="fullName" className="text-[13px] font-medium text-neutral-700">
              {t("fullName")}
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
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx={12} cy={7} r={4} />
              </svg>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                placeholder={t("fullNamePlaceholder")}
                className={cn("input pl-11", errors.fullName && "border-error-500")}
                {...register("fullName")}
              />
            </div>
            {errors.fullName && (
              <p className="text-[12px] text-error-700">{errors.fullName.message}</p>
            )}
          </div>

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
                className={cn("input pl-11", errors.email && "border-error-500")}
                {...register("email")}
              />
            </div>
            {errors.email && (
              <p className="text-[12px] text-error-700">{errors.email.message}</p>
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
                autoComplete="new-password"
                placeholder={t("passwordPlaceholder")}
                className={cn("input px-11", errors.password && "border-error-500")}
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
            {errors.password ? (
              <p className="text-[12px] text-error-700">{errors.password.message}</p>
            ) : (
              <p className="text-[12px] text-neutral-500">{t("passwordHint")}</p>
            )}
          </div>

          {/* Terms */}
          <div className="my-2 mb-6 flex items-start gap-2 text-[13px] text-neutral-700">
            <button
              type="button"
              role="checkbox"
              aria-checked={accepted}
              onClick={() => setValue("acceptTerms", !accepted, { shouldValidate: true })}
              className={cn(
                "mt-0.5 grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded-[4px] border-[1.5px] bg-white transition",
                accepted
                  ? "border-primary-500 bg-primary-500"
                  : "border-neutral-300",
              )}
            >
              {accepted && (
                <span
                  aria-hidden
                  className="block h-[5px] w-[9px] -translate-y-px translate-x-px rotate-[-45deg] border-b-2 border-l-2 border-white"
                />
              )}
            </button>
            <label
              className="cursor-pointer leading-tight"
              onClick={() =>
                setValue("acceptTerms", !accepted, { shouldValidate: true })
              }
            >
              {t("termsAccept")}{" "}
              <a className="font-medium text-primary-600 hover:underline" href="#">
                {t("termsLink")}
              </a>{" "}
              {t("and")}{" "}
              <a className="font-medium text-primary-600 hover:underline" href="#">
                {t("privacyLink")}
              </a>
              .
            </label>
          </div>
          {errors.acceptTerms && (
            <p className="-mt-4 mb-4 text-[12px] text-error-700">
              {errors.acceptTerms.message}
            </p>
          )}

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
                {t("registerCta")}
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

          {/* SSO */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={signInWithGoogle}
              className="flex flex-1 items-center justify-center gap-2 rounded-sm border-[1.5px] border-neutral-200 bg-white px-3 py-3 text-[13px] font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </button>
            <button
              type="button"
              disabled
              title="Apple Sign-In requires Supabase provider configuration"
              className="flex flex-1 items-center justify-center gap-2 rounded-sm border-[1.5px] border-neutral-200 bg-white px-3 py-3 text-[13px] font-medium text-neutral-700 opacity-60"
            >
              <svg viewBox="0 0 24 24" width={16} height={16} fill="#000" aria-hidden>
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              Apple
            </button>
          </div>
        </form>
      </div>

      {/* Foot */}
      <div className="flex items-center justify-between border-t border-neutral-100 px-12 py-6 text-[11px] text-neutral-400">
        <div className="flex gap-[18px]">
          <a className="hover:text-neutral-600" href="#">Datenschutz policy</a>
          <a className="hover:text-neutral-600" href="#">AGB of service</a>
          <a className="hover:text-neutral-600" href="#">Impressum</a>
        </div>
        <div>v1.0 · secure connection</div>
      </div>
    </section>
  );
}

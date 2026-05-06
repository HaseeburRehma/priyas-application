"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Factor = {
  id: string;
  friendly_name: string | null;
  factor_type: string;
  status: "verified" | "unverified";
};

/**
 * 2FA / TOTP enrolment + management — backed by Supabase Auth's MFA APIs.
 * Required for management + project manager roles.
 *
 * Flow:
 *   - List existing factors. If a verified TOTP factor exists, show "Disable".
 *   - Otherwise, enrol() returns a TOTP secret + QR (data URL) — render it.
 *   - User scans + types the 6-digit code → challenge() + verify().
 *   - On success, refresh the factor list. On failure, surface the error.
 */
export function SecuritySection() {
  const t = useTranslations("settings.security");
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [pending, start] = useTransition();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolment, setEnrolment] = useState<{
    factorId: string;
    qrSvg: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");

  // Initial factor list on mount.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (cancelled) return;
      const totp = (data?.totp ?? []) as Factor[];
      setFactors(totp);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verified = factors.find((f) => f.status === "verified");

  async function startEnrolment() {
    start(async () => {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator",
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      if (!data) return;
      setEnrolment({
        factorId: data.id,
        qrSvg: (data.totp.qr_code as unknown as string) ?? "",
        secret: data.totp.secret,
      });
    });
  }

  async function verify() {
    if (!enrolment) return;
    start(async () => {
      const challenge = await supabase.auth.mfa.challenge({
        factorId: enrolment.factorId,
      });
      if (challenge.error) {
        toast.error(challenge.error.message);
        return;
      }
      const challengeId = challenge.data?.id;
      if (!challengeId) return;
      const verifyRes = await supabase.auth.mfa.verify({
        factorId: enrolment.factorId,
        challengeId,
        code,
      });
      if (verifyRes.error) {
        toast.error(t("wrongCode"));
        return;
      }
      toast.success(t("verified"));
      setEnrolment(null);
      setCode("");
      const { data } = await supabase.auth.mfa.listFactors();
      setFactors((data?.totp ?? []) as Factor[]);
      router.refresh();
    });
  }

  async function disable() {
    if (!verified) return;
    start(async () => {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: verified.id,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t("removed"));
      const { data } = await supabase.auth.mfa.listFactors();
      setFactors((data?.totp ?? []) as Factor[]);
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 p-5">
        <h2 className="text-[17px] font-bold text-secondary-500">
          {t("title")}
        </h2>
        <p className="mt-1 text-[12px] text-neutral-500">{t("subtitle")}</p>
      </header>
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-md border border-neutral-100 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-neutral-800">
                {t("twoFactorTitle")}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                  verified
                    ? "bg-success-50 text-success-700"
                    : "bg-neutral-100 text-neutral-600",
                )}
              >
                {verified ? t("enabled") : t("disabled")}
              </span>
            </div>
            <p className="mt-1 max-w-[480px] text-[12px] leading-[1.5] text-neutral-500">
              {t("twoFactorBody")}
            </p>
          </div>
          {verified ? (
            <button
              type="button"
              disabled={pending}
              onClick={disable}
              className="btn btn--ghost border border-error-500 text-error-700 hover:bg-error-50"
            >
              {t("disable")}
            </button>
          ) : (
            !enrolment && (
              <button
                type="button"
                disabled={pending}
                onClick={startEnrolment}
                className="btn btn--primary"
              >
                {t("enable")}
              </button>
            )
          )}
        </div>

        {enrolment && (
          <div className="mt-4 grid grid-cols-1 gap-5 rounded-md border border-primary-300 bg-tertiary-200/40 p-5 md:grid-cols-[auto_1fr]">
            <div className="grid place-items-center rounded-md bg-white p-3">
              <div
                className="h-[180px] w-[180px]"
                // QR comes back as raw SVG markup from Supabase.
                dangerouslySetInnerHTML={{ __html: enrolment.qrSvg }}
              />
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-neutral-700">{t("scanCode")}</p>
              <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-[12px] text-neutral-700">
                {t("secret")}: {enrolment.secret}
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-neutral-700">
                  {t("verifyTitle")}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="input font-mono tracking-[0.4em]"
                  placeholder="••••••"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEnrolment(null);
                    setCode("");
                  }}
                  className="btn btn--ghost border border-neutral-200"
                >
                  {t("disable")}
                </button>
                <button
                  type="button"
                  onClick={verify}
                  disabled={pending || code.length !== 6}
                  className={cn(
                    "btn btn--primary",
                    (pending || code.length !== 6) && "opacity-80",
                  )}
                >
                  {t("verify")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { SecuritySection } from "@/components/settings/SecuritySection";

export const metadata: Metadata = { title: "2FA · Priya's" };
export const dynamic = "force-dynamic";

/**
 * Standalone TOTP enrolment page — satisfies spec §6.2 (2FA mandatory
 * for management + project managers).
 *
 * Reached via redirect from DashboardLayout when an admin or dispatcher
 * signs in without a verified factor. Runs outside the (dashboard)
 * route group on purpose: the dashboard layout enforces the gate, so
 * sharing the same shell would create a redirect loop.
 *
 * Field staff (`employee` role) don't need 2FA — they're bounced
 * straight to the dashboard if they ever land here. Anyone who already
 * has a verified factor is also bounced (this page is for first-time
 * enrolment only).
 */
export default async function Setup2FAPage() {
  // Must be signed in.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(routes.login);

  // Field staff don't need 2FA — straight to the dashboard.
  const { role } = await getCurrentRole();
  if (role !== "admin" && role !== "dispatcher") {
    redirect(routes.dashboard);
  }

  // Already enrolled — also straight to the dashboard.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (verified) redirect(routes.dashboard);

  const t = await getTranslations("setup2fa");

  return (
    <div className="min-h-screen bg-tertiary-200 px-4 py-10">
      <div className="mx-auto max-w-[760px]">
        {/* Header */}
        <header className="mb-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-warning-700">
            <span className="h-1.5 w-1.5 rounded-full bg-warning-500" />
            {t("badge")}
          </span>
          <h1 className="mt-3 text-[28px] font-bold tracking-[-0.01em] text-secondary-500">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-prose text-[14px] leading-[1.6] text-neutral-600">
            {t("lead")}
          </p>
        </header>

        {/* What you'll need */}
        <section className="mb-6 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
            {t("checklistTitle")}
          </h2>
          <ol className="space-y-3 text-[13px] leading-[1.5] text-neutral-700">
            <Step
              n={1}
              title={t("step1Title")}
              body={t("step1Body")}
            />
            <Step
              n={2}
              title={t("step2Title")}
              body={t("step2Body")}
            />
            <Step
              n={3}
              title={t("step3Title")}
              body={t("step3Body")}
            />
          </ol>
        </section>

        {/* Enrolment UI — reused from Settings → Security. Header is
            suppressed here because this page provides its own framing. */}
        <SecuritySection hideHeader />

        {/* Help footer */}
        <p className="mt-5 text-center text-[12px] text-neutral-500">
          {t.rich("helpLine", {
            mail: (chunks) => (
              <a
                href="mailto:support@priyas-cleaning.de"
                className="font-semibold text-secondary-500 hover:underline"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>
    </div>
  );
}

/**
 * One numbered step in the "what you'll need" checklist. Uses a
 * primary-tinted circle for the number so the eye reads the sequence
 * left-to-right.
 */
function Step({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary-500 text-[12px] font-bold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-neutral-800">{title}</div>
        <div className="mt-0.5 text-[12px] text-neutral-500">{body}</div>
      </div>
    </li>
  );
}

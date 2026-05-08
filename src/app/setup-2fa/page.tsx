import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { SecuritySection } from "@/components/settings/SecuritySection";

export const metadata: Metadata = { title: "2FA einrichten" };
export const dynamic = "force-dynamic";

/**
 * Standalone TOTP enrolment page used to satisfy spec §6.2 — 2FA is
 * mandatory for management and project managers.
 *
 * Reached via redirect from DashboardLayout when an admin/dispatcher
 * signs in without a verified factor. Runs outside the (dashboard) route
 * group on purpose: the dashboard layout itself enforces the gate, so
 * sharing the same shell would create a redirect loop.
 *
 * Once the user verifies their TOTP, they're free to use the regular
 * dashboard. We don't auto-redirect after enrolment because the existing
 * SecuritySection toasts on success and refreshes the page; subsequent
 * navigations will pass the gate.
 */
export default async function Setup2FAPage() {
  // Must be signed in.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(routes.login);

  // Field staff don't need 2FA — bounce them straight to the dashboard.
  const { role } = await getCurrentRole();
  if (role !== "admin" && role !== "dispatcher") {
    redirect(routes.dashboard);
  }

  // If they already have a verified factor, they shouldn't be here.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (verified) redirect(routes.dashboard);

  return (
    <div className="min-h-screen bg-tertiary-200 px-4 py-10">
      <div className="mx-auto max-w-[760px]">
        <header className="mb-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-warning-700">
            <span className="h-1.5 w-1.5 rounded-full bg-warning-500" />
            Pflicht
          </span>
          <h1 className="mt-3 text-[24px] font-bold text-secondary-500">
            Zwei-Faktor-Authentifizierung einrichten
          </h1>
          <p className="mt-2 max-w-prose text-[14px] leading-[1.6] text-neutral-600">
            Aus Sicherheitsgründen müssen Konten mit Management- oder
            Projektleitungsrolle 2FA aktivieren, bevor sie auf das Dashboard
            zugreifen können. Scanne den QR-Code mit einer Authenticator-App
            (Google Authenticator, Authy, 1Password, …) und gib den
            sechsstelligen Code zur Bestätigung ein.
          </p>
        </header>
        <SecuritySection />
      </div>
    </div>
  );
}

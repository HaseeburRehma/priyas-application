import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Benutzer · Einstellungen" };
export const dynamic = "force-dynamic";

export default async function UsersSettingsPage() {
  if (!(await can("settings.read"))) redirect(routes.dashboard);

  return (
    <div className="mx-auto max-w-2xl py-8 px-4">
      <h1 className="text-2xl font-bold text-secondary-700 mb-2">Benutzer</h1>
      <p className="text-sm text-neutral-500 mb-6">Team-Mitglieder und Zugriffsrechte verwalten</p>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 shadow-sm">
        <p className="text-sm text-neutral-500">Benutzerverwaltung wird in einer zukünftigen Version verfügbar sein.</p>
      </div>
    </div>
  );
}

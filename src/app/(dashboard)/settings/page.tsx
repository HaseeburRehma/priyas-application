import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadSettings } from "@/lib/api/settings";
import { can, requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { SettingsPage } from "@/components/settings/SettingsPage";

export const metadata: Metadata = { title: "Einstellungen" };
export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    await requirePermission("settings.read");
  } catch (err) {
    if (err instanceof PermissionError) redirect(routes.dashboard);
    throw err;
  }
  const data = await loadSettings();
  if (!data) redirect(routes.dashboard);
  const canEdit = await can("settings.update");
  return <SettingsPage data={data} canEdit={canEdit} />;
}

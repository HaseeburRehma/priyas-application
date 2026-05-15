import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { listApiKeysAction } from "@/app/actions/api-keys";
import { ApiKeysPage } from "@/components/settings/ApiKeysPage";

export const metadata: Metadata = { title: "API Keys" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const { role } = await getCurrentRole();
  if (role !== "admin") {
    redirect(routes.dashboard);
  }
  const keys = await listApiKeysAction();
  return <ApiKeysPage keys={keys} />;
}

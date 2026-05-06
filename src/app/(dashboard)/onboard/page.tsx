import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TabletOnboardingFlow } from "@/components/onboarding/TabletOnboardingFlow";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Kunde onboarden" };
export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    await requirePermission("client.create");
  } catch (err) {
    if (err instanceof PermissionError) redirect(routes.dashboard);
    throw err;
  }
  return <TabletOnboardingFlow />;
}

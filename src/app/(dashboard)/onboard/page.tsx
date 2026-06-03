import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TabletOnboardingFlow } from "@/components/onboarding/TabletOnboardingFlow";
import { can,
} from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Kunde onboarden" };
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await can("client.create"))) redirect(routes.dashboard);
  return <TabletOnboardingFlow />;
}

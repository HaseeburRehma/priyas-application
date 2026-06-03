import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { routes } from "@/lib/constants/routes";
import { loadOnboardingState } from "@/lib/api/onboard-videos";
import { OnboardVideos } from "@/components/onboarding/OnboardVideos";

export const metadata: Metadata = { title: "Schulungsvideos · Onboarding" };
export const dynamic = "force-dynamic";

/**
 * Sequenced training-video gate for newly-invited team members.
 *
 * Reached via the dashboard layout's redirect when `employees.
 * system_unlocked_at` is NULL and any mandatory training module is
 * still incomplete. Lives outside the (dashboard) route group on purpose
 * so it can render its own clean shell — the dashboard would create a
 * redirect loop.
 *
 * Existing employees (backfilled to a non-null timestamp by migration
 * 000039) and managers never reach this route.
 */
export default async function Page() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(routes.login);

  const state = await loadOnboardingState();

  // If they've already finished (or are a manager / legacy employee
  // backfilled to unlocked), send them straight to the dashboard.
  if (state.alreadyUnlocked) redirect(routes.dashboard);

  return <OnboardVideos initial={state} />;
}

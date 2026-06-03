import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OnboardingVideo = {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  position: number;
  is_mandatory: boolean;
  completed_at: string | null;
};

export type OnboardingState = {
  employeeId: string | null;
  alreadyUnlocked: boolean;
  videos: OnboardingVideo[];
  /** First module that isn't completed yet (cursor for the player). */
  currentIndex: number;
};

/**
 * Loads the ordered video sequence + the calling employee's progress
 * row per module. Only `is_mandatory = true` modules count toward the
 * unlock gate — optional modules are exposed too, ordered after the
 * mandatory ones, but completing them isn't required.
 */
export async function loadOnboardingState(): Promise<OnboardingState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { employeeId: null, alreadyUnlocked: true, videos: [], currentIndex: 0 };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: empRow } = await ((supabase.from("employees") as any))
    .select("id, system_unlocked_at, org_id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const emp = empRow as
    | { id: string; system_unlocked_at: string | null; org_id: string }
    | null;
  if (!emp) {
    return { employeeId: null, alreadyUnlocked: true, videos: [], currentIndex: 0 };
  }
  if (emp.system_unlocked_at) {
    return {
      employeeId: emp.id,
      alreadyUnlocked: true,
      videos: [],
      currentIndex: 0,
    };
  }

  // Mandatory-first, then optional. Position is the secondary sort within
  // each tier so the operations team can arrange the sequence by drag/drop.
  const { data: moduleRows } = await supabase
    .from("training_modules")
    .select("id, title, description, video_url, position, is_mandatory")
    .eq("org_id", emp.org_id)
    .is("deleted_at", null)
    .order("is_mandatory", { ascending: false })
    .order("position", { ascending: true });
  const { data: progressRows } = await supabase
    .from("employee_training_progress")
    .select("module_id, completed_at")
    .eq("employee_id", emp.id);

  type DbModule = {
    id: string;
    title: string;
    description: string | null;
    video_url: string | null;
    position: number;
    is_mandatory: boolean;
  };
  type DbProgress = { module_id: string; completed_at: string | null };
  const progressByModule = new Map<string, string | null>();
  for (const r of (progressRows ?? []) as DbProgress[]) {
    progressByModule.set(r.module_id, r.completed_at);
  }
  const videos: OnboardingVideo[] = (
    (moduleRows ?? []) as DbModule[]
  ).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    video_url: m.video_url,
    position: m.position,
    is_mandatory: m.is_mandatory,
    completed_at: progressByModule.get(m.id) ?? null,
  }));

  // Cursor = first incomplete mandatory module. Fallback to 0.
  const cursor = videos.findIndex((v) => v.is_mandatory && !v.completed_at);
  return {
    employeeId: emp.id,
    alreadyUnlocked: false,
    videos,
    currentIndex: cursor < 0 ? 0 : cursor,
  };
}

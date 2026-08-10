/**
 * Training loader + progress writer for the mobile Training screen.
 *
 * Scope: the current employee's own onboarding videos. Managers use
 * the web app for assignment editing — mobile is the "sit-and-watch"
 * surface plus the "mark complete" tap.
 *
 * The web app has a video-sequence gate that locks the schedule until
 * mandatory videos are done. The mobile version reads the same table
 * (employee_training_progress) so both surfaces stay in sync.
 */

import { getSupabase } from "@/lib/supabase";

export type TrainingModule = {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  is_mandatory: boolean;
  position: number;
  completed_at: string | null;
  started_at: string | null;
};

export async function loadMyTraining(
  employeeId: string,
): Promise<TrainingModule[]> {
  const supabase = getSupabase();
  const [{ data: modules }, { data: progress }] = await Promise.all([
    supabase
      .from("training_modules")
      .select("id, title, description, video_url, is_mandatory, position")
      .order("position", { ascending: true }),
    supabase
      .from("employee_training_progress")
      .select("module_id, started_at, completed_at")
      .eq("employee_id", employeeId),
  ]);

  type M = {
    id: string;
    title: string;
    description: string | null;
    video_url: string | null;
    is_mandatory: boolean;
    position: number;
  };
  type P = {
    module_id: string;
    started_at: string | null;
    completed_at: string | null;
  };
  const progByModule = new Map<string, P>();
  for (const p of (progress ?? []) as P[]) progByModule.set(p.module_id, p);

  return ((modules ?? []) as M[]).map((m) => {
    const p = progByModule.get(m.id);
    return {
      ...m,
      started_at: p?.started_at ?? null,
      completed_at: p?.completed_at ?? null,
    };
  });
}

export async function markModuleStarted(
  employeeId: string,
  moduleId: string,
): Promise<void> {
  const supabase = getSupabase();
  // Upsert on the composite key. If already started (or completed),
  // this is a no-op — a re-open shouldn't reset the timer.
  await supabase
    .from("employee_training_progress")
    .upsert(
      {
        employee_id: employeeId,
        module_id: moduleId,
        started_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,module_id", ignoreDuplicates: true },
    );
}

export async function markModuleCompleted(
  employeeId: string,
  moduleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("employee_training_progress")
    .upsert(
      {
        employee_id: employeeId,
        module_id: moduleId,
        started_at: now,
        completed_at: now,
      },
      { onConflict: "employee_id,module_id" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

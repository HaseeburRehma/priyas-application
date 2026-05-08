-- =============================================================================
-- 20260507_000026_training_realtime.sql
--
-- Adds the training assignment + progress tables to Supabase's realtime
-- publication so the /training page can react to assignments / completions
-- as they happen.
--
-- Spec §4.9 — "Progress tracking: system shows which modules have been
-- completed". Without realtime, an employee viewing their training page
-- only sees newly-assigned modules after a manual reload. With this
-- migration plus the client-side subscription in TrainingHub, new
-- assignments materialise within ~1s.
--
-- Idempotent. Safe to re-run.
-- =============================================================================

do $$
begin
  begin
    alter publication supabase_realtime add table public.training_assignments;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.employee_training_progress;
  exception when duplicate_object then null; end;

  begin
    alter publication supabase_realtime add table public.training_modules;
  exception when duplicate_object then null; end;
end $$;

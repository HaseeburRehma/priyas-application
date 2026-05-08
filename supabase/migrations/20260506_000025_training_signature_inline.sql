-- =============================================================================
-- 20260506_000025_training_signature_inline.sql
--
-- Adds an inline `signature_svg` column to employee_training_progress so an
-- employee's digital signature on mandatory-module completion can be
-- persisted without granting them storage-bucket write permissions.
--
-- Background
-- ----------
-- The original schema in 000005_requirements_extensions.sql included a
-- `signature_path` text column intended to hold the storage object key for
-- a separately-uploaded SVG. In practice the `employee-docs` bucket only
-- allows dispatcher/admin writes, so an employee cannot put their own
-- signature there. Inline storage as `image/svg+xml` markup is the
-- simplest fix — a hand-drawn signature from SignaturePad.tsx is ~2 KB,
-- so the column never holds anything heavy.
--
-- We keep `signature_path` around for backwards-compat (it's still nullable)
-- in case any future workflow chooses to upload via service role.
--
-- Idempotent. Safe to re-run.
-- =============================================================================

alter table public.employee_training_progress
  add column if not exists signature_svg text;

-- Cap inline signatures at 64 KB to stop someone stuffing a giant blob
-- through the UI. Matches the validator at
-- src/lib/validators/training.ts.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.employee_training_progress'::regclass
      and conname  = 'employee_training_progress_signature_svg_size_chk'
  ) then
    alter table public.employee_training_progress
      add constraint employee_training_progress_signature_svg_size_chk
      check (signature_svg is null or length(signature_svg) <= 64000);
  end if;
end $$;

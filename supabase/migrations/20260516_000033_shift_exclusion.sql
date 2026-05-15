-- =============================================================================
-- shifts — exclusion constraint that prevents employee double-booking.
-- =============================================================================
-- Backstops the application-level conflict detection in
-- `src/app/actions/shifts.ts` (`detectShiftConflicts`). Two managers used
-- to be able to both pass the JS-side check and both INSERT, producing
-- overlapping rows for the same employee. The exclusion constraint forces
-- the DB to reject the second insert with SQLSTATE 23P01, which the
-- action translates back into the same `conflict` error shape so the UI
-- behaves identically.
--
-- Requires the btree_gist extension so we can combine `employee_id WITH =`
-- (btree-style equality) with `tstzrange WITH &&` (gist-style overlap) in
-- a single EXCLUDE clause.
--
-- Fully idempotent: extension `create … if not exists`; constraint guarded
-- by a pg_constraint lookup.
-- =============================================================================

create extension if not exists btree_gist;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shifts'::regclass
      and conname  = 'shifts_no_employee_overlap'
  ) then
    alter table public.shifts
      add constraint shifts_no_employee_overlap
      exclude using gist (
        employee_id with =,
        tstzrange(starts_at, ends_at) with &&
      )
      where (
        deleted_at is null
        and employee_id is not null
        and status in ('scheduled', 'in_progress')
      );
  end if;
end $$;

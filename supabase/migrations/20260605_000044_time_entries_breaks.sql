-- Break tracking on time_entries
--
-- The original time_entries schema (000018) only allowed two kinds:
-- `check_in` and `check_out`. Field staff have asked for break
-- tracking, so this migration extends the allowed kinds to include
-- `break_start` and `break_end`, and relaxes the uniqueness rule so
-- a single shift can have multiple breaks.
--
-- The unique index `uniq_time_entries_shift_kind` previously enforced
-- "at most one row per (shift_id, employee_id, kind)". For check_in /
-- check_out that's still correct — you check in once and out once.
-- For break_start / break_end, an employee can take several breaks
-- in one shift (a morning coffee + a lunch break, say), so the unique
-- index would block the second pair. We replace it with a partial
-- index that only enforces uniqueness for check_in / check_out.
-- Breaks remain free to repeat, with the application logic deciding
-- whether the latest break_start has a matching break_end before
-- allowing a new break_start.

-- Drop the old constraint that locks `kind` to two values, then
-- re-add a wider one. Doing it in this order keeps the migration
-- idempotent (re-runnable) — both constraints are dropped first.
do $$
begin
  -- Drop the old narrow check.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.time_entries'::regclass
      and conname  = 'time_entries_kind_chk'
  ) then
    alter table public.time_entries
      drop constraint time_entries_kind_chk;
  end if;
  -- Re-add with the four kinds.
  alter table public.time_entries
    add constraint time_entries_kind_chk
    check (kind in ('check_in', 'check_out', 'break_start', 'break_end'));
end $$;

-- Replace the full unique index with a partial one that only applies
-- to check-in / check-out rows. Breaks can repeat per shift.
drop index if exists public.uniq_time_entries_shift_kind;
create unique index if not exists uniq_time_entries_shift_kind_clock
  on public.time_entries (shift_id, employee_id, kind)
  where kind in ('check_in', 'check_out');

-- Index for break lookups — we frequently need "is this shift
-- currently on a break?", which translates to "the most recent
-- break_* row for the shift is a break_start without a matching
-- break_end". An ordered index on (shift_id, occurred_at desc)
-- restricted to break_* rows answers that with one row read.
create index if not exists idx_time_entries_breaks
  on public.time_entries (shift_id, employee_id, occurred_at desc)
  where kind in ('break_start', 'break_end');

comment on constraint time_entries_kind_chk on public.time_entries is
  'Permitted clock-event kinds. check_in/check_out are unique per shift; break_start/break_end may repeat (multiple breaks per shift).';

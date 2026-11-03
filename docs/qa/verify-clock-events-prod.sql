-- Read-only check for Priya's prod after applying 000068 / 000069 / 000070.
-- Paste into the Supabase SQL editor (project oeovzmsstlaqbfqntwjz). Changes nothing.

-- 1. Are the 000070 triggers installed? Expect 2 rows.
select tgname
  from pg_trigger
 where tgrelid = 'public.time_entries'::regclass
   and tgname in ('trg_time_entries_before_insert', 'trg_time_entries_after_insert');

-- 2. Is the 000068 staff insert policy live? Expect the text to mention "72 hours".
select policyname, with_check
  from pg_policies
 where tablename = 'time_entries' and policyname = 'time_entries:insert';

-- 3. Shifts whose status disagrees with their clock events. Expect 0 / 0 after 000070.
select
  count(*) filter (where te_out and sh.status <> 'completed')                 as checked_out_not_completed,
  count(*) filter (where te_in and not te_out and sh.status = 'scheduled')    as checked_in_still_scheduled
from public.shifts sh
cross join lateral (
  select bool_or(kind = 'check_in')  as te_in,
         bool_or(kind = 'check_out') as te_out
    from public.time_entries te where te.shift_id = sh.id
) x
where sh.deleted_at is null;

-- 4. Properties the geofence can't check (no coordinates). Every one of these
--    lets a check-in through with no distance. Fix in the property's edit page.
select count(*) as properties_without_gps
  from public.properties
 where deleted_at is null and (latitude is null or longitude is null);

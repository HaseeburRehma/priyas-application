-- =============================================================================
-- 000070 — clock events: server-side integrity + shift status for field staff
--
-- Before this migration:
--   * Field staff can't UPDATE shifts (only dispatchers/admins, 000002), so
--     the web/mobile "set status = in_progress / completed" calls after a
--     check-in/out were silent no-ops. Dashboard, schedule and billing
--     approval all read shifts.status, so cleaners' shifts stayed
--     "scheduled" forever and never reached billing.
--   * The mobile app computed distance_m on the phone and wrote it as-is.
--   * The staff insert policy only checked employee_id = me, not that the
--     shift is mine, so a cleaner could clock onto any shift in the org.
--
-- After:
--   * BEFORE INSERT: org_id/property_id come from the shift, distance_m is
--     computed here from the coordinates (client value ignored), staff may
--     only clock onto their own, non-cancelled shift, a check_out / break
--     needs a check_in first, and staff timestamps must be near now.
--   * AFTER INSERT: check_in → shift in_progress, check_out → shift
--     completed (+ completed_at). Runs as definer, so it works for staff.
--
-- Rows written with no JWT (SQL editor, service role, seeds) skip the
-- staff rules. Idempotent: safe to run twice.
-- =============================================================================

create or replace function public.time_entries_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  is_staff boolean := auth.uid() is not null and not public.is_dispatcher_or_admin();
begin
  select sh.id, sh.org_id, sh.property_id, sh.employee_id, sh.status, sh.deleted_at,
         p.latitude as p_lat, p.longitude as p_lng
    into s
    from public.shifts sh
    join public.properties p on p.id = sh.property_id
   where sh.id = new.shift_id;

  if not found or s.deleted_at is not null then
    raise exception 'shift_not_found' using errcode = 'P0002';
  end if;

  -- Always taken from the shift; RLS then checks org_id = current_org_id().
  new.org_id      := s.org_id;
  new.property_id := s.property_id;

  if is_staff then
    if s.employee_id is distinct from new.employee_id then
      raise exception 'not_your_shift' using errcode = '42501';
    end if;
    if s.status = 'cancelled' then
      raise exception 'shift_cancelled' using errcode = '42501';
    end if;
    if new.occurred_at > now() + interval '5 minutes'
       or new.occurred_at < now() - interval '72 hours' then
      raise exception 'occurred_at_out_of_range' using errcode = '22007';
    end if;
  end if;

  -- Order: nothing but a check_in may come first (manual corrections by
  -- a manager are exempt — they may backfill in any order).
  if new.kind <> 'check_in' and coalesce(new.manual, false) = false
     and not exists (
       select 1 from public.time_entries te
        where te.shift_id = new.shift_id
          and te.employee_id = new.employee_id
          and te.kind = 'check_in'
     ) then
    raise exception 'must_check_in_first' using errcode = '23514';
  end if;

  -- Distance is the server's number, never the client's.
  if new.latitude is not null and new.longitude is not null
     and s.p_lat is not null and s.p_lng is not null then
    new.distance_m := round((
      2 * 6371000 * asin(sqrt(
        power(sin(radians(s.p_lat::float8 - new.latitude::float8) / 2), 2)
        + cos(radians(new.latitude::float8)) * cos(radians(s.p_lat::float8))
          * power(sin(radians(s.p_lng::float8 - new.longitude::float8) / 2), 2)
      ))
    )::numeric, 1);
  else
    new.distance_m := null;
  end if;

  return new;
end;
$$;

create or replace function public.time_entries_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'check_in' then
    update public.shifts
       set status = 'in_progress'
     where id = new.shift_id
       and status = 'scheduled';
  elsif new.kind = 'check_out' then
    update public.shifts
       set status = 'completed',
           completed_at = coalesce(completed_at, new.occurred_at)
     where id = new.shift_id
       and status in ('scheduled', 'in_progress');
  end if;
  return null;
end;
$$;

-- Trigger functions only; nobody calls them directly.
revoke all on function public.time_entries_before_insert() from public, anon, authenticated;
revoke all on function public.time_entries_after_insert()  from public, anon, authenticated;

drop trigger if exists trg_time_entries_before_insert on public.time_entries;
create trigger trg_time_entries_before_insert
  before insert on public.time_entries
  for each row execute function public.time_entries_before_insert();

drop trigger if exists trg_time_entries_after_insert on public.time_entries;
create trigger trg_time_entries_after_insert
  after insert on public.time_entries
  for each row execute function public.time_entries_after_insert();

-- Backfill: shifts that already have clock events but a stale status.
update public.shifts sh
   set status = 'completed',
       completed_at = coalesce(sh.completed_at, te.occurred_at)
  from public.time_entries te
 where te.shift_id = sh.id
   and te.kind = 'check_out'
   and sh.status in ('scheduled', 'in_progress')
   and sh.deleted_at is null;

update public.shifts sh
   set status = 'in_progress'
 where sh.status = 'scheduled'
   and sh.deleted_at is null
   and exists (select 1 from public.time_entries te
                where te.shift_id = sh.id and te.kind = 'check_in');

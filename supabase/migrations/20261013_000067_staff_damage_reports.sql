-- =============================================================================
-- 20261013_000067_staff_damage_reports.sql
--
-- Field staff report damage from the mobile app (§4.5), but both writes
-- they need were dispatcher/admin-only:
--
--   1. damage_reports INSERT — covered by the generic "write dispatcher"
--      policy from migration 000005, so an employee's report was rejected
--      by RLS outright.
--   2. property-photos uploads — "write dispatcher" again, so the photos
--      attached to a report could never be stored either.
--
-- Both policies below are additive (permissive policies OR together) and
-- narrow: an employee may only file a report as *themselves*, and may
-- only upload into the damage folder of their own org
-- (`<org_id>/<property_id>/damage/<file>`, the layout the web app and the
-- mobile app both use). Dispatcher/admin rights are unchanged. Idempotent.
-- =============================================================================

drop policy if exists "damage_reports:insert own" on public.damage_reports;
create policy "damage_reports:insert own" on public.damage_reports for insert
  with check (
    org_id = (select public.current_org_id())
    and employee_id in (
      select e.id from public.employees e
      where e.profile_id = (select auth.uid())
    )
  );

drop policy if exists "property-photos:write damage staff" on storage.objects;
create policy "property-photos:write damage staff" on storage.objects for insert
  with check (
    bucket_id = 'property-photos'
    and (storage.foldername(name))[1] = (select public.current_org_id())::text
    and (storage.foldername(name))[3] = 'damage'
  );

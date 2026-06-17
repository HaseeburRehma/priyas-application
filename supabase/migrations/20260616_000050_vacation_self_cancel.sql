-- C-1: employees could not cancel their own pending vacation requests.
-- The only UPDATE policy (vac:update dispatcher) was restricted to
-- dispatcher/admin, which meant employees had no way to retract a
-- request without admin intervention.
--
-- This adds a tightly-scoped self-cancel policy:
--   USING  — only their own rows that are still 'pending'
--   WITH CHECK — new status must be 'cancelled' (blocks self-approval/rejection)

drop policy if exists "vac:cancel self" on public.vacation_requests;
create policy "vac:cancel self" on public.vacation_requests for update
  using (
    org_id = public.current_org_id()
    and status = 'pending'
    and employee_id in (
      select id from public.employees where profile_id = auth.uid()
    )
  )
  with check (
    org_id = public.current_org_id()
    and status = 'cancelled'
    and employee_id in (
      select id from public.employees where profile_id = auth.uid()
    )
  );

-- =============================================================================
-- 20260714_000056_assignment_staff_employee_org_check.sql
--
-- `assignment_staff_manager_write` (20260520_000036_invoice_system.sql)
-- checks that the assignment being written to belongs to the caller's org,
-- but never checks that `employee_id` does. `upsertAssignmentAction`
-- (src/app/actions/assignments.ts) already added an app-layer check that
-- rejects employee ids outside the caller's org — but that only protects
-- callers going through the Next.js action. A direct Supabase/PostgREST
-- write (or any future API surface, including the planned mobile bridge)
-- can still link an employee from a different org into an assignment,
-- corrupting that employee's workload data across the tenant boundary.
--
-- This adds the same employee-org check RLS already relies on elsewhere,
-- mirroring the shape of the existing assignment-org check right next to
-- it, as defense-in-depth at the database layer.
-- =============================================================================

drop policy if exists assignment_staff_manager_write on public.assignment_staff;
create policy assignment_staff_manager_write on public.assignment_staff
  for all to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) in ('admin','dispatcher')
    and exists (
      select 1 from public.assignments a
       where a.id = assignment_staff.assignment_id
         and a.org_id = (select org_id from public.profiles where id = auth.uid())
    )
    and exists (
      select 1 from public.employees e
       where e.id = assignment_staff.employee_id
         and e.org_id = (select org_id from public.profiles where id = auth.uid())
    )
  )
  with check (
    (select role from public.profiles where id = auth.uid()) in ('admin','dispatcher')
    and exists (
      select 1 from public.assignments a
       where a.id = assignment_staff.assignment_id
         and a.org_id = (select org_id from public.profiles where id = auth.uid())
    )
    and exists (
      select 1 from public.employees e
       where e.id = assignment_staff.employee_id
         and e.org_id = (select org_id from public.profiles where id = auth.uid())
    )
  );

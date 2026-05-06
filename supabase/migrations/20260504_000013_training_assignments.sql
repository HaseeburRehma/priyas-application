-- =============================================================================
-- Training assignments — let managers scope modules to specific employees.
-- =============================================================================
-- Today, every employee sees every module. Some modules are role-specific
-- (e.g. "Alltagshilfe documentation training" for care staff only). This
-- table records "module X is assigned to employee Y by manager Z".
--
-- Visibility rule (enforced at the data-fetch layer): an employee sees a
-- module if either (a) it has no assignments at all (legacy / shared
-- modules) OR (b) at least one assignment row matches them. Assignments
-- can be created from the training module editor.
-- =============================================================================

create table if not exists public.training_assignments (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  module_id   uuid not null references public.training_modules(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  due_date    date,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  unique (module_id, employee_id)
);
create index if not exists idx_train_assign_emp on public.training_assignments(employee_id);
create index if not exists idx_train_assign_mod on public.training_assignments(module_id);

alter table public.training_assignments enable row level security;

drop policy if exists "train_assign:read" on public.training_assignments;
create policy "train_assign:read" on public.training_assignments for select
  using (
    org_id = public.current_org_id()
    and (
      public.is_dispatcher_or_admin()
      or employee_id in (select id from public.employees where profile_id = auth.uid())
    )
  );

drop policy if exists "train_assign:write dispatcher" on public.training_assignments;
create policy "train_assign:write dispatcher" on public.training_assignments for insert
  with check (
    org_id = public.current_org_id() and public.is_dispatcher_or_admin()
  );

drop policy if exists "train_assign:delete dispatcher" on public.training_assignments;
create policy "train_assign:delete dispatcher" on public.training_assignments for delete
  using (
    org_id = public.current_org_id() and public.is_dispatcher_or_admin()
  );

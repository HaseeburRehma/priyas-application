-- Add service_type to employees to track which service line an employee works in.
-- Values: 'priya' | 'alltagshilfe' | 'both'  (matches the UI chip logic).
alter table public.employees
  add column if not exists service_type text
    not null default 'both'
    check (service_type in ('priya', 'alltagshilfe', 'both'));

create index if not exists idx_emp_service_type
  on public.employees(org_id, service_type) where deleted_at is null;

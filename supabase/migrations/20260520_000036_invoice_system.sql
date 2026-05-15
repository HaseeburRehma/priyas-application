-- =============================================================================
-- Invoice system foundation (M1)
-- -----------------------------------------------------------------------------
-- Adds:
--   • assignments        — property × client × planned hours × rate
--   • assignment_staff   — per-staff hour allocations inside an assignment
--   • alltagshilfe_budgets — per-client per-year budget bookkeeping
--   • invoice_sequences  — atomic per-org, per-prefix, per-year counters
--   • invoice_payments   — partial payments
-- Extends:
--   • clients            — annual budget, default rate, export target, billing email
--   • shifts             — billing_status, billable_minutes, approval, assignment FK
--   • invoices           — invoice_kind, period range, email tracking, payment summary
-- Adds:
--   • RLS policies, indexes, helper functions, and triggers
-- =============================================================================

-- ---- 1. Enums ---------------------------------------------------------------
do $$ begin
  create type public.invoice_kind as enum ('regular', 'alltagshilfe');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.export_target as enum ('internal', 'lexware');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.shift_billing_status
    as enum ('pending', 'approved', 'invoiced', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.assignment_frequency
    as enum ('weekly', 'biweekly', 'monthly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_email_status
    as enum ('pending', 'queued', 'sent', 'delivered', 'bounced', 'failed');
exception when duplicate_object then null; end $$;

-- ---- 2. Clients: billing fields --------------------------------------------
alter table public.clients
  add column if not exists default_hourly_rate_cents  bigint
    check (default_hourly_rate_cents is null or default_hourly_rate_cents >= 0),
  add column if not exists annual_budget_cents        bigint
    check (annual_budget_cents is null or annual_budget_cents >= 0),
  add column if not exists export_target              public.export_target
    not null default 'internal',
  add column if not exists billing_email              text,
  add column if not exists vat_id                     text,
  -- service code used on Alltagshilfe insurance submissions
  add column if not exists service_code               text;

-- Default annual budget for Alltagshilfe = €1,575 (157500 cents).
update public.clients
   set annual_budget_cents = 157500
 where customer_type = 'alltagshilfe'
   and annual_budget_cents is null;

-- ---- 3. Assignments --------------------------------------------------------
create table if not exists public.assignments (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references public.organizations(id) on delete restrict,
  client_id           uuid not null references public.clients(id) on delete cascade,
  property_id         uuid not null references public.properties(id) on delete cascade,
  -- Planned (contractual) workload
  hours_per_period    numeric(8,2) not null check (hours_per_period > 0),
  frequency           public.assignment_frequency not null default 'weekly',
  -- Billable rate at the assignment level. Falls back to clients.default_hourly_rate_cents
  -- then to a system default if null.
  hourly_rate_cents   bigint check (hourly_rate_cents is null or hourly_rate_cents >= 0),
  starts_on           date not null default current_date,
  ends_on             date,
  -- Active/archived
  active              boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  -- A property is normally only billed under one active assignment at a time.
  -- We allow historical/overlapping rows but the index keeps active ones unique.
  constraint chk_assignment_dates check (ends_on is null or ends_on >= starts_on)
);
create index if not exists idx_assign_org    on public.assignments(org_id) where deleted_at is null;
create index if not exists idx_assign_client on public.assignments(client_id) where deleted_at is null;
create index if not exists idx_assign_prop   on public.assignments(property_id) where deleted_at is null;
create unique index if not exists uniq_assign_active_property
  on public.assignments(property_id)
  where deleted_at is null and active is true;

drop trigger if exists trg_assign_updated on public.assignments;
create trigger trg_assign_updated before update on public.assignments
  for each row execute function public.set_updated_at();

-- ---- 4. Assignment staff (per-staff allocation) ----------------------------
create table if not exists public.assignment_staff (
  id                uuid primary key default uuid_generate_v4(),
  assignment_id     uuid not null references public.assignments(id) on delete cascade,
  employee_id       uuid not null references public.employees(id) on delete cascade,
  allocated_hours   numeric(8,2) not null check (allocated_hours > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (assignment_id, employee_id)
);
create index if not exists idx_assign_staff_assignment on public.assignment_staff(assignment_id);
create index if not exists idx_assign_staff_employee   on public.assignment_staff(employee_id);

drop trigger if exists trg_assign_staff_updated on public.assignment_staff;
create trigger trg_assign_staff_updated before update on public.assignment_staff
  for each row execute function public.set_updated_at();

-- ---- 5. Shifts: billing extensions -----------------------------------------
alter table public.shifts
  add column if not exists assignment_id      uuid references public.assignments(id) on delete set null,
  add column if not exists billing_status     public.shift_billing_status not null default 'pending',
  add column if not exists billable_minutes   integer
    check (billable_minutes is null or billable_minutes >= 0),
  add column if not exists actual_minutes     integer
    check (actual_minutes is null or actual_minutes >= 0),
  add column if not exists override_rate_cents bigint
    check (override_rate_cents is null or override_rate_cents >= 0),
  add column if not exists approved_by        uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at        timestamptz,
  add column if not exists rejection_reason   text,
  add column if not exists invoice_item_id    uuid;

create index if not exists idx_shifts_billing
  on public.shifts(org_id, billing_status, starts_at)
  where deleted_at is null;
create index if not exists idx_shifts_assignment
  on public.shifts(assignment_id)
  where deleted_at is null;

-- ---- 6. Invoices: kind, period, email tracking, payment summary ------------
alter table public.invoices
  add column if not exists invoice_kind          public.invoice_kind not null default 'regular',
  add column if not exists period_start          date,
  add column if not exists period_end            date,
  add column if not exists assignment_id         uuid references public.assignments(id) on delete set null,
  add column if not exists email_status          public.invoice_email_status not null default 'pending',
  add column if not exists email_sent_at         timestamptz,
  add column if not exists email_last_event_at   timestamptz,
  add column if not exists email_provider_id     text,
  add column if not exists email_recipient       text,
  add column if not exists paid_amount_cents     bigint not null default 0
    check (paid_amount_cents >= 0),
  add column if not exists export_target         public.export_target not null default 'internal',
  add column if not exists number_prefix         text,
  -- Period stored on the row makes "issued in May 2026 for April 2026" queryable.
  add constraint chk_invoice_period
    check (period_start is null or period_end is null or period_end >= period_start);

-- Backfill number_prefix from existing invoice_numbers if any (RE-/AH-).
update public.invoices
   set number_prefix = split_part(invoice_number, '-', 1)
 where number_prefix is null
   and invoice_number ~ '^[A-Z]+-';

create index if not exists idx_inv_period_range
  on public.invoices(org_id, period_start, period_end)
  where deleted_at is null;
create index if not exists idx_inv_email_status
  on public.invoices(org_id, email_status)
  where deleted_at is null and email_status in ('queued', 'pending');

-- Add FK from shifts.invoice_item_id → invoice_items.id now that both exist.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shifts_invoice_item_id_fkey'
      and conrelid = 'public.shifts'::regclass
  ) then
    alter table public.shifts
      add constraint shifts_invoice_item_id_fkey
      foreign key (invoice_item_id)
      references public.invoice_items(id) on delete set null;
  end if;
end $$;

-- ---- 7. Invoice payments ---------------------------------------------------
create table if not exists public.invoice_payments (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  amount_cents    bigint not null check (amount_cents > 0),
  paid_at         timestamptz not null default now(),
  method          text,
  reference       text,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_inv_pay_invoice on public.invoice_payments(invoice_id, paid_at desc);
create index if not exists idx_inv_pay_org     on public.invoice_payments(org_id, paid_at desc);

-- ---- 8. Invoice sequences (atomic per-prefix counter) ----------------------
create table if not exists public.invoice_sequences (
  org_id        uuid not null references public.organizations(id) on delete cascade,
  prefix        text not null,
  year          integer not null check (year between 2024 and 2100),
  next_number   integer not null default 1 check (next_number >= 1),
  updated_at    timestamptz not null default now(),
  primary key (org_id, prefix, year)
);

-- next_invoice_number — atomic increment, returns formatted "PREFIX-YYYY-NNN".
create or replace function public.next_invoice_number(
  p_org_id  uuid,
  p_prefix  text,
  p_year    integer default extract(year from current_date)::int
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num integer;
begin
  if p_org_id is null then
    raise exception 'org_id required';
  end if;
  if p_prefix is null or length(p_prefix) = 0 then
    raise exception 'prefix required';
  end if;

  insert into public.invoice_sequences (org_id, prefix, year, next_number)
       values (p_org_id, p_prefix, p_year, 2)
       on conflict (org_id, prefix, year)
       do update set next_number = public.invoice_sequences.next_number + 1,
                     updated_at  = now()
       returning next_number - 1 into v_num;

  return p_prefix || '-' || lpad(p_year::text, 4, '0') || '-' || lpad(v_num::text, 4, '0');
end;
$$;
grant execute on function public.next_invoice_number(uuid, text, integer) to authenticated, service_role;

-- ---- 9. Alltagshilfe budget bookkeeping ------------------------------------
create table if not exists public.alltagshilfe_budgets (
  id                uuid primary key default uuid_generate_v4(),
  org_id            uuid not null references public.organizations(id) on delete restrict,
  client_id         uuid not null references public.clients(id) on delete cascade,
  year              integer not null check (year between 2024 and 2100),
  budget_cents      bigint not null default 157500 check (budget_cents >= 0),
  used_cents        bigint not null default 0 check (used_cents >= 0),
  reserved_cents    bigint not null default 0 check (reserved_cents >= 0),
  alerted_80        boolean not null default false,
  alerted_90        boolean not null default false,
  alerted_100       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (client_id, year)
);
create index if not exists idx_ah_budget_org  on public.alltagshilfe_budgets(org_id, year);
create index if not exists idx_ah_budget_used on public.alltagshilfe_budgets(client_id, year);

drop trigger if exists trg_ah_budget_updated on public.alltagshilfe_budgets;
create trigger trg_ah_budget_updated before update on public.alltagshilfe_budgets
  for each row execute function public.set_updated_at();

-- recalc_alltagshilfe_budget — recomputes used/reserved from invoices for a year.
-- "used"     = sum of paid invoices for the year
-- "reserved" = sum of sent / draft invoices not yet paid (forward-looking cap)
create or replace function public.recalc_alltagshilfe_budget(
  p_client_id uuid,
  p_year      integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id        uuid;
  v_used          bigint;
  v_reserved      bigint;
  v_budget        bigint;
begin
  select org_id, coalesce(annual_budget_cents, 157500)
    into v_org_id, v_budget
    from public.clients
   where id = p_client_id;

  if v_org_id is null then return; end if;

  select coalesce(sum(total_cents) filter (where status = 'paid'), 0),
         coalesce(sum(total_cents) filter (where status in ('draft','sent','overdue')), 0)
    into v_used, v_reserved
    from public.invoices
   where client_id    = p_client_id
     and invoice_kind = 'alltagshilfe'
     and deleted_at is null
     and extract(year from issue_date) = p_year;

  insert into public.alltagshilfe_budgets
        (org_id, client_id, year, budget_cents, used_cents, reserved_cents)
       values (v_org_id, p_client_id, p_year, v_budget, v_used, v_reserved)
       on conflict (client_id, year) do update
       set used_cents     = excluded.used_cents,
           reserved_cents = excluded.reserved_cents,
           budget_cents   = excluded.budget_cents,
           updated_at     = now();
end;
$$;
grant execute on function public.recalc_alltagshilfe_budget(uuid, integer) to authenticated, service_role;

-- Trigger: keep budgets in sync when invoices change.
create or replace function public.tg_alltagshilfe_invoice_budget()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    if old.invoice_kind = 'alltagshilfe' then
      perform public.recalc_alltagshilfe_budget(old.client_id, extract(year from old.issue_date)::int);
    end if;
    return old;
  end if;

  if new.invoice_kind = 'alltagshilfe' then
    perform public.recalc_alltagshilfe_budget(new.client_id, extract(year from new.issue_date)::int);
  end if;
  -- If the year changed, also recalc the old year.
  if tg_op = 'UPDATE'
     and old.invoice_kind = 'alltagshilfe'
     and extract(year from old.issue_date) <> extract(year from new.issue_date) then
    perform public.recalc_alltagshilfe_budget(old.client_id, extract(year from old.issue_date)::int);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inv_ah_budget on public.invoices;
create trigger trg_inv_ah_budget
after insert or update or delete on public.invoices
for each row execute function public.tg_alltagshilfe_invoice_budget();

-- ---- 10. RLS policies ------------------------------------------------------
alter table public.assignments         enable row level security;
alter table public.assignment_staff    enable row level security;
alter table public.alltagshilfe_budgets enable row level security;
alter table public.invoice_payments    enable row level security;
alter table public.invoice_sequences   enable row level security;

-- Reuse the org membership helper that other tables use.
-- (matches the pattern from foundation: profiles.org_id = invoices.org_id)
drop policy if exists assignments_member_select on public.assignments;
create policy assignments_member_select on public.assignments
  for select to authenticated
  using (
    org_id = (select org_id from public.profiles where id = auth.uid())
  );

drop policy if exists assignments_manager_write on public.assignments;
create policy assignments_manager_write on public.assignments
  for all to authenticated
  using (
    org_id = (select org_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin','dispatcher')
  )
  with check (
    org_id = (select org_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin','dispatcher')
  );

drop policy if exists assignment_staff_member_select on public.assignment_staff;
create policy assignment_staff_member_select on public.assignment_staff
  for select to authenticated
  using (
    exists (
      select 1 from public.assignments a
       where a.id = assignment_staff.assignment_id
         and a.org_id = (select org_id from public.profiles where id = auth.uid())
    )
  );

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
  )
  with check (
    (select role from public.profiles where id = auth.uid()) in ('admin','dispatcher')
    and exists (
      select 1 from public.assignments a
       where a.id = assignment_staff.assignment_id
         and a.org_id = (select org_id from public.profiles where id = auth.uid())
    )
  );

drop policy if exists ah_budget_member_select on public.alltagshilfe_budgets;
create policy ah_budget_member_select on public.alltagshilfe_budgets
  for select to authenticated
  using (
    org_id = (select org_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin','dispatcher')
  );

drop policy if exists invoice_payments_member_select on public.invoice_payments;
create policy invoice_payments_member_select on public.invoice_payments
  for select to authenticated
  using (
    org_id = (select org_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin','dispatcher')
  );

drop policy if exists invoice_payments_manager_write on public.invoice_payments;
create policy invoice_payments_manager_write on public.invoice_payments
  for all to authenticated
  using (
    org_id = (select org_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin','dispatcher')
  )
  with check (
    org_id = (select org_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('admin','dispatcher')
  );

-- invoice_sequences is service-only; no direct user access.
drop policy if exists invoice_sequences_no_user on public.invoice_sequences;
create policy invoice_sequences_no_user on public.invoice_sequences
  for select to authenticated using (false);

-- ---- 11. Helper view: assignment summary ----------------------------------
create or replace view public.assignment_summary as
select
  a.id                                                            as assignment_id,
  a.org_id,
  a.client_id,
  c.display_name                                                  as client_name,
  c.customer_type,
  a.property_id,
  p.name                                                          as property_name,
  a.hours_per_period,
  a.frequency,
  coalesce(a.hourly_rate_cents,
           c.default_hourly_rate_cents,
           3500)                                                  as effective_rate_cents,
  a.active,
  a.starts_on,
  a.ends_on,
  -- Sum of staff allocated hours
  coalesce((select sum(s.allocated_hours)
              from public.assignment_staff s
             where s.assignment_id = a.id), 0)                    as allocated_hours,
  -- Staff count
  coalesce((select count(*)
              from public.assignment_staff s
             where s.assignment_id = a.id), 0)                    as staff_count
from public.assignments a
join public.clients    c on c.id = a.client_id
join public.properties p on p.id = a.property_id
where a.deleted_at is null;

grant select on public.assignment_summary to authenticated;

-- ---- 12. Convenience: backfill open Alltagshilfe budgets for current year --
insert into public.alltagshilfe_budgets (org_id, client_id, year, budget_cents)
select c.org_id, c.id, extract(year from current_date)::int,
       coalesce(c.annual_budget_cents, 157500)
  from public.clients c
 where c.customer_type = 'alltagshilfe'
   and c.deleted_at is null
   and not exists (
     select 1 from public.alltagshilfe_budgets b
      where b.client_id = c.id and b.year = extract(year from current_date)::int
   );

-- Recompute used/reserved for any existing alltagshilfe invoices.
do $$
declare
  r record;
begin
  for r in
    select distinct client_id, extract(year from issue_date)::int as yr
      from public.invoices
     where invoice_kind = 'alltagshilfe'
       and deleted_at is null
  loop
    perform public.recalc_alltagshilfe_budget(r.client_id, r.yr);
  end loop;
end $$;

comment on table public.assignments is
  'Property × client × planned hours × rate. Source of truth for "what should be billed".';
comment on table public.assignment_staff is
  'Per-staff hour allocation inside an assignment (e.g. 10h split 3/4/3).';
comment on table public.alltagshilfe_budgets is
  'Per-client per-year Alltagshilfe budget (default €1,575). Used to enforce caps.';
comment on table public.invoice_payments is
  'Partial payments against an invoice. Sum is reflected in invoices.paid_amount_cents.';
comment on table public.invoice_sequences is
  'Atomic per-org per-prefix per-year counter. Use next_invoice_number() to draw.';

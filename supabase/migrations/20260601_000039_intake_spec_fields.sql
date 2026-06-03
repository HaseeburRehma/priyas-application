-- =============================================================================
-- Intake-form spec alignment + employee video-onboarding gate.
--
-- Drives three client-feedback items from the May 18 Figma comments:
--
--   1. Expand the "new client" intake (Priya + Alltagshilfe) to capture
--      the exact field list the operations manager fills out: split
--      names, address, billing address, cleaning rhythm, estimated effort,
--      agreed hourly rate, contract start, plus Alltagshilfe-specific
--      DOB, Abtretungserklärung (assignment declaration), and "contract
--      documents already signed" flag.
--   2. Expand the "new team member" intake: nationality, DOB, salary
--      type + amount, vacation days/year, contract start.
--   3. Gate dashboard access for new employees until they finish a
--      sequenced training-video flow. We add `system_unlocked_at` to
--      `employees`; the gate in (dashboard)/layout.tsx checks for that
--      timestamp on every page request.
--
-- Idempotent on re-run.
-- =============================================================================

-- ---- 1. Enums ---------------------------------------------------------------
do $$ begin
  create type public.cleaning_rhythm
    as enum ('weekly', 'biweekly', 'monthly', 'on_demand');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.salary_type as enum ('hourly', 'monthly');
exception when duplicate_object then null; end $$;

-- ---- 2. Clients: new intake fields -----------------------------------------
alter table public.clients
  add column if not exists first_name              text,
  add column if not exists last_name               text,
  -- Service address (where cleaning happens for residential, where the
  -- care recipient lives for Alltagshilfe).
  add column if not exists address_line1           text,
  add column if not exists address_line2           text,
  add column if not exists postal_code             text,
  add column if not exists city                    text,
  add column if not exists country                 text default 'DE',
  -- Optional billing address — populated only when it differs from
  -- the service address. NULL means "same as service address".
  add column if not exists billing_address_line1   text,
  add column if not exists billing_address_line2   text,
  add column if not exists billing_postal_code     text,
  add column if not exists billing_city            text,
  add column if not exists billing_country         text,
  -- Recurring service shape
  add column if not exists cleaning_rhythm         public.cleaning_rhythm,
  add column if not exists estimated_hours_per_visit numeric(6,2)
    check (estimated_hours_per_visit is null or estimated_hours_per_visit > 0),
  add column if not exists agreed_hourly_rate_cents bigint
    check (agreed_hourly_rate_cents is null or agreed_hourly_rate_cents >= 0),
  add column if not exists contract_start          date,
  -- Alltagshilfe specifics
  add column if not exists date_of_birth           date,
  add column if not exists abtretungserklaerung    boolean,
  add column if not exists contract_docs_signed    boolean;

-- Backfill: when display_name is set but first/last aren't, split on the
-- last space as a reasonable best effort. The form will overwrite as
-- soon as anyone edits, but this prevents the legacy rows from looking
-- empty in the new UI.
update public.clients
   set first_name = case
         when position(' ' in display_name) > 0
         then split_part(display_name, ' ', 1)
         else null
       end,
       last_name = case
         when position(' ' in display_name) > 0
         then substring(display_name from position(' ' in display_name) + 1)
         else display_name
       end
 where first_name is null and last_name is null and display_name is not null;

comment on column public.clients.cleaning_rhythm is
  'How often Priya visits this client. NULL on legacy rows; required for new entries.';
comment on column public.clients.abtretungserklaerung is
  'Alltagshilfe only: signed Abtretungserklärung (assignment declaration) on file.';
comment on column public.clients.contract_docs_signed is
  'Alltagshilfe only: contract paperwork already signed at intake.';

-- ---- 3. Employees: new intake fields ---------------------------------------
alter table public.employees
  add column if not exists first_name             text,
  add column if not exists last_name              text,
  add column if not exists address_line1          text,
  add column if not exists address_line2          text,
  add column if not exists postal_code            text,
  add column if not exists city                   text,
  add column if not exists country                text default 'DE',
  add column if not exists date_of_birth          date,
  add column if not exists nationality            text,
  -- Compensation: salary_type chooses how `monthly_salary_cents`
  -- relates to `hourly_rate_eur`. For 'monthly', the legacy
  -- hourly_rate_eur is derived (or left null) and monthly_salary_cents
  -- drives payroll. For 'hourly', monthly_salary_cents is NULL.
  add column if not exists salary_type            public.salary_type
    not null default 'hourly',
  add column if not exists monthly_salary_cents   bigint
    check (monthly_salary_cents is null or monthly_salary_cents >= 0),
  add column if not exists vacation_days_per_year smallint
    check (vacation_days_per_year is null or vacation_days_per_year between 0 and 60),
  add column if not exists contract_start         date,
  -- System unlock: when not null, this employee has completed the
  -- mandatory video onboarding and can access the dashboard. NULL
  -- means dashboard layout redirects them to /onboard/videos.
  add column if not exists system_unlocked_at     timestamptz;

-- Backfill: split full_name → first_name / last_name on the last space.
update public.employees
   set first_name = case
         when position(' ' in full_name) > 0
         then split_part(full_name, ' ', 1)
         else null
       end,
       last_name = case
         when position(' ' in full_name) > 0
         then substring(full_name from position(' ' in full_name) + 1)
         else full_name
       end
 where first_name is null and last_name is null and full_name is not null;

-- Existing employees are not subject to the video gate — they joined
-- before the requirement. Stamp them as unlocked. Only newly-invited
-- employees (created after this migration) will land with NULL and
-- therefore be gated.
update public.employees
   set system_unlocked_at = coalesce(created_at, now())
 where system_unlocked_at is null;

comment on column public.employees.salary_type is
  'hourly = paid per worked hour (hourly_rate_eur); monthly = fixed salary (monthly_salary_cents).';
comment on column public.employees.system_unlocked_at is
  'NULL until the new hire finishes the mandatory training-video sequence. Gated by (dashboard)/layout.tsx.';

-- ---- 4. Employee video onboarding helper -----------------------------------
-- Convenience function for the gate: returns true when *any* mandatory
-- training module hasn't been signed off yet by this employee. The
-- dashboard layout calls this via supabase.rpc.
create or replace function public.employee_has_outstanding_mandatory_training(
  p_employee_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.training_modules m
    left join public.employee_training_progress p
      on p.module_id = m.id and p.employee_id = p_employee_id
    where m.is_mandatory
      and m.deleted_at is null
      and (p.completed_at is null)
  );
$$;
grant execute on function public.employee_has_outstanding_mandatory_training(uuid)
  to authenticated, service_role;

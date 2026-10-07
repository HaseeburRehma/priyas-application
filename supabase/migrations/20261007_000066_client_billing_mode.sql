-- Fixed-contract clients: billed a fixed monthly fee instead of hours worked.
-- Hours are still tracked internally (contracted vs. actual per month).

alter table public.clients
  add column if not exists billing_mode text not null default 'hourly',
  add column if not exists fixed_monthly_fee_cents integer,
  add column if not exists contracted_hours_per_month numeric(6,2),
  add column if not exists contract_months smallint,
  add column if not exists contract_end date;

alter table public.clients drop constraint if exists clients_billing_mode_check;
alter table public.clients add constraint clients_billing_mode_check
  check (billing_mode in ('hourly', 'fixed'));

alter table public.clients drop constraint if exists clients_fixed_fee_check;
alter table public.clients add constraint clients_fixed_fee_check
  check (billing_mode <> 'fixed' or coalesce(fixed_monthly_fee_cents, 0) > 0);

create index if not exists clients_fixed_contract_end_idx
  on public.clients (contract_end)
  where billing_mode = 'fixed' and deleted_at is null;

-- The create form saved the agreed rate to agreed_hourly_rate_cents while
-- billing reads default_hourly_rate_cents, so new clients fell back to the
-- assignment rate or 35 EUR. Backfill the rate that was actually agreed.
update public.clients
   set default_hourly_rate_cents = agreed_hourly_rate_cents
 where default_hourly_rate_cents is null
   and agreed_hourly_rate_cents is not null;

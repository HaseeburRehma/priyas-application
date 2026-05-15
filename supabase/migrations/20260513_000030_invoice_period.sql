-- =============================================================================
-- Monthly auto-invoice support for the Lexware cron.
--
-- Adds period bookkeeping to `invoices` so we can:
--   • Group invoices by (client_id, year, month) and detect already-billed
--     months when generating the monthly run.
--   • Tag each row with its origin (`manual`, `auto_monthly`, `import`) for
--     audit + reporting.
--   • Hard-prevent double-billing via a partial unique index on the auto
--     channel.
--
-- Idempotent — safe to run on top of any prior state.
-- =============================================================================

alter table public.invoices
  add column if not exists period_year  int,
  add column if not exists period_month int,
  add column if not exists source       text not null default 'manual';

-- Constrain the period columns to plausible values.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_period_month_chk'
  ) then
    alter table public.invoices
      add constraint invoices_period_month_chk
      check (period_month is null or (period_month >= 0 and period_month <= 11));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_period_year_chk'
  ) then
    alter table public.invoices
      add constraint invoices_period_year_chk
      check (period_year is null or (period_year >= 2000 and period_year <= 2100));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_source_chk'
  ) then
    alter table public.invoices
      add constraint invoices_source_chk
      check (source in ('manual', 'auto_monthly', 'import'));
  end if;
end $$;

-- Helpful read index for the cron's "is this client already billed?" lookup.
create index if not exists idx_inv_client_period
  on public.invoices(client_id, period_year, period_month)
  where deleted_at is null;

-- Partial unique index — only auto_monthly rows can collide. Manual / import
-- invoices are free to repeat (e.g. you re-issue a manual one in a corrected
-- form). Live (non-deleted) rows only.
create unique index if not exists uniq_inv_client_period_auto
  on public.invoices(client_id, period_year, period_month)
  where source = 'auto_monthly' and deleted_at is null;

-- =============================================================================
-- Lexware reconciliation hardening (M1).
--
-- Adds the columns + indexes needed for:
--   1. List-view sync-state chip (Synced / Pending / Failed / N/A)
--   2. Nightly retry sweep — re-pushes invoices whose first attempt failed
--   3. Payment-sync poll — reads paid vouchers from Lexware, mirrors them
--      back as invoice_payments rows
--
-- Idempotent on re-run. None of the previously-built invoice flow needs
-- to change — `lexware_id` continues to act as the "successfully synced"
-- marker, this migration just records the *attempts* alongside it.
-- =============================================================================

-- ---- 1. Enum ---------------------------------------------------------------
do $$ begin
  create type public.lexware_sync_status
    as enum ('na', 'pending', 'synced', 'failed');
exception when duplicate_object then null; end $$;

-- ---- 2. Invoices: sync-state bookkeeping ------------------------------------
alter table public.invoices
  -- 'na'      → client.export_target != 'lexware' (no sync ever needed)
  -- 'pending' → export_target = 'lexware', not yet pushed, no failure recorded
  -- 'synced'  → lexware_id IS NOT NULL (successfully accepted)
  -- 'failed'  → at least one attempt has failed; lexware_id still NULL
  add column if not exists lexware_sync_status   public.lexware_sync_status
    not null default 'na',
  add column if not exists lexware_last_attempt_at timestamptz,
  add column if not exists lexware_last_error      text,
  add column if not exists lexware_attempts        integer not null default 0;

-- Backfill state from existing data so the chip is correct for legacy rows.
update public.invoices
   set lexware_sync_status = 'synced'
 where lexware_id is not null
   and lexware_sync_status = 'na';

update public.invoices
   set lexware_sync_status = 'pending'
 where lexware_id is null
   and export_target = 'lexware'
   and lexware_sync_status = 'na'
   and status in ('sent', 'overdue', 'paid');

-- The retry sweep filters on (export_target, status, lexware_sync_status,
-- lexware_last_attempt_at). A partial covering index keeps that scan
-- cheap regardless of org size — only the rows that *might* need retry
-- live in the index.
create index if not exists idx_inv_lexware_retry_candidates
  on public.invoices(lexware_last_attempt_at nulls first)
  where deleted_at is null
    and lexware_id is null
    and export_target = 'lexware'
    and status in ('sent', 'overdue', 'paid');

-- For the list-view chip query and dashboard tile.
create index if not exists idx_inv_lexware_sync_status
  on public.invoices(org_id, lexware_sync_status)
  where deleted_at is null;

-- ---- 3. Invoice payments: dedup foreign rows -------------------------------
-- Payment-sync poll inserts an invoice_payments row for every paid voucher
-- it sees in Lexware that doesn't already have a local counterpart. The
-- voucher id is the natural dedup key (Lexware's id is globally unique).
alter table public.invoice_payments
  add column if not exists lexware_voucher_id text;

-- Partial unique index so a single voucher can only ever materialise as
-- one row in our DB regardless of how many times the poll runs.
create unique index if not exists uniq_inv_pay_lexware_voucher
  on public.invoice_payments(lexware_voucher_id)
  where lexware_voucher_id is not null;

-- ---- 4. Settings table: last successful Lexware-payment poll cursor --------
-- The payment-sync cron asks Lexware "what's paid since <timestamp>?" — we
-- store that timestamp in the org-level settings JSON so the next run
-- only pulls deltas. Settings.data is already a freeform jsonb, so we
-- don't need a schema change — just a comment documenting the contract.
comment on column public.settings.data is
  'Org-level KV. Reserved keys: company.{legalName,vatId,address,supportEmail}, '
  'lexware.{lastPaymentSyncAt} (timestamptz ISO string).';

-- ---- 5. Helper view for the dashboard / list-view chip ---------------------
create or replace view public.invoice_sync_summary as
select
  org_id,
  count(*) filter (where lexware_sync_status = 'synced')  as synced_count,
  count(*) filter (where lexware_sync_status = 'pending') as pending_count,
  count(*) filter (where lexware_sync_status = 'failed')  as failed_count,
  -- Total push-eligible invoices (the chip denominator).
  count(*) filter (where export_target = 'lexware') as eligible_count
from public.invoices
where deleted_at is null
group by org_id;

grant select on public.invoice_sync_summary to authenticated;

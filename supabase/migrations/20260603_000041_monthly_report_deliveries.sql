-- Monthly report delivery log
--
-- Tracks every "Send to management" event for the Alltagshilfe (and
-- future Priya's) monthly billing report. The page surfaces the most
-- recent entry as a Delivery panel ("Sent · 01 Apr · 06:02 — PDF · CSV
-- attached"); the table powers the audit trail demanded by §4.7 of the
-- spec (every external email touching billing data must be replayable).
--
-- Distinct from invoice email tracking (which lives on the invoices
-- table) because monthly reports aren't invoices — they're a summary
-- document sent to internal management who then creates manual
-- invoices in Lexware for each insurance company.

create table if not exists public.monthly_report_deliveries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,

  -- 'alltagshilfe' today; 'priya' reserved for the regular-customers
  -- monthly summary we'll add later. Keeping the column open-ended
  -- lets us reuse the table without a future ALTER.
  report_type     text not null check (report_type in ('alltagshilfe','priya')),

  -- The reporting period (month is 0–11 to match JS Date conventions
  -- so app-side comparisons don't need conversion).
  period_year     smallint not null,
  period_month    smallint not null check (period_month between 0 and 11),

  status          text not null check (status in (
    'queued',       -- waiting on the email provider
    'sent',         -- accepted by Resend
    'failed',       -- provider returned an error
    'manual_skipped' -- admin marked it as handled outside the system
  )),

  recipient       text not null,
  format          text not null default 'PDF · CSV',
  email_provider_id text,
  error_message   text,

  -- Snapshot of the totals at the moment of send so the audit row
  -- doesn't drift if shifts get edited retroactively. The dashboard
  -- always shows whichever totals are live, but the delivery row
  -- preserves what the recipient actually received.
  total_hours        numeric not null default 0,
  total_amount_cents bigint  not null default 0,
  customers_count    int     not null default 0,
  staff_count        int     not null default 0,

  sent_at         timestamptz,
  sent_by         uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- One row per (org, report_type, period) when status='sent' so the
-- "latest delivery" lookup is O(1). We allow multiple failed/queued
-- rows for the same period (retries) but at most one successful.
create unique index if not exists monthly_report_deliveries_sent_uniq
  on public.monthly_report_deliveries (org_id, report_type, period_year, period_month)
  where status = 'sent';

create index if not exists monthly_report_deliveries_org_period_idx
  on public.monthly_report_deliveries (org_id, report_type, period_year desc, period_month desc, created_at desc);

alter table public.monthly_report_deliveries enable row level security;

-- Read: any org member can see the delivery log (it's metadata, not
-- patient data — the actual report stays out of this table). The
-- "view" permission already gates the page itself via RBAC.
create policy "monthly_report_deliveries select org members"
  on public.monthly_report_deliveries
  for select
  using (org_id = public.current_org_id());

-- Insert: admin or dispatcher only — sending a report counts as a
-- privileged operation since it emails outside the org.
create policy "monthly_report_deliveries insert admin/dispatcher"
  on public.monthly_report_deliveries
  for insert
  with check (
    org_id = public.current_org_id()
    and public.is_dispatcher_or_admin()
  );

-- Update: admin/dispatcher can edit (e.g. mark as manual_skipped or
-- patch a stale error message). We never delete delivery rows; that
-- preserves the audit chain.
create policy "monthly_report_deliveries update admin/dispatcher"
  on public.monthly_report_deliveries
  for update
  using (
    org_id = public.current_org_id()
    and public.is_dispatcher_or_admin()
  )
  with check (
    org_id = public.current_org_id()
    and public.is_dispatcher_or_admin()
  );

comment on table public.monthly_report_deliveries is
  'Audit trail of monthly billing-report emails sent to management. One sent row per (org, type, period); retries land as additional failed/queued rows.';

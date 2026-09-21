-- =============================================================================
-- TyloTech Feature Update — schema foundation for the client's 19-item wishlist.
--
-- Adds every new column / enum / table / bucket the follow-up commits will
-- touch, so the code layer can rely on the DB shape from the very first
-- commit. Everything is idempotent (`if not exists` / `on conflict do
-- nothing`) so this migration is safe to replay against a partial state.
--
-- Change map (item numbers from TyloTech_Priya_Feature_Update.pdf):
--   #1  company_name column on clients
--   #4  key_object boolean on clients
--   #5  handled via existing client-documents bucket (no schema change)
--   #6  notes_latest_at, notes_latest_by on clients (rest reuses clients.notes)
--   #7  (Files tab reuses existing client_documents table)
--   #10 employment status enum extended to include 'terminated'
--   #11 new availability_status enum on employees: active/inactive/on_vacation/sick
--   #12 recommended_weekdays int[] on clients (0=Sun .. 6=Sat, per JS Date convention)
--   #17 one_off_jobs table for quick-cleanings without a client record
--   #18 supply_flags table for cleaning-supplies-missing reports
--   #19 pm_files bucket + pm_notes table for the PM dashboard widget
--
-- Not touched here (still open in the feature list, will land in later
-- migrations if they need schema):
--   #3  welcome-email automation (code + trigger only, no schema)
--   #14 staff-fit recommender (planned as an RPC + config table if scoring
--       gets non-trivial; keeping schema empty until the algorithm shape
--       is agreed)
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- #1 · Company name
-- Free-text, nullable at the DB level so the migration doesn't fail on
-- existing rows. The client-side form marks it required for NEW rows only
-- (see updated createClientSchema in src/lib/validators/clients.ts).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.clients
  add column if not exists company_name text;


-- ─────────────────────────────────────────────────────────────────────────────
-- #4 · Key object (Schlüsselobjekt) — does Priya's team have the key?
-- Defaults to false so existing rows are safely opted out.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.clients
  add column if not exists key_object boolean not null default false;


-- ─────────────────────────────────────────────────────────────────────────────
-- #6 · Notes preview on the customer overview
-- The `clients.notes text` column already exists (see 20260504_000002_domain.sql).
-- Add two audit-shaped columns so the overview can render "latest note"
-- alongside the author, without needing a separate notes-history table for
-- v1 — a single mutable notes field with "last updated by" is close enough
-- to what the client asked for.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.clients
  add column if not exists notes_updated_at timestamptz;

alter table public.clients
  add column if not exists notes_updated_by uuid
    references public.profiles(id) on delete set null;


-- ─────────────────────────────────────────────────────────────────────────────
-- #12 · Recommended weekdays per customer
-- int[] where each element is a JS-style day-of-week (0 = Sunday .. 6 = Saturday).
-- Used by the schedule to short-list "customers usually cleaned on this day".
-- Nullable so existing rows read as "no preference".
--
-- Note: Alltagshilfe intake already writes `preferred_days text[]` (string
-- names like 'mon','tue'…). We intentionally use a separate int-array column
-- so the schedule query stays fast (`... where 1 = any(recommended_weekdays)`)
-- and doesn't need lowercasing / dictionary lookups. Follow-ups can back-fill
-- from `preferred_days` if desired.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.clients
  add column if not exists recommended_weekdays int[] not null default '{}';

-- Guard rail: every entry must be a valid weekday 0..6 and the array
-- must have no more than 7 elements.
--
-- Postgres check constraints forbid sub-queries (`select …`), so the
-- element-range check uses `<@` (array-contained-by): if every entry
-- lies within ARRAY[0..6], the whole array is contained. Same result,
-- no subquery.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_recommended_weekdays_valid'
  ) then
    alter table public.clients
      add constraint clients_recommended_weekdays_valid
      check (
        cardinality(recommended_weekdays) <= 7
        and recommended_weekdays <@ array[0,1,2,3,4,5,6]::int[]
      );
  end if;
end $$;

-- Index for the schedule assistant's per-weekday shortlist.
-- Plain `create index` (not CONCURRENTLY) so this migration can be
-- pasted into the Supabase SQL editor, which wraps each request in a
-- transaction and rejects CONCURRENTLY. Table is small (low thousands
-- of rows in the largest orgs), so the brief ACCESS EXCLUSIVE lock is
-- imperceptible. If applied via `supabase db push` on a very large DB,
-- swap in `create index concurrently` — the runner handles it.
create index if not exists idx_clients_recommended_weekdays
  on public.clients using gin (recommended_weekdays)
  where deleted_at is null;


-- ─────────────────────────────────────────────────────────────────────────────
-- #10 · Extend employees.status enum to include 'terminated' (gekündigt)
-- The column is defined as `text ... check (status in (...))` in the
-- foundation domain migration, so we drop-and-recreate the check with the
-- new value included. Safe: no existing rows currently carry 'terminated'
-- (it doesn't exist).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.employees
  drop constraint if exists employees_status_check;

alter table public.employees
  add constraint employees_status_check
  check (status in ('active','on_leave','inactive','terminated'));


-- ─────────────────────────────────────────────────────────────────────────────
-- #11 · availability_status — separate axis from employment status.
--
-- Employment status ('active' / 'terminated') describes the contract;
-- availability describes whether the person is available for shifts right
-- now. An employee can be `status = active` (employed) but
-- `availability_status = sick` (out sick this week).
--
-- Enum via check-constraint to match the existing enum style on this table.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.employees
  add column if not exists availability_status text
    not null default 'active'
    check (availability_status in ('active','inactive','on_vacation','sick'));

-- Plain `create index` for SQL-editor compatibility (see the trailing
-- note on idx_clients_recommended_weekdays above).
create index if not exists idx_emp_availability
  on public.employees (org_id, availability_status)
  where deleted_at is null;


-- ─────────────────────────────────────────────────────────────────────────────
-- #17 · One-off / quick jobs (bez cleanings without a client record)
--
-- Kept intentionally minimal per the PDF: "staff member + date + short
-- description + hours = done". Invoiced manually by Priya's team — no
-- Lexware integration path.
--
-- Not modelled as a shift because shifts require property_id; one-off jobs
-- have no property. Storing separately keeps the shifts table clean and
-- lets the schedule union both sources when rendering a week view.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.one_off_jobs (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  employee_id   uuid not null references public.employees(id)     on delete restrict,
  performed_on  date not null,
  description   text not null,
  hours         numeric(5,2) not null check (hours > 0 and hours <= 24),
  invoice_note  text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists idx_one_off_jobs_org_date
  on public.one_off_jobs (org_id, performed_on desc)
  where deleted_at is null;
create index if not exists idx_one_off_jobs_employee
  on public.one_off_jobs (employee_id, performed_on desc)
  where deleted_at is null;

drop trigger if exists trg_one_off_jobs_updated on public.one_off_jobs;
create trigger trg_one_off_jobs_updated
  before update on public.one_off_jobs
  for each row execute function public.set_updated_at();

alter table public.one_off_jobs enable row level security;

-- Same four-policy pattern as the rest of the domain, InitPlan-wrapped
-- consistently with 20260917_000060_rls_initplan_wrap.sql.
drop policy if exists "one_off_jobs:read org"        on public.one_off_jobs;
drop policy if exists "one_off_jobs:write dispatcher" on public.one_off_jobs;
drop policy if exists "one_off_jobs:update dispatcher" on public.one_off_jobs;
drop policy if exists "one_off_jobs:delete admin"    on public.one_off_jobs;

create policy "one_off_jobs:read org" on public.one_off_jobs for select
  using (org_id = (select public.current_org_id()));

create policy "one_off_jobs:write dispatcher" on public.one_off_jobs for insert
  with check (
    org_id = (select public.current_org_id())
    and (select public.is_dispatcher_or_admin())
  );

create policy "one_off_jobs:update dispatcher" on public.one_off_jobs for update
  using (
    org_id = (select public.current_org_id())
    and (select public.is_dispatcher_or_admin())
  )
  with check (
    org_id = (select public.current_org_id())
    and (select public.is_dispatcher_or_admin())
  );

create policy "one_off_jobs:delete admin" on public.one_off_jobs for delete
  using (
    org_id = (select public.current_org_id())
    and (select public.is_admin())
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- #18 · Cleaning-supplies flags
--
-- Field staff mark on the mobile app whether the customer has supplies.
-- If not, they add a note listing what needs to be ordered/brought. The
-- project manager sees these on the customer profile.
--
-- One row per flag event so history is preserved; the customer profile
-- shows the newest unresolved flag.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.supply_flags (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations(id) on delete restrict,
  client_id    uuid not null references public.clients(id)       on delete cascade,
  property_id  uuid references public.properties(id)             on delete set null,
  shift_id     uuid references public.shifts(id)                 on delete set null,
  reported_by  uuid references public.profiles(id)               on delete set null,
  supplies_ok  boolean not null,           -- true = "yes, present"; false = "no, missing"
  note         text,                       -- required client-side when supplies_ok = false
  resolved     boolean not null default false,
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists idx_supply_flags_client_created
  on public.supply_flags (client_id, created_at desc)
  where deleted_at is null;
create index if not exists idx_supply_flags_org_unresolved
  on public.supply_flags (org_id, created_at desc)
  where deleted_at is null and resolved = false and supplies_ok = false;

drop trigger if exists trg_supply_flags_updated on public.supply_flags;
create trigger trg_supply_flags_updated
  before update on public.supply_flags
  for each row execute function public.set_updated_at();

alter table public.supply_flags enable row level security;

drop policy if exists "supply_flags:read org"        on public.supply_flags;
drop policy if exists "supply_flags:write staff"     on public.supply_flags;
drop policy if exists "supply_flags:update dispatcher" on public.supply_flags;
drop policy if exists "supply_flags:delete admin"    on public.supply_flags;

create policy "supply_flags:read org" on public.supply_flags for select
  using (org_id = (select public.current_org_id()));

-- Field staff need to file these themselves (unlike clients/employees which
-- require dispatcher+). Any signed-in org member can insert; the caller
-- must supply reported_by = auth.uid() (enforced by the client / server
-- action wrapper).
create policy "supply_flags:write staff" on public.supply_flags for insert
  with check (org_id = (select public.current_org_id()));

create policy "supply_flags:update dispatcher" on public.supply_flags for update
  using (
    org_id = (select public.current_org_id())
    and (select public.is_dispatcher_or_admin())
  )
  with check (
    org_id = (select public.current_org_id())
    and (select public.is_dispatcher_or_admin())
  );

create policy "supply_flags:delete admin" on public.supply_flags for delete
  using (
    org_id = (select public.current_org_id())
    and (select public.is_admin())
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- #19 · PM dashboard widget — files & notes
--
-- Per-user working folder for admins + dispatchers. Files land in a new
-- `pm-files` storage bucket; notes are a separate rows-per-note table so
-- history is preserved.
--
-- Scope: private to the OWNER (not shared org-wide), because the PDF
-- describes it as "personal working folder". The RLS uses `owner_id =
-- auth.uid()` — the only place in this repo (aside from profile self-
-- update and chat DMs) where per-user scoping matters more than org-wide.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.pm_notes (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references public.organizations(id) on delete restrict,
  owner_id   uuid not null references public.profiles(id)      on delete cascade,
  title      text,
  body       text not null,
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_pm_notes_owner_pinned
  on public.pm_notes (owner_id, pinned desc, updated_at desc)
  where deleted_at is null;

drop trigger if exists trg_pm_notes_updated on public.pm_notes;
create trigger trg_pm_notes_updated
  before update on public.pm_notes
  for each row execute function public.set_updated_at();

alter table public.pm_notes enable row level security;

drop policy if exists "pm_notes:read own"   on public.pm_notes;
drop policy if exists "pm_notes:write own"  on public.pm_notes;
drop policy if exists "pm_notes:update own" on public.pm_notes;
drop policy if exists "pm_notes:delete own" on public.pm_notes;

create policy "pm_notes:read own" on public.pm_notes for select
  using (owner_id = (select auth.uid()));

create policy "pm_notes:write own" on public.pm_notes for insert
  with check (
    owner_id = (select auth.uid())
    and org_id = (select public.current_org_id())
    and (select public.is_dispatcher_or_admin())
  );

create policy "pm_notes:update own" on public.pm_notes for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "pm_notes:delete own" on public.pm_notes for delete
  using (owner_id = (select auth.uid()));


create table if not exists public.pm_files (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations(id) on delete restrict,
  owner_id     uuid not null references public.profiles(id)      on delete cascade,
  name         text not null,
  storage_path text not null,             -- <owner_id>/<uuid>.<ext>
  mime_type    text,
  size_bytes   bigint check (size_bytes >= 0),
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists idx_pm_files_owner_pinned
  on public.pm_files (owner_id, pinned desc, created_at desc)
  where deleted_at is null;

alter table public.pm_files enable row level security;

drop policy if exists "pm_files:read own"   on public.pm_files;
drop policy if exists "pm_files:write own"  on public.pm_files;
drop policy if exists "pm_files:update own" on public.pm_files;
drop policy if exists "pm_files:delete own" on public.pm_files;

create policy "pm_files:read own" on public.pm_files for select
  using (owner_id = (select auth.uid()));

create policy "pm_files:write own" on public.pm_files for insert
  with check (
    owner_id = (select auth.uid())
    and org_id = (select public.current_org_id())
    and (select public.is_dispatcher_or_admin())
  );

create policy "pm_files:update own" on public.pm_files for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "pm_files:delete own" on public.pm_files for delete
  using (owner_id = (select auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────────
-- #19 (bucket) · pm-files storage bucket
--
-- Private, 25 MB per file, PDF + images + Office docs — same MIME
-- allowlist as client-documents.
--
-- Path convention: <owner_id>/<uuid>.<ext>
-- so RLS can slice by the leading path segment.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pm-files',
  'pm-files',
  false,
  26214400,                    -- 25 MB
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;

-- Storage RLS: owner-only. The leading path segment is the owner's uuid,
-- which is what we compare against auth.uid().
drop policy if exists "pm_files_storage:read own"   on storage.objects;
drop policy if exists "pm_files_storage:write own"  on storage.objects;
drop policy if exists "pm_files_storage:delete own" on storage.objects;

create policy "pm_files_storage:read own" on storage.objects for select
  using (
    bucket_id = 'pm-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "pm_files_storage:write own" on storage.objects for insert
  with check (
    bucket_id = 'pm-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_dispatcher_or_admin())
  );

create policy "pm_files_storage:delete own" on storage.objects for delete
  using (
    bucket_id = 'pm-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

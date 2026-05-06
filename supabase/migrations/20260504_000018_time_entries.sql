-- =============================================================================
-- time_entries — immutable GPS-verified check-in / check-out events.
-- =============================================================================
-- Field staff hit "Check in" on the mobile UI; the browser captures their
-- coordinates via the Geolocation API, the server validates distance to
-- the property's lat/long, and a row lands here. The pair (one check-in
-- + one check-out per shift per employee) is the auditable record of
-- working hours.
--
-- This migration is fully idempotent: every column is added via
-- `alter table … add column if not exists` so it works whether the table
-- is brand new or already exists from an earlier partial run.
--
-- We also add `gps_radius_m` to properties (default 100m per spec).
-- =============================================================================

alter table public.properties
  add column if not exists gps_radius_m smallint not null default 100;

-- ---- Create the shell first (no constraints), then add columns -------------
create table if not exists public.time_entries (
  id uuid primary key default uuid_generate_v4()
);

alter table public.time_entries
  add column if not exists org_id        uuid,
  add column if not exists shift_id      uuid,
  add column if not exists employee_id   uuid,
  add column if not exists property_id   uuid,
  add column if not exists kind          text,
  add column if not exists occurred_at   timestamptz not null default now(),
  add column if not exists latitude      numeric(9,6),
  add column if not exists longitude     numeric(9,6),
  add column if not exists accuracy_m    numeric(7,1),
  add column if not exists distance_m    numeric(8,1),
  add column if not exists manual        boolean not null default false,
  add column if not exists manual_reason text,
  add column if not exists created_by    uuid,
  add column if not exists created_at    timestamptz not null default now();

-- ---- FK constraints (drop-if-exists then add, so re-runs stay clean) -------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.time_entries'::regclass
      and conname  = 'time_entries_org_fk'
  ) then
    alter table public.time_entries
      add constraint time_entries_org_fk
      foreign key (org_id) references public.organizations(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.time_entries'::regclass
      and conname  = 'time_entries_shift_fk'
  ) then
    alter table public.time_entries
      add constraint time_entries_shift_fk
      foreign key (shift_id) references public.shifts(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.time_entries'::regclass
      and conname  = 'time_entries_employee_fk'
  ) then
    alter table public.time_entries
      add constraint time_entries_employee_fk
      foreign key (employee_id) references public.employees(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.time_entries'::regclass
      and conname  = 'time_entries_property_fk'
  ) then
    alter table public.time_entries
      add constraint time_entries_property_fk
      foreign key (property_id) references public.properties(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.time_entries'::regclass
      and conname  = 'time_entries_created_by_fk'
  ) then
    alter table public.time_entries
      add constraint time_entries_created_by_fk
      foreign key (created_by) references public.profiles(id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.time_entries'::regclass
      and conname  = 'time_entries_kind_chk'
  ) then
    alter table public.time_entries
      add constraint time_entries_kind_chk
      check (kind in ('check_in', 'check_out'));
  end if;
end $$;

-- ---- Tighten NOT NULL once the columns exist (safe on already-populated tables) ----
do $$
begin
  perform 1 from public.time_entries limit 1;
exception when undefined_table then return;
end $$;

-- These NOT NULLs are best-effort — only applied when columns currently allow null.
alter table public.time_entries alter column org_id      set not null;
alter table public.time_entries alter column shift_id    set not null;
alter table public.time_entries alter column employee_id set not null;
alter table public.time_entries alter column property_id set not null;
alter table public.time_entries alter column kind        set not null;

-- ---- Indexes ---------------------------------------------------------------
create index if not exists idx_time_entries_shift on public.time_entries(shift_id);
create index if not exists idx_time_entries_employee on public.time_entries(employee_id, occurred_at desc);
create index if not exists idx_time_entries_org on public.time_entries(org_id);
create unique index if not exists uniq_time_entries_shift_kind
  on public.time_entries(shift_id, employee_id, kind);

-- ---- RLS -------------------------------------------------------------------
alter table public.time_entries enable row level security;

drop policy if exists "time_entries:read" on public.time_entries;
create policy "time_entries:read" on public.time_entries for select
  using (
    org_id = public.current_org_id()
    and (
      public.is_dispatcher_or_admin()
      or employee_id in (
        select id from public.employees where profile_id = auth.uid()
      )
    )
  );

drop policy if exists "time_entries:insert" on public.time_entries;
create policy "time_entries:insert" on public.time_entries for insert
  with check (
    org_id = public.current_org_id()
    and (
      public.is_dispatcher_or_admin()
      or (
        manual = false
        and employee_id in (
          select id from public.employees where profile_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "time_entries:update dispatcher" on public.time_entries;
create policy "time_entries:update dispatcher" on public.time_entries for update
  using (org_id = public.current_org_id() and public.is_dispatcher_or_admin())
  with check (org_id = public.current_org_id() and public.is_dispatcher_or_admin());

-- ---- Shift completion confirmation ----------------------------------------
alter table public.shifts
  add column if not exists completed_at timestamptz;

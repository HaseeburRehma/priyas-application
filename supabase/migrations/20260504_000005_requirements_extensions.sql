-- =============================================================================
-- 20260504_000005_requirements_extensions.sql
-- Adds tables and triggers required by the Requirements Specification doc:
--   * contracts (notice periods, durations) — §4.1
--   * service_scopes (cleaning types, frequency) — §4.1
--   * property_keys (key holders) — §4.2
--   * vacation_requests — §4.8
--   * training_modules + employee_training_progress — §4.9
--   * damage_reports — §4.5
--   * client_signatures (digital signature on tablet) — §4.10
--   * auto-create a property-specific chat channel on property insert — §4.6
--
-- Idempotent. Safe to re-run.
-- =============================================================================

-- 4.1 Contracts -------------------------------------------------------------
create table if not exists public.contracts (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  client_id       uuid not null references public.clients(id) on delete cascade,
  start_date      date not null,
  end_date        date,
  notice_period_days integer not null default 90,
  legal_form      text,
  status          text not null default 'active' check (status in ('draft','active','terminated')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists idx_contracts_client on public.contracts(client_id) where deleted_at is null;
create index if not exists idx_contracts_org on public.contracts(org_id) where deleted_at is null;
drop trigger if exists trg_contracts_updated on public.contracts;
create trigger trg_contracts_updated before update on public.contracts
  for each row execute function public.set_updated_at();

-- 4.1 Service scopes (what + how often) ------------------------------------
create table if not exists public.service_scopes (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  client_id   uuid not null references public.clients(id) on delete cascade,
  service_type text not null,           -- e.g. 'maintenance_cleaning'
  frequency   text not null,            -- e.g. 'weekly', 'biweekly', 'monthly'
  special_notes text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_scopes_client on public.service_scopes(client_id);

-- 4.2 Property keys / key holders ------------------------------------------
create table if not exists public.property_keys (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  key_label   text not null,
  issued_at   date not null default current_date,
  returned_at date,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_keys_property on public.property_keys(property_id);
create index if not exists idx_keys_employee on public.property_keys(employee_id) where returned_at is null;

-- 4.8 Vacation requests -----------------------------------------------------
do $$ begin
  create type public.vacation_status as enum ('pending','approved','rejected','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.vacation_requests (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  start_date    date not null,
  end_date      date not null check (end_date >= start_date),
  days          numeric(4,1) not null,
  reason        text,
  status        public.vacation_status not null default 'pending',
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  reviewer_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_vac_emp_date on public.vacation_requests(employee_id, start_date);
create index if not exists idx_vac_status on public.vacation_requests(org_id, status);
drop trigger if exists trg_vac_updated on public.vacation_requests;
create trigger trg_vac_updated before update on public.vacation_requests
  for each row execute function public.set_updated_at();

-- 4.9 Training modules + per-employee progress -----------------------------
create table if not exists public.training_modules (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  title         text not null,
  description   text,
  video_url     text,                  -- e.g. signed Supabase Storage URL
  is_mandatory  boolean not null default false,
  position      smallint not null default 0,
  locale        text not null default 'de',
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_train_org on public.training_modules(org_id) where deleted_at is null;
drop trigger if exists trg_train_updated on public.training_modules;
create trigger trg_train_updated before update on public.training_modules
  for each row execute function public.set_updated_at();

create table if not exists public.employee_training_progress (
  employee_id   uuid not null references public.employees(id) on delete cascade,
  module_id     uuid not null references public.training_modules(id) on delete cascade,
  org_id        uuid not null references public.organizations(id) on delete restrict,
  started_at    timestamptz,
  completed_at  timestamptz,
  signature_path text,                 -- digital sign-off after onboarding
  primary key (employee_id, module_id)
);

-- 4.5 Damage reports --------------------------------------------------------
create table if not exists public.damage_reports (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  property_id   uuid not null references public.properties(id) on delete restrict,
  shift_id      uuid references public.shifts(id) on delete set null,
  employee_id   uuid references public.employees(id) on delete set null,
  severity      smallint not null check (severity between 1 and 5),
  category      text not null check (category in ('normal','note','problem','damage')),
  description   text not null,
  photo_paths   text[] not null default '{}',
  resolved      boolean not null default false,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_damage_property on public.damage_reports(property_id, created_at desc);

-- 4.10 Client signatures (digital signature on tablet) ---------------------
create table if not exists public.client_signatures (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  client_id   uuid not null references public.clients(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  context     text not null,           -- 'onboarding', 'contract', 'damage_acknowledgement'
  signature_svg text not null,         -- raw SVG path data
  signed_by_name text not null,
  signed_at   timestamptz not null default now(),
  ip_address  inet,
  user_agent  text
);
create index if not exists idx_sig_client on public.client_signatures(client_id, signed_at desc);

-- 4.6 Auto-create a chat channel for every property -----------------------
create or replace function public.create_property_chat_channel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.chat_channels (org_id, name, is_direct, created_by)
  values (new.org_id, '#prop-' || left(new.name, 60), false, null);
  return new;
end $$;

drop trigger if exists trg_property_channel on public.properties;
create trigger trg_property_channel
  after insert on public.properties
  for each row execute function public.create_property_chat_channel();

-- =============================================================================
-- RLS — same canonical pattern as 000002.
-- =============================================================================
alter table public.contracts                    enable row level security;
alter table public.service_scopes               enable row level security;
alter table public.property_keys                enable row level security;
alter table public.vacation_requests            enable row level security;
alter table public.training_modules             enable row level security;
alter table public.employee_training_progress   enable row level security;
alter table public.damage_reports               enable row level security;
alter table public.client_signatures            enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'contracts','service_scopes','property_keys','training_modules',
    'damage_reports','client_signatures'
  ]
  loop
    execute format('drop policy if exists "%I:read org" on public.%I', t, t);
    execute format($p$ create policy "%I:read org" on public.%I for select
      using (org_id = public.current_org_id()) $p$, t, t);

    execute format('drop policy if exists "%I:write dispatcher" on public.%I', t, t);
    execute format($p$ create policy "%I:write dispatcher" on public.%I for insert
      with check (org_id = public.current_org_id() and public.is_dispatcher_or_admin()) $p$, t, t);

    execute format('drop policy if exists "%I:update dispatcher" on public.%I', t, t);
    execute format($p$ create policy "%I:update dispatcher" on public.%I for update
      using (org_id = public.current_org_id() and public.is_dispatcher_or_admin())
      with check (org_id = public.current_org_id() and public.is_dispatcher_or_admin()) $p$, t, t);

    execute format('drop policy if exists "%I:delete admin" on public.%I', t, t);
    execute format($p$ create policy "%I:delete admin" on public.%I for delete
      using (org_id = public.current_org_id() and public.is_admin()) $p$, t, t);
  end loop;
end $$;

-- Vacation requests: employees see their own; dispatchers see all in org.
drop policy if exists "vac:read self or dispatcher" on public.vacation_requests;
create policy "vac:read self or dispatcher" on public.vacation_requests for select
  using (
    org_id = public.current_org_id()
    and (
      public.is_dispatcher_or_admin()
      or employee_id in (select id from public.employees where profile_id = auth.uid())
    )
  );

drop policy if exists "vac:insert self" on public.vacation_requests;
create policy "vac:insert self" on public.vacation_requests for insert
  with check (
    org_id = public.current_org_id()
    and (
      public.is_dispatcher_or_admin()
      or employee_id in (select id from public.employees where profile_id = auth.uid())
    )
  );

drop policy if exists "vac:update dispatcher" on public.vacation_requests;
create policy "vac:update dispatcher" on public.vacation_requests for update
  using (org_id = public.current_org_id() and public.is_dispatcher_or_admin())
  with check (org_id = public.current_org_id() and public.is_dispatcher_or_admin());

-- Training progress: employees see/edit their own; dispatchers see all.
drop policy if exists "train_progress:read" on public.employee_training_progress;
create policy "train_progress:read" on public.employee_training_progress for select
  using (
    org_id = public.current_org_id()
    and (
      public.is_dispatcher_or_admin()
      or employee_id in (select id from public.employees where profile_id = auth.uid())
    )
  );

drop policy if exists "train_progress:upsert self" on public.employee_training_progress;
create policy "train_progress:upsert self" on public.employee_training_progress for insert
  with check (
    org_id = public.current_org_id()
    and employee_id in (select id from public.employees where profile_id = auth.uid())
  );
create policy "train_progress:update self" on public.employee_training_progress for update
  using (
    org_id = public.current_org_id()
    and employee_id in (select id from public.employees where profile_id = auth.uid())
  )
  with check (
    org_id = public.current_org_id()
    and employee_id in (select id from public.employees where profile_id = auth.uid())
  );

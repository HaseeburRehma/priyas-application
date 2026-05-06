-- =============================================================================
-- 20260504_000002_domain.sql
-- Domain tables: clients, properties, employees, shifts, time entries,
-- invoices, statements, settings, notifications, chat, and reports.
-- Idempotent: safe to re-run.
-- =============================================================================

-- Reusable update trigger function exists from foundation migration.

-- Clients ---------------------------------------------------------------------
create table if not exists public.clients (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  customer_type   public.customer_type not null,
  display_name    text not null,
  contact_name    text,
  email           text,
  phone           text,
  tax_id          text,
  -- Alltagshilfe-specific (German healthcare insurance) -----------------------
  insurance_provider  text,
  insurance_number    text,
  care_level          smallint check (care_level between 1 and 5),
  notes               text,
  archived            boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists idx_clients_org on public.clients(org_id) where deleted_at is null;
create index if not exists idx_clients_type on public.clients(org_id, customer_type) where deleted_at is null;
create index if not exists idx_clients_search on public.clients using gin (to_tsvector('simple', coalesce(display_name,'') || ' ' || coalesce(contact_name,'') || ' ' || coalesce(email,'')));

drop trigger if exists trg_clients_updated on public.clients;
create trigger trg_clients_updated before update on public.clients
  for each row execute function public.set_updated_at();

-- Properties ------------------------------------------------------------------
create table if not exists public.properties (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  client_id     uuid not null references public.clients(id) on delete cascade,
  name          text not null,
  address_line1 text not null,
  address_line2 text,
  postal_code   text not null,
  city          text not null,
  country       text not null default 'DE',
  size_sqm      numeric(8,2),
  notes         text,
  -- For GPS-verified check-in. Stored as plain numerics; PostGIS optional.
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_props_org on public.properties(org_id) where deleted_at is null;
create index if not exists idx_props_client on public.properties(client_id) where deleted_at is null;

drop trigger if exists trg_props_updated on public.properties;
create trigger trg_props_updated before update on public.properties
  for each row execute function public.set_updated_at();

-- Property photos -------------------------------------------------------------
create table if not exists public.property_photos (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_path text not null,
  caption     text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_propphotos_property on public.property_photos(property_id);

-- Employees -------------------------------------------------------------------
create table if not exists public.employees (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  profile_id    uuid unique references public.profiles(id) on delete set null,
  full_name     text not null,
  email         text,
  phone         text,
  hire_date     date,
  hourly_rate_eur numeric(8,2),
  weekly_hours  numeric(5,2),
  status        text not null default 'active' check (status in ('active','on_leave','inactive')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_emp_org on public.employees(org_id) where deleted_at is null;
create index if not exists idx_emp_status on public.employees(org_id, status) where deleted_at is null;

drop trigger if exists trg_emp_updated on public.employees;
create trigger trg_emp_updated before update on public.employees
  for each row execute function public.set_updated_at();

-- Employee documents (contracts, certifications) -----------------------------
create table if not exists public.employee_documents (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  doc_type      text not null,
  storage_path  text not null,
  expires_at    date,
  created_at    timestamptz not null default now()
);
create index if not exists idx_empdocs_emp on public.employee_documents(employee_id);

-- Shifts ----------------------------------------------------------------------
create table if not exists public.shifts (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  property_id   uuid not null references public.properties(id) on delete restrict,
  employee_id   uuid references public.employees(id) on delete set null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null check (ends_at > starts_at),
  status        public.shift_status not null default 'scheduled',
  notes         text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_shifts_org_time on public.shifts(org_id, starts_at) where deleted_at is null;
create index if not exists idx_shifts_employee on public.shifts(employee_id, starts_at) where deleted_at is null;
create index if not exists idx_shifts_property on public.shifts(property_id, starts_at) where deleted_at is null;

drop trigger if exists trg_shifts_updated on public.shifts;
create trigger trg_shifts_updated before update on public.shifts
  for each row execute function public.set_updated_at();

-- Time entries (actual check-in / check-out) ---------------------------------
create table if not exists public.time_entries (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  shift_id      uuid not null references public.shifts(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete restrict,
  check_in_at   timestamptz not null,
  check_out_at  timestamptz,
  check_in_lat  numeric(9,6),
  check_in_lng  numeric(9,6),
  check_out_lat numeric(9,6),
  check_out_lng numeric(9,6),
  break_minutes integer not null default 0 check (break_minutes >= 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_te_shift on public.time_entries(shift_id);
create index if not exists idx_te_employee on public.time_entries(employee_id, check_in_at desc);

drop trigger if exists trg_te_updated on public.time_entries;
create trigger trg_te_updated before update on public.time_entries
  for each row execute function public.set_updated_at();

-- Invoices --------------------------------------------------------------------
create table if not exists public.invoices (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  client_id       uuid not null references public.clients(id) on delete restrict,
  invoice_number  text not null,
  status          public.invoice_status not null default 'draft',
  issue_date      date not null default current_date,
  due_date        date,
  subtotal_cents  bigint not null default 0,
  tax_cents       bigint not null default 0,
  total_cents     bigint not null default 0,
  paid_at         timestamptz,
  pdf_path        text,
  lexware_id      text, -- foreign id when synced
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (org_id, invoice_number)
);
create index if not exists idx_inv_org_status on public.invoices(org_id, status) where deleted_at is null;
create index if not exists idx_inv_client on public.invoices(client_id) where deleted_at is null;

drop trigger if exists trg_inv_updated on public.invoices;
create trigger trg_inv_updated before update on public.invoices
  for each row execute function public.set_updated_at();

-- Invoice items ---------------------------------------------------------------
create table if not exists public.invoice_items (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations(id) on delete restrict,
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  description     text not null,
  quantity        numeric(10,2) not null default 1,
  unit_price_cents bigint not null,
  tax_rate        numeric(5,2) not null default 19.00,
  position        smallint not null default 0,
  shift_id        uuid references public.shifts(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_invitems_invoice on public.invoice_items(invoice_id);

-- Client statements -----------------------------------------------------------
create table if not exists public.client_statements (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  client_id   uuid not null references public.clients(id) on delete cascade,
  period_start date not null,
  period_end  date not null,
  pdf_path    text,
  total_cents bigint not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_stmt_client on public.client_statements(client_id, period_end desc);

-- Settings (org-level k/v) ---------------------------------------------------
create table if not exists public.settings (
  org_id      uuid primary key references public.organizations(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_settings_updated on public.settings;
create trigger trg_settings_updated before update on public.settings
  for each row execute function public.set_updated_at();

-- Notifications ---------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations(id) on delete restrict,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  channel      public.notification_channel not null default 'in_app',
  category     text not null,
  title        text not null,
  body         text,
  link_url     text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_notif_user_unread on public.notifications(user_id, created_at desc) where read_at is null;

-- Chat ------------------------------------------------------------------------
create table if not exists public.chat_channels (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  name        text not null,
  is_direct   boolean not null default false,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_chan_org on public.chat_channels(org_id);

create table if not exists public.chat_members (
  channel_id   uuid not null references public.chat_channels(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (channel_id, user_id)
);

create table if not exists public.chat_messages (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  channel_id  uuid not null references public.chat_channels(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete restrict,
  body        text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  deleted_at  timestamptz
);
create index if not exists idx_msgs_channel_created on public.chat_messages(channel_id, created_at desc) where deleted_at is null;

-- Reports (saved/scheduled report definitions + outputs) ---------------------
create table if not exists public.reports (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  name        text not null,
  kind        text not null, -- 'revenue', 'hours', 'alltagshilfe', etc.
  params      jsonb not null default '{}'::jsonb,
  pdf_path    text,
  csv_path    text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_reports_org on public.reports(org_id, created_at desc);

-- =============================================================================
-- RLS — every table is org-scoped via current_org_id().
-- Pattern: members can read; dispatcher/admin can write; admin can delete.
-- =============================================================================
alter table public.clients              enable row level security;
alter table public.properties           enable row level security;
alter table public.property_photos      enable row level security;
alter table public.employees            enable row level security;
alter table public.employee_documents   enable row level security;
alter table public.shifts               enable row level security;
alter table public.time_entries         enable row level security;
alter table public.invoices             enable row level security;
alter table public.invoice_items        enable row level security;
alter table public.client_statements    enable row level security;
alter table public.settings             enable row level security;
alter table public.notifications        enable row level security;
alter table public.chat_channels        enable row level security;
alter table public.chat_members         enable row level security;
alter table public.chat_messages        enable row level security;
alter table public.reports              enable row level security;

-- Helper to apply the canonical "org-scoped read + dispatcher-write" policy set.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients','properties','property_photos','employees','employee_documents',
    'shifts','time_entries','invoices','invoice_items','client_statements',
    'settings','reports'
  ]
  loop
    execute format('drop policy if exists "%I:read org" on public.%I', t, t);
    execute format($p$
      create policy "%I:read org" on public.%I for select
      using (org_id = public.current_org_id())
    $p$, t, t);

    execute format('drop policy if exists "%I:write dispatcher" on public.%I', t, t);
    execute format($p$
      create policy "%I:write dispatcher" on public.%I for insert
      with check (org_id = public.current_org_id() and public.is_dispatcher_or_admin())
    $p$, t, t);

    execute format('drop policy if exists "%I:update dispatcher" on public.%I', t, t);
    execute format($p$
      create policy "%I:update dispatcher" on public.%I for update
      using (org_id = public.current_org_id() and public.is_dispatcher_or_admin())
      with check (org_id = public.current_org_id() and public.is_dispatcher_or_admin())
    $p$, t, t);

    execute format('drop policy if exists "%I:delete admin" on public.%I', t, t);
    execute format($p$
      create policy "%I:delete admin" on public.%I for delete
      using (org_id = public.current_org_id() and public.is_admin())
    $p$, t, t);
  end loop;
end $$;

-- Notifications: only the addressee can read; dispatcher/admin can insert.
drop policy if exists "notif:read own" on public.notifications;
create policy "notif:read own" on public.notifications for select
  using (org_id = public.current_org_id() and user_id = auth.uid());

drop policy if exists "notif:update own" on public.notifications;
create policy "notif:update own" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notif:write dispatcher" on public.notifications;
create policy "notif:write dispatcher" on public.notifications for insert
  with check (org_id = public.current_org_id() and public.is_dispatcher_or_admin());

-- Chat: members of a channel can read/write; admins can manage.
drop policy if exists "chan:read members" on public.chat_channels;
create policy "chan:read members" on public.chat_channels for select
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.chat_members m
      where m.channel_id = chat_channels.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "chan:write admin" on public.chat_channels;
create policy "chan:write admin" on public.chat_channels for all
  using (org_id = public.current_org_id() and public.is_dispatcher_or_admin())
  with check (org_id = public.current_org_id() and public.is_dispatcher_or_admin());

drop policy if exists "members:read self" on public.chat_members;
create policy "members:read self" on public.chat_members for select
  using (user_id = auth.uid());

drop policy if exists "members:admin manage" on public.chat_members;
create policy "members:admin manage" on public.chat_members for all
  using (public.is_dispatcher_or_admin())
  with check (public.is_dispatcher_or_admin());

drop policy if exists "msg:read members" on public.chat_messages;
create policy "msg:read members" on public.chat_messages for select
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.chat_members m
      where m.channel_id = chat_messages.channel_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "msg:write members" on public.chat_messages;
create policy "msg:write members" on public.chat_messages for insert
  with check (
    org_id = public.current_org_id()
    and user_id = auth.uid()
    and exists (
      select 1 from public.chat_members m
      where m.channel_id = chat_messages.channel_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "msg:edit own" on public.chat_messages;
create policy "msg:edit own" on public.chat_messages for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

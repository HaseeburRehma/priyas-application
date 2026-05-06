-- =============================================================================
-- §4.1 — multi-contact support for clients (1:n).
-- =============================================================================
-- The spec requires "Contact persons: name, phone, email, role" with multiple
-- contacts per client. We had a single `contact_name` text column on `clients`
-- which only fit one. This migration adds a proper child table and keeps the
-- old column around as a "primary contact name" cache for the list view.
-- =============================================================================

create table if not exists public.client_contacts (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  full_name   text not null,
  role        text,                 -- e.g. 'manager', 'janitor', 'tenant'
  email       text,
  phone       text,
  is_primary  boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_client_contacts_client on public.client_contacts(client_id);
create index if not exists idx_client_contacts_org on public.client_contacts(org_id);

-- Ensure at most one primary per client (Postgres lets us do this with a
-- partial unique index — only enforced where is_primary is true).
create unique index if not exists uniq_client_primary_contact
  on public.client_contacts(client_id) where is_primary;

drop trigger if exists trg_client_contacts_updated on public.client_contacts;
create trigger trg_client_contacts_updated before update on public.client_contacts
  for each row execute function public.set_updated_at();

alter table public.client_contacts enable row level security;

drop policy if exists "client_contacts:read org" on public.client_contacts;
create policy "client_contacts:read org" on public.client_contacts for select
  using (org_id = public.current_org_id());

drop policy if exists "client_contacts:write dispatcher" on public.client_contacts;
create policy "client_contacts:write dispatcher" on public.client_contacts for insert
  with check (org_id = public.current_org_id() and public.is_dispatcher_or_admin());

drop policy if exists "client_contacts:update dispatcher" on public.client_contacts;
create policy "client_contacts:update dispatcher" on public.client_contacts for update
  using (org_id = public.current_org_id() and public.is_dispatcher_or_admin())
  with check (org_id = public.current_org_id() and public.is_dispatcher_or_admin());

drop policy if exists "client_contacts:delete admin" on public.client_contacts;
create policy "client_contacts:delete admin" on public.client_contacts for delete
  using (org_id = public.current_org_id() and public.is_admin());

-- Backfill: if a client has a non-null `contact_name`, seed a primary contact.
insert into public.client_contacts (org_id, client_id, full_name, email, phone, is_primary)
select org_id, id, contact_name, email, phone, true
from public.clients
where contact_name is not null
  and not exists (
    select 1 from public.client_contacts c where c.client_id = clients.id
  );

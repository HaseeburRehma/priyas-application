-- =============================================================================
-- Property metadata expansion: floor / building section / access code
-- + structured safety/access notes + closure calendar.
-- =============================================================================

-- ---- Structured location columns -------------------------------------------
alter table public.properties
  add column if not exists floor              text,
  add column if not exists building_section   text,
  add column if not exists access_code        text;

-- ---- Structured safety + access notes --------------------------------------
-- Old `notes` stays as a "free text catch-all"; these three columns
-- separate the legally / operationally important categories.
alter table public.properties
  add column if not exists allergies         text,
  add column if not exists restricted_areas  text,
  add column if not exists safety_regulations text;

-- ---- Closure calendar (holidays, planned closures, no-cleaning days) ------
create table if not exists public.property_closures (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  reason      text not null,           -- e.g. 'public_holiday', 'tenant_closed', 'renovation'
  notes       text,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  check (end_date >= start_date)
);
create index if not exists idx_property_closures_prop on public.property_closures(property_id, start_date);
create index if not exists idx_property_closures_org on public.property_closures(org_id);

alter table public.property_closures enable row level security;

drop policy if exists "property_closures:read org" on public.property_closures;
create policy "property_closures:read org" on public.property_closures for select
  using (org_id = public.current_org_id());

drop policy if exists "property_closures:write dispatcher" on public.property_closures;
create policy "property_closures:write dispatcher" on public.property_closures for insert
  with check (org_id = public.current_org_id() and public.is_dispatcher_or_admin());

drop policy if exists "property_closures:update dispatcher" on public.property_closures;
create policy "property_closures:update dispatcher" on public.property_closures for update
  using (org_id = public.current_org_id() and public.is_dispatcher_or_admin())
  with check (org_id = public.current_org_id() and public.is_dispatcher_or_admin());

drop policy if exists "property_closures:delete dispatcher" on public.property_closures;
create policy "property_closures:delete dispatcher" on public.property_closures for delete
  using (org_id = public.current_org_id() and public.is_dispatcher_or_admin());

-- ---- Cleaning concept PDF reference ---------------------------------------
alter table public.properties
  add column if not exists cleaning_concept_path text;

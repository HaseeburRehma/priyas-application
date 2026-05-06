-- =============================================================================
-- 20260504_000001_foundation.sql
-- Foundational types, organizations, profiles, helper functions and the
-- audit_log table. Idempotent: safe to re-run.
-- =============================================================================

-- Enable required extensions ---------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Enums ------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin', 'dispatcher', 'employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.customer_type as enum ('residential', 'alltagshilfe', 'commercial');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.shift_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_channel as enum ('in_app', 'email', 'whatsapp');
exception when duplicate_object then null; end $$;

-- Generic updated_at trigger ---------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Organizations ---------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  logo_url    text,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

drop trigger if exists trg_orgs_updated on public.organizations;
create trigger trg_orgs_updated before update on public.organizations
  for each row execute function public.set_updated_at();

-- Profiles (extends auth.users) -----------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  org_id       uuid not null references public.organizations(id) on delete restrict,
  role         public.user_role not null default 'employee',
  full_name    text not null,
  avatar_url   text,
  phone        text,
  locale       text not null default 'de',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_profiles_org on public.profiles(org_id) where deleted_at is null;
create index if not exists idx_profiles_role on public.profiles(role) where deleted_at is null;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Helper: which org does the current user belong to? --------------------------
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid() and deleted_at is null limit 1;
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and deleted_at is null limit 1;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_dispatcher_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() in ('admin','dispatcher'), false);
$$;

-- New auth user → blank profile (org assignment is handled at app level) ------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  -- If the signing-up user was given an org via raw_user_meta_data, honour it.
  v_org := nullif(new.raw_user_meta_data ->> 'org_id', '')::uuid;

  -- Otherwise we leave them unattached — the app must complete onboarding
  -- before granting access. RLS will refuse all reads until an org is set.
  if v_org is null then
    return new;
  end if;

  insert into public.profiles (id, org_id, full_name, role)
  values (
    new.id,
    v_org,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'employee')
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Audit log -------------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigserial primary key,
  org_id     uuid not null,
  user_id    uuid,
  action     text not null,
  table_name text not null,
  record_id  uuid,
  before     jsonb,
  after      jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_org_created on public.audit_log(org_id, created_at desc);
create index if not exists idx_audit_table_record on public.audit_log(table_name, record_id);

-- RLS: organizations & profiles -----------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.audit_log     enable row level security;

drop policy if exists "orgs: members can read own" on public.organizations;
create policy "orgs: members can read own"
  on public.organizations for select
  using (id = public.current_org_id());

drop policy if exists "orgs: admin can update own" on public.organizations;
create policy "orgs: admin can update own"
  on public.organizations for update
  using (id = public.current_org_id() and public.is_admin())
  with check (id = public.current_org_id() and public.is_admin());

drop policy if exists "profiles: members read same org" on public.profiles;
create policy "profiles: members read same org"
  on public.profiles for select
  using (org_id = public.current_org_id());

drop policy if exists "profiles: own update" on public.profiles;
create policy "profiles: own update"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles: admin all in org" on public.profiles;
create policy "profiles: admin all in org"
  on public.profiles for all
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());

drop policy if exists "audit: members read own org" on public.audit_log;
create policy "audit: members read own org"
  on public.audit_log for select
  using (org_id = public.current_org_id() and public.is_dispatcher_or_admin());

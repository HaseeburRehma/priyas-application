-- =============================================================================
-- Web Push subscriptions
-- =============================================================================
-- One row per browser/device per profile. The `endpoint` is unique because the
-- Push Service treats it as the address. We keep the keys here so the server
-- can sign payloads with the user's VAPID-derived shared secrets at send time.
-- =============================================================================

create table if not exists public.push_subscriptions (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_push_profile on public.push_subscriptions(profile_id);
create index if not exists idx_push_org on public.push_subscriptions(org_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push:read self" on public.push_subscriptions;
create policy "push:read self" on public.push_subscriptions for select
  using (profile_id = auth.uid());

drop policy if exists "push:insert self" on public.push_subscriptions;
create policy "push:insert self" on public.push_subscriptions for insert
  with check (
    profile_id = auth.uid() and org_id = public.current_org_id()
  );

drop policy if exists "push:update self" on public.push_subscriptions;
create policy "push:update self" on public.push_subscriptions for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "push:delete self" on public.push_subscriptions;
create policy "push:delete self" on public.push_subscriptions for delete
  using (profile_id = auth.uid());

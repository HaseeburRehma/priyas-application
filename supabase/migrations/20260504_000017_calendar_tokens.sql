-- =============================================================================
-- calendar_tokens — opaque tokens used by the iCal feed at /api/schedule/ical.
-- =============================================================================
-- Subscriptions in Apple/Google Calendar can't carry our session cookies,
-- so we issue an opaque per-user token and the feed handler matches the
-- token to the profile, then returns only that user's shifts.
-- =============================================================================

create table if not exists public.calendar_tokens (
  token       text primary key,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  label       text,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists idx_calendar_tokens_profile on public.calendar_tokens(profile_id);

alter table public.calendar_tokens enable row level security;

drop policy if exists "calendar_tokens:read self" on public.calendar_tokens;
create policy "calendar_tokens:read self" on public.calendar_tokens for select
  using (profile_id = auth.uid());

drop policy if exists "calendar_tokens:insert self" on public.calendar_tokens;
create policy "calendar_tokens:insert self" on public.calendar_tokens for insert
  with check (profile_id = auth.uid() and org_id = public.current_org_id());

drop policy if exists "calendar_tokens:delete self" on public.calendar_tokens;
create policy "calendar_tokens:delete self" on public.calendar_tokens for delete
  using (profile_id = auth.uid());

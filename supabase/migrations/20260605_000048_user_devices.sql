-- =============================================================================
-- 20260605_000048_user_devices.sql
--
-- Per-user device/session tracking so the Settings → Sessions & Devices
-- card can show a real list and revoke individual devices.
--
-- Supabase Auth's auth.sessions table is internal and not exposed to
-- application code. We mirror just enough into a public table:
--   • One row per (user_id, fingerprint).
--   • Fingerprint is derived server-side from User-Agent + a stable
--     per-session salt so two visits from the same browser collapse
--     to one row.
--   • `revoked_at` is set when the user clicks "Revoke" on that row.
--     Application code checks `revoked_at` on each authenticated
--     request and forces sign-out if it's set.
--
-- Falls back gracefully: if no rows exist for a user, the UI shows
-- only the current session (populated lazily on first call to the
-- `record-current-device` action from the dashboard layout).
-- =============================================================================

create table if not exists public.user_devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- Stable identifier per (user × browser-OS-fingerprint). Lets us
  -- upsert on each visit instead of inserting duplicates.
  fingerprint     text not null,

  -- Human-readable summary parsed from User-Agent on first sight.
  device_label    text not null,                   -- "MacBook Pro · Chrome 124"
  device_kind     text not null default 'desktop' check (device_kind in ('desktop', 'mobile', 'tablet', 'unknown')),
  os              text,                            -- "macOS 14.2", "iOS 17.2"
  browser         text,                            -- "Chrome 124", "Safari 17"

  -- Best-effort network details. IP comes from the X-Forwarded-For
  -- header on Vercel; geo is a string we hand-build in the action.
  ip_address      inet,
  geo_label       text,                            -- "Berlin, DE"

  -- Lifecycle.
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  revoked_at      timestamptz,                     -- null = still active
  revoked_by      uuid references auth.users(id),  -- self-revoke vs admin

  unique (user_id, fingerprint)
);

create index if not exists user_devices_user_active_idx
  on public.user_devices (user_id, last_seen_at desc)
  where revoked_at is null;

alter table public.user_devices enable row level security;

-- Users can only see and mutate their own devices. Admins do not need
-- cross-user visibility here (separate audit log surface handles that).
drop policy if exists "user_devices: select own" on public.user_devices;
create policy "user_devices: select own"
  on public.user_devices for select
  using (user_id = auth.uid());

drop policy if exists "user_devices: insert own" on public.user_devices;
create policy "user_devices: insert own"
  on public.user_devices for insert
  with check (user_id = auth.uid());

drop policy if exists "user_devices: update own" on public.user_devices;
create policy "user_devices: update own"
  on public.user_devices for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_devices: delete own" on public.user_devices;
create policy "user_devices: delete own"
  on public.user_devices for delete
  using (user_id = auth.uid());

comment on table public.user_devices is
  'Per-user device fingerprint store backing Settings → Sessions & Devices. Mirrors enough of auth.sessions to render a UI without exposing the internal table.';
comment on column public.user_devices.fingerprint is
  'Stable hash derived from User-Agent + a per-session salt. One row per (user, browser-OS-fingerprint).';
comment on column public.user_devices.revoked_at is
  'Set when the user clicks Revoke. Application code MUST refuse requests from a revoked device until the user signs in again.';

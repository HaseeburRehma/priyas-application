-- =============================================================================
-- 20260810_000057_expo_push_tokens.sql
--
-- Adds `expo_push_token` to user_devices so the mobile app can register
-- its Expo push token against the current session. The push-notification
-- fan-out (already emitted for new_client, new_shift, damage, vacation
-- events) then targets only devices with a non-null token.
--
-- The column is nullable — web sessions never populate it, and mobile
-- users who deny push permission likewise leave it null. That way one
-- codepath handles both surfaces without a UNION.
-- =============================================================================

alter table public.user_devices
  add column if not exists expo_push_token       text,
  add column if not exists platform              text
    check (platform is null or platform in ('ios', 'android', 'web')),
  add column if not exists app_version           text;

-- Partial index — the push-fan-out queries only rows with a live token.
create index if not exists user_devices_push_ready_idx
  on public.user_devices (user_id)
  where expo_push_token is not null and revoked_at is null;

comment on column public.user_devices.expo_push_token is
  'Expo push token registered by the mobile app on sign-in. NULL for web sessions and mobile users who declined push permission.';

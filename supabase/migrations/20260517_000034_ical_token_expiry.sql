-- =============================================================================
-- calendar_tokens — add expires_at so iCal subscription tokens can lapse.
-- =============================================================================
-- The original `calendar_tokens` table (migration 000017) issued tokens
-- with no expiry, so a token leaked to a personal device once stayed live
-- forever. We now stamp `expires_at` on creation (defaults to one year
-- from now in the action) and the `/api/schedule/ical` route rejects
-- expired tokens.
--
-- For backwards compatibility, NULL `expires_at` means "never expires" —
-- pre-existing tokens minted before this migration continue to work, but
-- the route logs a warning so we can spot them and rotate.
--
-- Idempotent: `add column if not exists`.
-- =============================================================================

alter table public.calendar_tokens
  add column if not exists expires_at timestamptz;

create index if not exists idx_calendar_tokens_expires
  on public.calendar_tokens (expires_at)
  where expires_at is not null;

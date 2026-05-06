-- =============================================================================
-- Vacation suggestions: managers can propose alternative dates instead of
-- approve/reject. The employee then accepts or counter-suggests.
-- =============================================================================
-- vacation_requests.status is a Postgres ENUM (`vacation_status`), so adding
-- a new state means extending the enum, not editing a CHECK constraint.
--
-- Note: ALTER TYPE … ADD VALUE cannot run inside an explicit BEGIN/COMMIT
-- block on older Postgres versions. If your migration runner wraps each
-- file in a transaction, run this file with `--single-transaction off` or
-- split the ALTER TYPE into its own connection. On Postgres 12+ used by
-- Supabase, ADD VALUE inside a transaction is supported.
-- =============================================================================

-- ---- 1) Add the new "suggested" enum value (idempotent) -------------------
alter type public.vacation_status add value if not exists 'suggested';

-- ---- 2) Add the columns that hold the suggested date range ----------------
alter table public.vacation_requests
  add column if not exists suggested_start date,
  add column if not exists suggested_end   date;

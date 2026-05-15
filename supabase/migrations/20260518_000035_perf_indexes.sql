-- =============================================================================
-- Performance indexes — close out gaps spotted in the perf sweep.
-- =============================================================================
-- Each `CREATE INDEX IF NOT EXISTS` is idempotent so the migration can be
-- replayed safely. Indexes cover queries called out in the perf review:
--
--   • idx_audit_action_created — `loadLastMonthlyRun` filters on
--     (action='lexware_monthly_generate', created_at desc). The existing
--     idx_audit_org_created leads on org_id and is great for the
--     dashboard feed, but doesn't help the by-action lookup. This new
--     composite index makes that exact query an index-only scan.
--
--   • idx_vac_org_created — vacation list loader orders by created_at
--     desc and filters by RLS-derived org. A (org_id, created_at desc)
--     index serves both the leading filter and the sort, replacing a
--     scan-then-sort.
--
--   • idx_chat_members_user — sidebar's unread-counter starts from
--     `chat_members.user_id = $1`. Indexes on (channel_id, user_id) and
--     (user_id, channel_id) might both exist depending on migration
--     history; we add the single-column form so the planner can satisfy
--     a user-only lookup without scanning the wider composite.
--
--   • idx_shifts_scheduled_today — dashboard "pending check-ins" filters
--     status='scheduled' AND deleted_at IS NULL AND starts_at IN (today
--     window). A partial index on starts_at WHERE status='scheduled' AND
--     deleted_at IS NULL keeps the planner-friendly subset tiny.
--
--   • idx_msgs_channel_created — chat history pulls. Already declared
--     in migration 000002; we re-issue with IF NOT EXISTS as a no-op so
--     this migration can be cited as the single source of truth for
--     the perf-sweep indexes.
-- =============================================================================

create index if not exists idx_audit_action_created
  on public.audit_log (action, created_at desc);

create index if not exists idx_vac_org_created
  on public.vacation_requests (org_id, created_at desc);

create index if not exists idx_chat_members_user
  on public.chat_members (user_id);

create index if not exists idx_shifts_scheduled_today
  on public.shifts (starts_at)
  where status = 'scheduled' and deleted_at is null;

-- Re-asserted from migration 20260504_000002_domain.sql for completeness;
-- IF NOT EXISTS makes this a no-op when already present.
create index if not exists idx_msgs_channel_created
  on public.chat_messages (channel_id, created_at desc)
  where deleted_at is null;

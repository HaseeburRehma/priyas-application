-- =============================================================================
-- time_entries — guarantee the unique index that backstops upsert(onConflict).
-- =============================================================================
-- Backstops the application-level idempotency in
-- `src/app/actions/time-entries.ts` (`checkInAction`). Two concurrent
-- check-in clicks used to race the JS-side "does it already exist?" probe
-- vs the INSERT, producing duplicate rows. The action now relies on
-- `.upsert(..., { onConflict: "shift_id,employee_id,kind", ignoreDuplicates })`,
-- which requires a unique constraint / index on those columns.
--
-- Migration 000018 already created `uniq_time_entries_shift_kind`. This
-- migration is fully idempotent — it simply ensures the index exists in
-- case a partial deploy skipped the earlier file. The spec calls for a
-- partial index `WHERE deleted_at IS NULL`, but `time_entries` is
-- immutable by design (no `deleted_at` column) so a plain unique index
-- is equivalent.
-- =============================================================================

create unique index if not exists uniq_time_entries_shift_kind
  on public.time_entries (shift_id, employee_id, kind);

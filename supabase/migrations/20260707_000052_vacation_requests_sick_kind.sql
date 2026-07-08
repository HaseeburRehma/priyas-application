-- =============================================================================
-- Add a `kind` column to vacation_requests so the same request/approval
-- workflow (pending → approved/rejected, or suggested-alternative-dates)
-- can represent a sick day, not just vacation. Spec 4.3 asks for "vacation
-- days, sick days, and availability" to all show inline on the schedule —
-- previously there was no way to record a sick day at all.
--
-- Defaults to 'vacation' so every existing row keeps its current meaning.
-- =============================================================================

alter table public.vacation_requests
  add column if not exists kind text not null default 'vacation'
    check (kind in ('vacation', 'sick'));

create index if not exists idx_vac_kind on public.vacation_requests(org_id, kind);

-- =============================================================================
-- 20260726_000054_dashboard_kpis_rpc.sql
--
-- Single-round-trip dashboard KPI aggregation.
--
-- Before: `loadDashboardData()` fired 10 separate `count('*') head:true`
-- queries + a `select total_cents` (11 round-trips even when
-- Promise.all-batched — each one still crosses the wire). On a Vercel
-- deployment far from Supabase (Bombay ↔ Frankfurt is ~300ms) that's
-- 300ms just for KPIs regardless of query complexity.
--
-- After: one RPC that returns every KPI count + the sum of open invoice
-- cents in a single JSON blob. The dashboard loader calls it via
-- `supabase.rpc('dashboard_kpis', { ... })` — one network round-trip.
--
-- The function is `stable security invoker` so it inherits the caller's
-- RLS scope (org boundary via `current_org_id()`), same as the client-
-- side query would have.
--
-- Every parameter is a timestamp — the caller (Node) sends the same
-- window boundaries it would use for the count queries, so there's no
-- clock skew between DB and app for "today".
-- =============================================================================

create or replace function public.dashboard_kpis(
  p_month_start   timestamptz,
  p_today_start   timestamptz,
  p_today_end     timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with
    org as (select public.current_org_id() as id),

    -- Aggregate all client counts in one scan.
    clients_agg as (
      select
        count(*) filter (where deleted_at is null)
          as active,
        count(*) filter (where deleted_at is null and created_at < p_month_start)
          as active_last_month,
        count(*) filter (where deleted_at is null and created_at >= p_month_start)
          as added_this_month
      from public.clients
      where org_id = (select id from org)
    ),

    -- Same, for properties.
    props_agg as (
      select
        count(*) filter (where deleted_at is null)
          as total,
        count(*) filter (where deleted_at is null and created_at < p_month_start)
          as total_last_month,
        count(*) filter (where deleted_at is null and created_at >= p_month_start)
          as added_this_month
      from public.properties
      where org_id = (select id from org)
    ),

    -- Today's shifts + how many still awaiting check-in.
    shifts_today_agg as (
      select
        count(*)
          as scheduled,
        count(*) filter (where status = 'scheduled')
          as pending_checkins
      from public.shifts
      where org_id = (select id from org)
        and deleted_at is null
        and starts_at >= p_today_start
        and starts_at <= p_today_end
    ),

    -- Open invoices sum + count of overdue rows.
    invoices_agg as (
      select
        coalesce(sum(case when status in ('sent', 'overdue') then total_cents end), 0)::bigint
          as open_cents,
        count(*) filter (where status in ('sent', 'overdue'))
          as pending_count,
        count(*) filter (where status = 'overdue')
          as overdue_count
      from public.invoices
      where org_id = (select id from org)
        and deleted_at is null
    )

  select jsonb_build_object(
    'clients', jsonb_build_object(
      'active',            (select active            from clients_agg),
      'active_last_month', (select active_last_month from clients_agg),
      'added_this_month',  (select added_this_month  from clients_agg)
    ),
    'properties', jsonb_build_object(
      'total',            (select total            from props_agg),
      'total_last_month', (select total_last_month from props_agg),
      'added_this_month', (select added_this_month from props_agg)
    ),
    'shifts_today', jsonb_build_object(
      'scheduled',        (select scheduled        from shifts_today_agg),
      'pending_checkins', (select pending_checkins from shifts_today_agg)
    ),
    'invoices', jsonb_build_object(
      'open_cents',    (select open_cents    from invoices_agg),
      'pending_count', (select pending_count from invoices_agg),
      'overdue_count', (select overdue_count from invoices_agg)
    )
  );
$$;

grant execute on function public.dashboard_kpis(timestamptz, timestamptz, timestamptz)
  to authenticated;

comment on function public.dashboard_kpis(timestamptz, timestamptz, timestamptz) is
  'Single-round-trip aggregation of every KPI the /dashboard renders. Called by loadDashboardData() to collapse ~10 count() queries into one supabase.rpc(). RLS-scoped via current_org_id().';

-- Refresh the PostgREST schema cache so `supabase.rpc('dashboard_kpis', …)`
-- resolves immediately without waiting for the next natural reload.
notify pgrst, 'reload schema';

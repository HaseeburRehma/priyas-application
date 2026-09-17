-- =============================================================================
-- Wrap RLS helpers in `(select …)` so Postgres evaluates them as an
-- InitPlan (once per statement) instead of re-invoking the STABLE
-- function on every candidate row.
--
-- Why this matters
-- ----------------
-- The dynamic policy block in 20260504_000002_domain.sql applies four
-- policies to each of clients / properties / employees (and 9 sibling
-- tables). The USING clauses call `public.current_org_id()`, and the
-- write clauses also call `public.is_dispatcher_or_admin()` /
-- `public.is_admin()`. Those helpers are declared STABLE SECURITY
-- DEFINER, so Postgres CAN cache them for a statement -- but only when
-- the planner is confident it's safe. For queries that scan many rows
-- before RLS filters them (large table scans, ILIKE searches with no
-- trigram index, aggregations), the planner often ends up executing
-- the function per candidate row anyway, because a bare
-- function-call expression is opaque to the outer plan.
--
-- Wrapping the call in `(select …)` forces the planner to materialise
-- the result as a scalar sub-select -- classic InitPlan pattern -- so
-- the function runs exactly once and the scalar is compared against
-- every row via a plain equality test. Same predicate, same security
-- guarantee; just a better shape.
--
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Rollback: re-apply the original 20260504_000002_domain.sql `do $$`
-- block (or migration 000055 for client_documents / 000011 for
-- push_subscriptions). Nothing about the schema changes here, only
-- policy text.
-- =============================================================================

-- Tables governed by the four-policy CRUD template in the domain
-- migration. Kept in the same order so a diff against 000002 is easy.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients','properties','property_photos','employees','employee_documents',
    'shifts','time_entries','invoices','invoice_items','client_statements',
    'settings','reports'
  ]
  loop
    execute format('drop policy if exists "%I:read org" on public.%I', t, t);
    execute format($p$
      create policy "%I:read org" on public.%I for select
      using (org_id = (select public.current_org_id()))
    $p$, t, t);

    execute format('drop policy if exists "%I:write dispatcher" on public.%I', t, t);
    execute format($p$
      create policy "%I:write dispatcher" on public.%I for insert
      with check (
        org_id = (select public.current_org_id())
        and (select public.is_dispatcher_or_admin())
      )
    $p$, t, t);

    execute format('drop policy if exists "%I:update dispatcher" on public.%I', t, t);
    execute format($p$
      create policy "%I:update dispatcher" on public.%I for update
      using (
        org_id = (select public.current_org_id())
        and (select public.is_dispatcher_or_admin())
      )
      with check (
        org_id = (select public.current_org_id())
        and (select public.is_dispatcher_or_admin())
      )
    $p$, t, t);

    execute format('drop policy if exists "%I:delete admin" on public.%I', t, t);
    execute format($p$
      create policy "%I:delete admin" on public.%I for delete
      using (
        org_id = (select public.current_org_id())
        and (select public.is_admin())
      )
    $p$, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- profiles: same optimisation on the org-wide read and admin-all policies.
-- The "profiles: own update" policy uses `id = auth.uid()` and stays as-is:
-- that predicate is per-row by design (each row owns its own gate) so
-- InitPlan-caching a whole-table scalar wouldn't be equivalent.
-- ---------------------------------------------------------------------------

drop policy if exists "profiles: members read same org" on public.profiles;
create policy "profiles: members read same org"
  on public.profiles for select
  using (org_id = (select public.current_org_id()));

drop policy if exists "profiles: admin all in org" on public.profiles;
create policy "profiles: admin all in org"
  on public.profiles for all
  using (
    org_id = (select public.current_org_id())
    and (select public.is_admin())
  )
  with check (
    org_id = (select public.current_org_id())
    and (select public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- client_documents (added in 20260804_000055_alltagshelfer_intake.sql).
-- Same three policies, same helpers, same optimisation.
-- ---------------------------------------------------------------------------

drop policy if exists client_docs_read on public.client_documents;
create policy client_docs_read on public.client_documents for select
  using (org_id = (select public.current_org_id()) and deleted_at is null);

drop policy if exists client_docs_write on public.client_documents;
create policy client_docs_write on public.client_documents for insert
  with check (
    org_id = (select public.current_org_id())
    and (select public.is_admin_or_dispatcher())
  );

drop policy if exists client_docs_update on public.client_documents;
create policy client_docs_update on public.client_documents for update
  using (
    org_id = (select public.current_org_id())
    and (select public.is_admin_or_dispatcher())
  );

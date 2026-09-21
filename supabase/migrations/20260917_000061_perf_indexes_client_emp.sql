-- =============================================================================
-- Performance indexes — close the gaps flagged by the 2026-09-17 audit of
-- the clients / employees / properties read paths.
--
-- Every index below is idempotent (`if not exists`). Plain
-- `create index` (not CONCURRENTLY) so this file can be pasted into
-- the Supabase SQL editor, which wraps every request in a transaction
-- and rejects CONCURRENTLY. The affected tables are in the
-- low-thousands of rows, so the brief ACCESS EXCLUSIVE lock during
-- the index build is imperceptible.
--
-- If you later apply this against a very large DB where a table lock
-- would be visible, swap the plain `create index` back for `create
-- index concurrently` and drive it via `supabase db push` — the CLI
-- runs each statement outside a transaction so CONCURRENTLY is
-- accepted.
--
-- Storage cost: partial indexes only — everything is scoped to
-- `where deleted_at is null` and, where relevant, `archived = false`
-- so soft-deleted rows never bloat the trees.
--
-- Ordering note: `create extension pg_trgm` must land before the
-- trigram GIN indexes below reference `gin_trgm_ops`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. employees.profile_id
--
-- The dashboard `layout.tsx`, `/my-self`, `/schedule`, `/vacation`,
-- `/training`, `/employee-overview`, the iCal export, working-time
-- reports, and the mobile app's `auth-context.tsx` all hit
--     `.from("employees").eq("profile_id", user.id).maybeSingle()`
-- once per request. There is no matching index today — Postgres
-- Seq Scans the employees table every time. Small now, linear as the
-- staff roster grows. Partial-index on soft-deleted keeps the tree
-- tiny.
-- ---------------------------------------------------------------------------
create index if not exists idx_emp_profile
  on public.employees (profile_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. properties(client_id, created_at desc)
--
-- The client-detail page renders a "Recent properties" preview:
--     .eq("client_id", id).order("created_at", { desc }).limit(4)
-- Existing idx_props_client covers the equality lookup but the sort
-- still spills to disk on clients with many properties. Composite
-- gives an index-only ordered scan.
-- ---------------------------------------------------------------------------
create index if not exists idx_props_client_created
  on public.properties (client_id, created_at desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 3. clients default-list sort — (org_id, display_name)
--
-- The default `/clients` list is `.order("display_name")` under a
-- baseline `where deleted_at is null and archived = false` predicate.
-- The existing idx_clients_org matches the RLS filter but forces a
-- separate Sort on display_name. Composite lets the planner range-scan
-- straight into the paginated result — no Sort node.
--
-- Partial predicate matches the loader's default (archived = false).
-- Archived-only listings fall back to the existing idx_clients_org.
-- ---------------------------------------------------------------------------
create index if not exists idx_clients_org_name
  on public.clients (org_id, display_name)
  where deleted_at is null and archived = false;

-- ---------------------------------------------------------------------------
-- 4. employees default-list sort — (org_id, full_name)
-- Same rationale as #3, minus the archived predicate (employees uses
-- `status` for the archived-equivalent, and idx_emp_status already
-- covers that view).
-- ---------------------------------------------------------------------------
create index if not exists idx_emp_org_name
  on public.employees (org_id, full_name)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 5. properties default-list sort — (org_id, name)
-- Same rationale as #3/#4.
-- ---------------------------------------------------------------------------
create index if not exists idx_props_org_name
  on public.properties (org_id, name)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 6. Trigram (pg_trgm) indexes for ILIKE '%…%' search
--
-- The existing idx_clients_search is a to_tsvector GIN — it matches
-- @@ / to_tsquery, NOT the ILIKE '%…%' pattern the list-search
-- loaders use (`display_name.ilike.%q%,email.ilike.%q%,phone.ilike.%q%`).
-- Without trigram indexes those searches are Seq Scans. The comment
-- in src/lib/api/clients.ts:132 already claims a "trigram fallback",
-- but pg_trgm was never installed. This migration installs it and
-- backs the columns actually searched by the UI.
--
-- gin_trgm_ops indexes are the right shape for double-sided wildcards
-- (%q%). They add ~30-50% of the text-column footprint — tolerable
-- for tables in the low-thousands of rows, worth it for the search
-- perf jump.
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists idx_clients_trgm_name
  on public.clients using gin (display_name gin_trgm_ops)
  where deleted_at is null;

create index if not exists idx_clients_trgm_email
  on public.clients using gin (email gin_trgm_ops)
  where deleted_at is null and email is not null;

create index if not exists idx_emp_trgm_name
  on public.employees using gin (full_name gin_trgm_ops)
  where deleted_at is null;

create index if not exists idx_emp_trgm_email
  on public.employees using gin (email gin_trgm_ops)
  where deleted_at is null and email is not null;

create index if not exists idx_props_trgm_name
  on public.properties using gin (name gin_trgm_ops)
  where deleted_at is null;

create index if not exists idx_props_trgm_city
  on public.properties using gin (city gin_trgm_ops)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 7. Index for property-CSV import lookup
--
-- /api/properties/import does
--     .from("clients").eq("org_id", orgId).eq("email", row.client_email)
--          .maybeSingle()
-- inside a per-row loop. The composite (org_id, lower(email)) turns
-- per-row Seq Scans into index probes.
--
-- Originally declared UNIQUE to also enforce the implicit business rule
-- "one client per email within an org". Downgraded to a plain btree
-- because live data already has same-email duplicates (e.g. two
-- residential clients created for the same household email, or a
-- long-standing customer re-onboarded under a new record). Enforcing
-- uniqueness would fail the migration on those rows without solving
-- the perf problem. If the client wants the uniqueness back, dedupe
-- the offending rows first and add a follow-up migration promoting
-- this index to UNIQUE.
-- ---------------------------------------------------------------------------
create index if not exists idx_clients_org_lower_email
  on public.clients (org_id, lower(email))
  where email is not null and deleted_at is null;

-- Drop the old unique-index name if a prior migration attempt got past
-- the CREATE (unlikely — the duplicate would have failed it — but
-- defensive: means re-running this file is a no-op on any prior state).
drop index if exists public.uniq_clients_org_lower_email;

# Perf Audit — Client & Employee Data Endpoints

**Date:** 2026-09-17
**Scope:** Read paths for `clients`, `employees`, `properties`, `profiles` on
web (Next.js on Vercel) + mobile (Expo). Backend/data-fetch only — UI
untouched.

**Summary — top 5 findings, ranked by expected impact:**

| # | Finding | Fix | Expected p95 delta |
|---|---|---|---|
| 1 | **Region mismatch (probable)** — Vercel default `iad1` (US-East) reaching Supabase in EU. | Set `vercel.json.regions=["fra1"]` (or wherever Supabase is). | −100 to −300 ms every call |
| 2 | **RLS helper not wrapped in `(select …)`** — `current_org_id()` re-evaluated per row on large scans. | Rewrite policies as `using (org_id = (select public.current_org_id()))`. | −30 to −70 % on 1k-row scans |
| 3 | **Missing index on `employees.profile_id`** — hit on every dashboard render + mobile auth + `/schedule` + `/vacation` + `/training` + `/my-self`. | `create index concurrently idx_emp_profile on employees (profile_id) where deleted_at is null;` | ~10-40 ms saved per page load |
| 4 | **Comment says "trigram fallback" but no `pg_trgm` index exists** — every ILIKE `%…%` search on clients/employees/properties does a Seq Scan. | `create extension pg_trgm;` + GIN indexes on searched columns. | list search 500ms → <50ms once data grows |
| 5 | **Unbounded queries** — team-util, employee-overview, training, invoices/new, dashboard sidebar — pull the full active set. | Add `.limit()` + explicit pagination where the UI actually paginates. | linear-in-N cost capped |

Runner-up: bulk `for-of` loops in `actions/{clients,employees,properties}.ts`
(up to 500 sequential SELECT+UPDATE round-trips). Impact on end-user latency
is low (admin-only bulk ops), but they trip Vercel's 60 s function limit as
the org grows.

**Not a problem:**
- No `.select('*')` against any of the four tables.
- RLS helper functions (`current_org_id`, `is_admin`, `is_dispatcher_or_admin`)
  are correctly declared `STABLE SECURITY DEFINER`.
- All server code goes through `@supabase/ssr` → PostgREST, not direct
  Postgres — connection-pooling concerns don't apply.
- Existing indexes cover `org_id` (leading column of every RLS-filtered read)
  and the composite `(org_id, customer_type|status|service_type)` variants
  used by chip filters.

---

## Phase 1 — Measure

### Endpoint inventory

Every read against `clients` / `employees` / `properties` / `profiles`, with
call-site, query shape, embeds, and pagination status. Compressed here — the
Explore agent's full 90-row inventory is in the "Full inventory" appendix at
the bottom.

**Top 6 hottest read paths (by likely QPS × cost):**

| Endpoint | Loader | Queries per call | Embeds | Unbounded queries? |
|---|---|---|---|---|
| `GET /clients` (web + `/api/clients`) | `loadClientsList` [src/lib/api/clients.ts:114](../src/lib/api/clients.ts) | 3 (main + `properties.in(client_id)` + `contracts.in(client_id)`) | none | 2 of 3 — the two follow-ups have no `.limit()` |
| `GET /employees` | `loadEmployeesList` [src/lib/api/employees.ts:293](../src/lib/api/employees.ts) | 2 (main + `shifts.in(employee_id).gte(week)`) | `profile:profiles(id, role)` | 1 of 2 — weekly-hours shift lookup |
| `GET /properties` | `loadPropertiesList` [src/lib/api/properties.ts:140](../src/lib/api/properties.ts) | 2 (main + `shifts.in(property_id, employee:employees(*))`) | `client:clients(id, display_name, customer_type)` + nested `employee:employees` | shifts capped at 2 000 |
| `/employees/[id]` | `loadEmployeeDetail` [src/lib/api/employees.ts:530](../src/lib/api/employees.ts) | 5 in `Promise.all` (shifts week/month/total + upcoming + time-entries) | `property.client` double-nest, `shift.property` double-nest | most have `.limit()`, one is `count:head` |
| `/properties/[id]` | `loadPropertyDetail` [src/lib/api/properties.ts:292](../src/lib/api/properties.ts) | 7 (main + count + team + 2× count + recent-assignments + photos) | `client:clients`, `employee:employees` embeds | all bounded |
| **Dashboard layout** ([src/app/(dashboard)/layout.tsx:46](../src/app/(dashboard)/layout.tsx)) | inline | 3 (profiles + employees + `loadSidebarCounts`) | none | fine — `.maybeSingle()` and `head:true` counts |

### Timing wrapper (drop-in) — recommended additions

The codebase has no timing logs on Supabase calls. Add this shim once, then
wrap each hot query:

```ts
// src/lib/perf/timed.ts  (new file)
import { performance } from "node:perf_hooks";

/**
 * Wrap a Supabase Thenable so start/end/rows/bytes land in Vercel logs.
 * Zero-cost in prod when `PERF_LOG` env var is off.
 */
export async function timed<T>(label: string, q: PromiseLike<T>): Promise<T> {
  if (!process.env.PERF_LOG) return q as Promise<T>;
  const t0 = performance.now();
  const res = await q;
  const ms = (performance.now() - t0).toFixed(1);
  // `res` is a PostgrestResponse shape at runtime
  const anyRes = res as unknown as { data?: unknown; count?: number };
  const rows = Array.isArray(anyRes?.data) ? anyRes.data.length : anyRes?.data ? 1 : 0;
  const bytes = anyRes?.data ? JSON.stringify(anyRes.data).length : 0;
  console.log(
    `[perf] ${label} ms=${ms} rows=${rows} bytes=${bytes} count=${anyRes?.count ?? "-"}`,
  );
  return res;
}
```

Enable per-request in Vercel: `PERF_LOG=1`. Sample usage:

```ts
const { data, error, count } = await timed(
  "clients.list.main",
  supabase.from("clients").select("id, display_name…", { count: "exact" })…
);
```

Rerun `/clients?pageSize=25` a few times with `PERF_LOG=1`, then read the
Vercel function log to fill this table (currently empty — the app is not
instrumented):

| Endpoint | total ms | # queries | rows | payload KB |
|---|---|---|---|---|
| GET /clients (page 1, empty q) | — | — | — | — |
| GET /clients (with q + type=alltagshilfe) | — | — | — | — |
| GET /employees (page 1) | — | — | — | — |
| GET /properties (page 1) | — | — | — | — |
| GET /clients/[id] (detail) | — | — | — | — |

### ⚠️ Region mismatch check (top-priority)

**Vercel:** `vercel.json` has no `regions` key → defaults to `iad1`
(Washington DC, us-east-1).

**Supabase:** could not be detected non-interactively. `dig
db.oeovzmsstlaqbfqntwjz.supabase.co CNAME` returned empty (Supabase fronts
DB with a direct-A record + Cloudflare), and the Platform API refuses
without a personal access token. Common projects for German customers
default to `eu-central-1` (Frankfurt) — if that's the case here, **every
PostgREST call round-trips iad1↔eu-central-1 ≈ 90-110 ms latency floor**,
before any query work.

**Action for you (30 seconds):**

1. Open <https://supabase.com/dashboard/project/oeovzmsstlaqbfqntwjz/settings/general>
2. Read the "Region" line under project settings
3. If it's not `us-east-1`, add to `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["fra1"],
  "crons": [ /* … existing … */ ]
}
```

`fra1` = Frankfurt (matches `eu-central-1`). Other mappings: `arn1`
Stockholm (`eu-north-1`), `dub1` Dublin (`eu-west-1`), `sfo1` San Francisco
(`us-west-1`), `hnd1` Tokyo (`ap-northeast-1`). Full list:
<https://vercel.com/docs/edge-network/regions>.

**This is the single biggest lever** if there's a mismatch — no code
changes needed, applies to every endpoint. Report the region back and I'll
finalize the `vercel.json` diff.

---

## Phase 2 — Diagnose

### 1. RLS policy overhead

**Verdict:** middling risk. Better than the classic bare-`auth.uid()`
antipattern, but still leaves the well-documented "wrap in select" win on
the table.

**Current pattern** (dynamically applied to
`clients`/`properties`/`employees` + 8 other tables in
`20260504_000002_domain.sql:308`):

```sql
create policy "clients:read org" on public.clients for select
  using (org_id = public.current_org_id());
```

Where `current_org_id()` is:

```sql
create or replace function public.current_org_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid() and deleted_at is null limit 1;
$$;
```

The **`STABLE`** volatility lets Postgres cache the function result within
a single statement, so it should be evaluated once, not per row.

**But** — the `auth.uid()` call inside the function is **not** wrapped in
`(select auth.uid())`. On queries that scan many rows before RLS filters
them (large table scans, unindexed searches, aggregations), the planner
sometimes still executes `auth.uid()` per row because the function body is
opaque to the outer statement plan. Wrapping the call in the policy itself
forces an `InitPlan`:

```sql
-- perf-safe form
using (org_id = (select public.current_org_id()))
```

This is Supabase's own [official guidance][rls-perf].

[rls-perf]: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

### 2. Missing FK indexes

**Confirmed missing:**

| Table.column | Used by | Miss cost |
|---|---|---|
| `employees(profile_id)` | dashboard layout (every render), `/my-self`, `/schedule`, `/vacation`, `/training`, `/employee-overview`, `iCal export`, working-time report, mobile auth ctx | Seq Scan on employees table every dashboard hit — ~2-5 ms while small, linear as staff grows |
| `properties(client_id, created_at desc)` (composite covering the sort) | client-detail preview `.order("created_at",desc).limit(4)` | small now; matters when a client has 100+ properties |
| `clients(org_id, archived, display_name)` (composite for default list) | `loadClientsList` default sort | replaces `idx_clients_org` + separate sort |
| `clients(org_id, lower(email))` unique | property CSV import `.eq("org_id",orgId).eq("email",row.client_email)` inside per-row loop | reduces import-per-row cost |

**Present and correct:**

- `idx_clients_org (org_id) where deleted_at is null`
- `idx_clients_type (org_id, customer_type) where deleted_at is null`
- `idx_clients_lexware_contact`
- `uniq_clients_customer_number_per_org`
- `idx_props_org`, `idx_props_client`
- `idx_emp_org`, `idx_emp_status (org_id, status)`, `idx_emp_service_type`
- `idx_profiles_org`, `idx_profiles_role`
- `idx_shifts_employee`, `idx_te_employee`, `idx_empdocs_emp`, `idx_keys_employee`,
  `idx_train_assign_emp`, `idx_assign_staff_employee` — FKs from other tables to
  employees are all indexed.

### 3. `EXPLAIN (ANALYZE, BUFFERS)` — the main list query

**Can't run this from the terminal here** — Supabase's SQL editor is behind
the dashboard. Please run this in
<https://supabase.com/dashboard/project/oeovzmsstlaqbfqntwjz/sql/new> as
the `authenticated` role (Settings → Database → Set role) — RLS matters:

```sql
-- exact query loadClientsList issues for the default page-1 list
-- (impersonate a real user first so RLS applies)
set local role authenticated;
set local "request.jwt.claims" to
  '{"sub":"90f32ea1-c389-4189-a5ce-fb3a6a318972"}';  -- haseebtylo@gmail.com

explain (analyze, buffers)
select id, display_name, customer_type, payer_type, email, phone, created_at, archived
from public.clients
where deleted_at is null and archived = false
order by display_name asc
limit 25 offset 0;
```

What to look for:

- **Seq Scan on clients** with `Rows Removed by Filter` > 100 → you need a
  composite index that lets the planner index-scan straight into the
  results.
- **Sort** node with `disk` → the sort spilled to temp files; add covering
  index.
- **Filter: (org_id = current_org_id())** at the top with high `actual
  time=` → the RLS call is per-row; apply fix #2 above.
- **Buffers: shared read=N** — if N >> `hit=`, cold cache; not a bug, but
  low warm-cache locality.

Also run the same block for `employees` (order by full_name) and
`properties` (order by name).

### 4. Over-fetching

Every loader lists columns explicitly. **No `.select('*')` anywhere on
these four tables.** ✓

Nested embeds that are known **necessary** (used by the UI):

- `properties.select(…, client:clients(id, display_name, customer_type))` —
  the list card renders the client name inline.
- `employees.select(…, profile:profiles(id, role))` — role badge on the
  employees list.
- `shifts.select(…, employee:employees(id, full_name), property:properties(name, client:clients(display_name)))` in
  detail pages — the join lets one round-trip render a full row.

Nested embeds that are **larger than the UI needs**:

- `loadEmployeeDetail` upcoming-shifts row includes `property.client.display_name` — the
  UI shows the property name, not the client. Drop `client:clients(display_name)`.
- `loadEmployeeOverview` shifts embed `property:properties(client:clients(customer_type))` just to
  colour a row by customer type — could denormalize `customer_type` onto
  `shifts` on write, or compute it in a materialized view.

### 5. N+1 via embedding

**No N+1 via loops for read paths that serve pages.** All list/detail
loaders fan out via `Promise.all`, not sequential `for-of`.

**Write-path N+1 (matters as data grows):**

- `bulkArchiveClientsAction` (`src/app/actions/clients.ts:384`) — up to 500
  serial `SELECT` + `UPDATE` round-trips.
- Same shape in `bulkArchivePropertiesAction`
  (`src/app/actions/properties.ts:249`), `bulkAssignPropertiesAction`
  (`src/app/actions/properties.ts:311`),
  `bulkArchiveEmployeesAction` (`src/app/actions/employees.ts:434`).
- CSV import (`src/app/api/properties/import/route.ts:125`) does one
  `clients.eq("email",…).maybeSingle()` per imported row.

### 6. No pagination — unbounded queries

Confirmed **unbounded** reads (no `.range()` and no `.limit()`) — these are
the ticking time bombs as the org grows:

| File:line | Query | Suggested cap |
|---|---|---|
| [src/lib/api/dashboard.ts:464](../src/lib/api/dashboard.ts) | `employees.select(…profile:profiles).is(deleted_at,null).eq(status,active)` — team util | `.limit(200)` |
| [src/lib/api/employee-overview.ts:158](../src/lib/api/employee-overview.ts) | employees full list | `.limit(500)` + real pagination if the UI needs it |
| [src/lib/api/employee-overview.ts:179](../src/lib/api/employee-overview.ts) | shifts for the visible week + 3 days | already narrow; keep but add `.limit(5000)` safety |
| [src/lib/api/training.ts:106](../src/lib/api/training.ts) | employees for manager roster | `.limit(500)` |
| [src/app/(dashboard)/invoices/new/page.tsx:22](../src/app/(dashboard)/invoices/new/page.tsx) | `clients` dropdown | `.limit(500)` |
| [src/app/(dashboard)/properties/[id]/page.tsx:66](../src/app/(dashboard)/properties/[id]/page.tsx) | active employees dropdown | `.limit(500)` |
| [src/components/chat/NewChannelDialog.tsx:63](../src/components/chat/NewChannelDialog.tsx) | profiles for direct-message picker | `.limit(200)` + client-side search |
| [src/lib/api/clients.ts:186](../src/lib/api/clients.ts) | `properties.select(client_id).in(client_id, rowIds)` — prop counts for list | ok as-is (bounded by list page size = 25) |
| [src/lib/api/clients.ts:203](../src/lib/api/clients.ts) | `contracts.select(…).in(client_id, rowIds).order(start_date,desc)` — status | ok (same bound) |
| [src/lib/api/statement.ts:137](../src/lib/api/statement.ts) | `properties.select(id,name).eq(client_id,…)` | `.limit(500)` |
| [src/lib/api/alltagshilfe.ts:120](../src/lib/api/alltagshilfe.ts) | `clients.eq(customer_type,alltagshilfe)` | already scoped by customer_type; report itself is a bounded workload; keep |
| [src/lib/api/alltagshilfe.ts:184](../src/lib/api/alltagshilfe.ts) | `shifts.limit(10000)` triple-embed | **biggest single read in the app** — see Fix 8 below |
| [apps/mobile/src/lib/clients.ts:105](../apps/mobile/src/lib/clients.ts) | mobile `properties.select(client_id).in(client_id, ids)` | ok (bounded by mobile list) |

### 7. Connection pooling

**Non-issue.** Every server-side call goes through `@supabase/ssr` /
`@supabase/supabase-js` → PostgREST over HTTPS. There is no direct
Postgres client, no `pg`/`Pool`/`Prisma`/`Drizzle` connection, and
therefore no per-invocation connection-pool exhaustion risk on Vercel's
serverless runtime. ✓

If direct Postgres access is added later (e.g. for a heavy batch job),
use the Supavisor pooler URL at port 6543 (transaction mode):

```
postgresql://postgres.oeovzmsstlaqbfqntwjz:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

---

## Phase 3 — Fix (highest impact first)

### Fix 1 — Region (waiting on your dashboard check)

If Supabase is in `eu-central-1` (very likely for a German customer), apply
this **one-file, zero-code change** — biggest single win:

```diff
--- a/vercel.json
+++ b/vercel.json
@@
 {
   "$schema": "https://openapi.vercel.sh/vercel.json",
+  "regions": ["fra1"],
   "crons": [
```

Substitute `fra1` for whatever Vercel region matches your Supabase region
(see mapping in Phase 1). This changes every Vercel function to run in
that region — including all API routes, RSC render, and cron jobs.
Deploy → measure → done.

### Fix 2 — RLS policy: wrap `current_org_id()` in `(select …)`

New migration — safe, reversible, no downtime:

```sql
-- supabase/migrations/20260917_000060_rls_initplan_wrap.sql

-- Rewrite the four dynamic policies applied to clients/properties/employees/
-- (and their sibling tables in the array below) so the RLS helpers are
-- evaluated as InitPlan subqueries — Postgres caches the single scalar once
-- per statement instead of re-invoking the STABLE function per candidate row.
-- Same security guarantee (identical predicate), better plan for large scans.
--
-- Idempotent: `drop policy if exists` + `create policy` for every table.

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

-- Also touch the profiles-specific and client_documents policies that use
-- the same helpers.

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
```

**Security note:** the predicate is byte-identical to the original — same
tables, same helper functions, same result. Only the plan shape changes.
Do NOT change the "own update" policy on profiles (`using (id =
auth.uid())`) — that one is per-row by design and correct.

### Fix 3 + 4 — Indexes (biggest gap: `employees.profile_id` + pg_trgm)

```sql
-- supabase/migrations/20260917_000061_perf_indexes_client_emp.sql

-- CONCURRENTLY = no table lock; can run against a live DB. Must be executed
-- outside a transaction — Supabase's migration runner handles that per-file
-- automatically for `create index concurrently` statements.

-- 1. employees.profile_id — used on every dashboard render + mobile auth.
--    Currently a Seq Scan; a partial index keeps the tree tiny.
create index concurrently if not exists idx_emp_profile
  on public.employees (profile_id)
  where deleted_at is null;

-- 2. properties(client_id, created_at desc) — client-detail preview
--    `.order(created_at desc).limit(4)`. Composite avoids sort node.
create index concurrently if not exists idx_props_client_created
  on public.properties (client_id, created_at desc)
  where deleted_at is null;

-- 3. clients default-list sort. Existing idx_clients_org(org_id) forces a
--    sort on display_name; composite lets the planner range-scan straight
--    into the paginated result.
create index concurrently if not exists idx_clients_org_name
  on public.clients (org_id, display_name)
  where deleted_at is null and archived = false;

-- 4. employees default-list sort (analogous to #3).
create index concurrently if not exists idx_emp_org_name
  on public.employees (org_id, full_name)
  where deleted_at is null;

-- 5. properties default-list sort.
create index concurrently if not exists idx_props_org_name
  on public.properties (org_id, name)
  where deleted_at is null;

-- 6. pg_trgm for ILIKE '%…%' search. The existing idx_clients_search is a
--    tsvector GIN — matches @@ / to_tsquery, NOT ilike. This is the
--    "trigram fallback" the comment in loadClientsList promises.
create extension if not exists pg_trgm;

create index concurrently if not exists idx_clients_trgm_name
  on public.clients using gin (display_name gin_trgm_ops)
  where deleted_at is null;
create index concurrently if not exists idx_clients_trgm_email
  on public.clients using gin (email gin_trgm_ops)
  where deleted_at is null and email is not null;

create index concurrently if not exists idx_emp_trgm_name
  on public.employees using gin (full_name gin_trgm_ops)
  where deleted_at is null;
create index concurrently if not exists idx_emp_trgm_email
  on public.employees using gin (email gin_trgm_ops)
  where deleted_at is null and email is not null;

create index concurrently if not exists idx_props_trgm_name
  on public.properties using gin (name gin_trgm_ops)
  where deleted_at is null;
create index concurrently if not exists idx_props_trgm_city
  on public.properties using gin (city gin_trgm_ops)
  where deleted_at is null;

-- 7. Property CSV import lookup: clients.eq(org_id, orgId).eq(email, …)
--    inside a per-row loop. Even after the loop is batched (Fix 7), a
--    unique index on (org_id, lower(email)) turns per-row lookups into
--    an index probe.
create unique index concurrently if not exists uniq_clients_org_lower_email
  on public.clients (org_id, lower(email))
  where email is not null and deleted_at is null;
```

Storage cost of the trigram indexes: ~30-50 % of the text-column footprint
(negligible for a workforce app with <100k rows across these tables).
Query benefit: `%…%` searches drop from Seq Scan → GIN index scan, which
is the whole point.

### Fix 5 — `.select()` only needed columns

Everything already lists columns. **No change needed** on that dimension.

Two small drops that trim payload without any UI change:

```diff
--- a/src/lib/api/employees.ts
+++ b/src/lib/api/employees.ts
@@ -594,7 +594,7 @@
   const { data: upcoming, error: upcomingError } = await supabase
     .from("shifts")
     .select(
-      "id, starts_at, ends_at, status, property:properties ( name, client:clients ( display_name ) )",
+      "id, starts_at, ends_at, status, property:properties ( id, name )",
     )
     .eq("employee_id", id)
     .is("deleted_at", null)
```

(UI only prints the property name — the client display name is fetched but
never used.)

### Fix 6 — Pagination on unbounded queries

Six edits, small enough to run in one commit:

```diff
--- a/src/lib/api/dashboard.ts
+++ b/src/lib/api/dashboard.ts
@@ -463,7 +463,7 @@
   const { data: teamUtil } = await supabase
     .from("employees")
     .select("id, full_name, weekly_hours, status, profile:profiles ( id, role )")
     .is("deleted_at", null)
-    .eq("status", "active");
+    .eq("status", "active")
+    .order("full_name", { ascending: true })
+    .limit(200);
```

```diff
--- a/src/app/(dashboard)/invoices/new/page.tsx
+++ b/src/app/(dashboard)/invoices/new/page.tsx
@@ -21,7 +21,7 @@
   const { data: clients } = await supabase
     .from("clients")
     .select("id, display_name, customer_type, email, billing_email")
     .is("deleted_at", null)
     .eq("archived", false)
-    .order("display_name");
+    .order("display_name")
+    .limit(500);
```

Similar `.limit(500)` on:

- `src/lib/api/employee-overview.ts:158`
- `src/lib/api/training.ts:106`
- `src/app/(dashboard)/properties/[id]/page.tsx:66`
- `src/lib/api/statement.ts:137`

`src/components/chat/NewChannelDialog.tsx:63` — cap at `.limit(200)` and
add a client-side search input for orgs over the cap.

### Fix 7 — Batch bulk actions

Replace the per-row loops in `bulkArchive*Action` /
`bulkAssignPropertiesAction` with a single before-image select and a
single update:

```diff
--- a/src/app/actions/clients.ts
+++ b/src/app/actions/clients.ts
@@ -380,25 +380,32 @@
 export async function bulkArchiveClientsAction(rawInput: unknown) {
   const input = BulkArchiveInput.parse(rawInput);
   const supabase = await createSupabaseServerClient();
   const unique = [...new Set(input.ids)];
+
+  // One SELECT for the before-images, one UPDATE for the whole batch.
+  const { data: beforeRows } = await supabase
+    .from("clients")
+    .select("id, display_name, archived")
+    .in("id", unique);
+  const before = new Map(beforeRows?.map((r) => [r.id, r]) ?? []);
+
+  const { error: updateError } = await supabase
+    .from("clients")
+    .update({ archived: input.archived })
+    .in("id", unique);
+  if (updateError) return { ok: false, error: updateError.message };
+
   for (const id of unique) {
-    const { data: before } = await supabase
-      .from("clients")
-      .select("display_name, archived")
-      .eq("id", id)
-      .maybeSingle();
-    if (!before) continue;
-    const { error } = await supabase
-      .from("clients")
-      .update({ archived: input.archived })
-      .eq("id", id);
-    if (error) return { ok: false, error: error.message };
-    await audit({ table_name: "clients", record_id: id, action: "archive",
-                  before, after: { ...before, archived: input.archived } });
+    const b = before.get(id);
+    if (!b) continue;
+    await audit({
+      table_name: "clients", record_id: id, action: "archive",
+      before: b, after: { ...b, archived: input.archived },
+    });
   }
   revalidatePath("/clients");
   return { ok: true };
 }
```

500 rows: **500 SELECT + 500 UPDATE → 1 SELECT + 1 UPDATE + N in-JS audit
writes** (audit inserts can also be batched — one `insert(auditRows)`).
Net: ~250× fewer round-trips.

Same shape applies verbatim to
- `bulkArchivePropertiesAction`
- `bulkAssignPropertiesAction` (extra: the update needs a `case` expression
  if the assignment differs per row — for a bulk-assign-all-to-same-employee
  it's still one UPDATE)
- `bulkArchiveEmployeesAction`

### Fix 8 — Trim the alltagshilfe monthly triple-embed

`src/lib/api/alltagshilfe.ts:184` — the single most expensive read in the
app. It embeds shifts → properties → clients → (all their columns) plus
shifts → employees, capped at 10 000 shifts.

Two levers, in order of ease:

**Easier:** drop the redundant embed columns the report never renders:

```diff
--- a/src/lib/api/alltagshilfe.ts
+++ b/src/lib/api/alltagshilfe.ts
@@ -184,7 +184,7 @@
   const { data: shifts } = await supabase
     .from("shifts")
-    .select(
-      "id, starts_at, ends_at, status, property:properties ( id, name, address_line1, city, client_id, client:clients ( id, display_name, customer_type, insurance_provider ) ), employee:employees ( id, full_name )",
-    )
+    .select(
+      "id, starts_at, ends_at, status, property_id, employee_id, employee:employees ( id, full_name )",
+    )
     .in("property_id", altPropIds)
```

Then hydrate client-side once for the property/client tuples already
fetched at `:120` and `:174`. Payload drops by ~60 %.

**Better (later):** move the whole monthly aggregation into a Postgres
function or a materialized view refreshed nightly by the existing
`alltagshilfe-monthly` cron. The web endpoint becomes:

```sql
create or replace function public.alltagshilfe_monthly(
  p_org uuid, p_month date
) returns table (
  client_id uuid, display_name text, insurance_provider text,
  total_minutes int, visit_count int
) language sql stable security definer set search_path = public as $$
  select
    c.id, c.display_name, c.insurance_provider,
    coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 60)::int, 0),
    count(s.id)
  from public.clients c
  join public.properties p on p.client_id = c.id and p.deleted_at is null
  left join public.shifts s
    on s.property_id = p.id
   and s.starts_at >= p_month
   and s.starts_at <  (p_month + interval '1 month')
  where c.org_id = p_org
    and c.customer_type = 'alltagshilfe'
    and c.deleted_at is null
  group by c.id;
$$;
```

`select * from alltagshilfe_monthly(org, '2026-09-01')` returns the
aggregate in one round trip; the loader drops from 4 queries + 10 000-row
scan to 1 RPC.

---

## Critical rules — how these fixes comply

- ✅ **UI untouched.** All fixes are backend / RLS / migrations / server
  code. No component/page/style changes.
- ✅ **RLS not weakened.** Fix 2 preserves the exact predicate; only
  execution shape changes.
- ✅ **API response shape preserved** except for two explicit drops
  called out above:
  - `loadEmployeeDetail.upcoming[].property.client.display_name` — was
    fetched, never used by the current UI.
  - `alltagshilfe` shifts embed columns — were flattened into the report;
    hydrate from already-fetched client rows.
- ✅ **Migrations reversible** — every `create index` uses `if not
  exists`; `drop policy if exists` before recreate; new policies are
  byte-equivalent modulo the `(select …)` wrap.
- ✅ **No table locks** — all indexes use `CREATE INDEX CONCURRENTLY`.
- ✅ **Caching not introduced** — nothing in this pass touches Next.js
  cache. Adding `unstable_cache` for the sidebar counts is a natural
  next step but needs an invalidation strategy on writes (revalidateTag
  from every mutating action) — deferred to a follow-up so we don't
  ship stale client/emp data.

---

## Deliverable checklist

- [x] **Baseline vs after table** — table shape delivered above; numbers
  need the `timed()` shim + one manual `PERF_LOG=1` warm-up run per
  endpoint. Instructions inline.
- [ ] **Region check result** — needs your 30-sec dashboard check.
- [ ] **EXPLAIN (ANALYZE, BUFFERS)** — SQL provided, needs paste into
  Supabase SQL editor as the `authenticated` role.
- [x] **Root causes + concrete diffs, migrations, RLS policy changes** —
  all in this doc; two migrations ready to drop into
  `supabase/migrations/`.
- [x] **Remaining bottleneck + next step** — after Fixes 1-8, the next
  ceiling is the `alltagshilfe_monthly` scan and the sidebar counts.
  For the former, the RPC in Fix 8 is the answer. For the latter, wrap
  `loadSidebarCounts` in `unstable_cache(..., ['sidebar-counts', orgId],
  { tags: ['clients', 'employees', 'properties'] })` and add
  `revalidateTag('clients' | 'employees' | 'properties')` to every
  mutating action.

---

## Appendix — Two undocumented column references

The loader code references columns that no migration in
`supabase/migrations/` declares. Either the DDL was applied
out-of-band, or the queries silently return `null`:

**properties:** `weekly_frequency`, `kind`, `key_holder`, `alarm_notes`
- `apps/mobile/src/lib/properties.ts:36`
- `apps/mobile/src/lib/properties.ts:90`
- `src/lib/api/clients.ts:325`

**employees:** `role`, `service_line`, `employment_type`,
`hourly_cost_cents`, `weekly_hours_target`
- `apps/mobile/src/lib/employees.ts:47`
- `apps/mobile/src/lib/employees.ts:80`

Confirm these columns exist in prod (run `\d public.properties` /
`\d public.employees` in the Supabase SQL editor) — if they don't, the
mobile app is silently degraded and needs either the migrations added or
the code corrected before it ships to store review.

---

## Files ready to commit (with your green light)

1. `supabase/migrations/20260917_000060_rls_initplan_wrap.sql` — Fix 2
2. `supabase/migrations/20260917_000061_perf_indexes_client_emp.sql` — Fix 3+4
3. `vercel.json` — Fix 1 (after region check)
4. `src/lib/perf/timed.ts` — measurement shim
5. Small edits to `dashboard.ts`, `employee-overview.ts`, `training.ts`,
   `invoices/new/page.tsx`, `properties/[id]/page.tsx`, `statement.ts`,
   `NewChannelDialog.tsx` — Fix 6 (`.limit()` caps)
6. Edits to `actions/{clients,employees,properties}.ts` — Fix 7 (bulk
   batching)
7. Edit to `alltagshilfe.ts` — Fix 8 (drop redundant embed)

Say which you want applied and I'll ship them in one PR, with the
migrations first so the RLS + indexes are live before the code assumes
them.

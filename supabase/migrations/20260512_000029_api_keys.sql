-- =============================================================================
-- 20260512_000029_api_keys.sql
--
-- API keys for the external REST surface at /api/v1.
--
-- Notes:
--   * Only the SHA-256 hash of the key is persisted — the raw key material
--     is shown to the operator exactly once at creation time and never
--     stored, so a leaked database row cannot be replayed against the API.
--   * `prefix` is the display-only first eight chars (e.g. "pk_live_") so
--     the UI can disambiguate keys without exposing them.
--   * `scopes` is a string[] of capability tokens — current vocabulary:
--       read:clients      read:properties      read:employees
--       read:shifts       read:invoices
--       write:clients     write:properties     write:employees
--       write:shifts      write:invoices
--   * RLS: only admins of the same org can read or mutate rows.
--
-- Idempotent — safe to re-run.
-- =============================================================================

create table if not exists public.api_keys (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null,
  prefix        text not null,
  hash          text not null,
  scopes        text[] not null default '{}'::text[],
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null
);

create unique index if not exists uniq_api_keys_hash on public.api_keys(hash);
create index if not exists idx_api_keys_org on public.api_keys(org_id);
create index if not exists idx_api_keys_active
  on public.api_keys(org_id)
  where revoked_at is null;

alter table public.api_keys enable row level security;

do $$ begin
  create policy "api_keys:read admin" on public.api_keys for select
    using (org_id = public.current_org_id() and public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "api_keys:insert admin" on public.api_keys for insert
    with check (org_id = public.current_org_id() and public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "api_keys:update admin" on public.api_keys for update
    using (org_id = public.current_org_id() and public.is_admin())
    with check (org_id = public.current_org_id() and public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "api_keys:delete admin" on public.api_keys for delete
    using (org_id = public.current_org_id() and public.is_admin());
exception when duplicate_object then null; end $$;

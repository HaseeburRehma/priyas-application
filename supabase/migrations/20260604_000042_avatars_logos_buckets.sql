-- Avatar + org-logo storage buckets
--
-- The Settings page needs working "Change photo" (per-user avatar)
-- and "Upload logo" (per-org logo) controls. The `profiles.avatar_url`
-- and `organizations.logo_url` text columns existed since migration
-- 000001 but nobody had wired storage. This adds both buckets and
-- the RLS policies that protect them.
--
-- Path conventions:
--   avatars/{user_id}/{timestamp}-{filename}
--   org-logos/{org_id}/{timestamp}-{filename}
--
-- Both buckets are PUBLIC because the URLs end up in <img src> tags
-- across the app (sidebar, member lists, invoices). Public reads with
-- non-guessable paths is the standard pattern for profile pictures in
-- Supabase — no signed URLs needed, the image won't appear unless the
-- consumer already has the `avatar_url` value from the row, which is
-- itself RLS-gated.
--
-- =============================================================================
-- IMPORTANT: PRIVILEGE NOTE
-- =============================================================================
-- The `storage.objects` table is owned by `supabase_storage_admin`. Creating
-- policies on it requires either:
--
--   (a) The `postgres` superuser role  → automatic when this migration runs
--       via the Supabase Dashboard SQL Editor or via `supabase db push`
--       through the official CLI.
--
--   (b) Membership in `supabase_storage_admin` → granted by default to the
--       Studio's session role.
--
-- If you're running this through a tool that connects as a more limited role
-- (e.g. a Postgres client logged in with the public schema's owner) you'll
-- see `ERROR: 42501: must be owner of relation objects`. The fix is to copy
-- this file's contents into the Supabase Dashboard SQL Editor and run it
-- there — the Studio uses the right role automatically.
--
-- The blocks below wrap each policy creation in EXCEPTION handling so that,
-- even when run with insufficient privileges, the bucket inserts at the top
-- still land (and you can recreate just the policies via the Studio
-- afterwards). It's not the happy path — best to use the Studio — but it
-- keeps a half-failed run recoverable.
-- =============================================================================

-- ---------- Buckets ----------
-- Buckets live in `storage.buckets`, which the migration role does have
-- write access to. These inserts succeed under both the postgres role
-- and the standard migration role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'avatars', 'avatars', true,
    5 * 1024 * 1024,                              -- 5 MB cap
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  )
  on conflict (id) do update set
    public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'org-logos', 'org-logos', true,
    2 * 1024 * 1024,                              -- 2 MB cap (logos are small)
    array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
  )
  on conflict (id) do update set
    public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------- Policies ----------
-- Each policy is wrapped in a `do $$` block with an EXCEPTION handler so
-- a missing-privilege error logs a NOTICE and continues. Re-run via the
-- Studio if any of these warnings appear.
--
-- Pattern per policy:
--   do $$
--   begin
--     drop policy if exists "<name>" on storage.objects;
--     create policy "<name>" on storage.objects ...;
--   exception when insufficient_privilege then
--     raise notice 'Skipped <name>: missing privilege on storage.objects';
--   end $$;

-- ----- avatars -----
do $$ begin
  drop policy if exists "avatars:read public" on storage.objects;
  create policy "avatars:read public" on storage.objects for select
    using (bucket_id = 'avatars');
exception when insufficient_privilege then
  raise notice 'Skipped avatars:read public — apply via Supabase Dashboard SQL Editor.';
end $$;

do $$ begin
  drop policy if exists "avatars:write self" on storage.objects;
  create policy "avatars:write self" on storage.objects for insert
    with check (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when insufficient_privilege then
  raise notice 'Skipped avatars:write self — apply via Supabase Dashboard SQL Editor.';
end $$;

do $$ begin
  drop policy if exists "avatars:update self" on storage.objects;
  create policy "avatars:update self" on storage.objects for update
    using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when insufficient_privilege then
  raise notice 'Skipped avatars:update self — apply via Supabase Dashboard SQL Editor.';
end $$;

do $$ begin
  drop policy if exists "avatars:delete self" on storage.objects;
  create policy "avatars:delete self" on storage.objects for delete
    using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when insufficient_privilege then
  raise notice 'Skipped avatars:delete self — apply via Supabase Dashboard SQL Editor.';
end $$;

-- ----- org-logos -----
do $$ begin
  drop policy if exists "org-logos:read public" on storage.objects;
  create policy "org-logos:read public" on storage.objects for select
    using (bucket_id = 'org-logos');
exception when insufficient_privilege then
  raise notice 'Skipped org-logos:read public — apply via Supabase Dashboard SQL Editor.';
end $$;

do $$ begin
  drop policy if exists "org-logos:write admin" on storage.objects;
  create policy "org-logos:write admin" on storage.objects for insert
    with check (
      bucket_id = 'org-logos'
      and (storage.foldername(name))[1] = public.current_org_id()::text
      and public.is_admin()
    );
exception when insufficient_privilege then
  raise notice 'Skipped org-logos:write admin — apply via Supabase Dashboard SQL Editor.';
end $$;

do $$ begin
  drop policy if exists "org-logos:update admin" on storage.objects;
  create policy "org-logos:update admin" on storage.objects for update
    using (
      bucket_id = 'org-logos'
      and (storage.foldername(name))[1] = public.current_org_id()::text
      and public.is_admin()
    );
exception when insufficient_privilege then
  raise notice 'Skipped org-logos:update admin — apply via Supabase Dashboard SQL Editor.';
end $$;

do $$ begin
  drop policy if exists "org-logos:delete admin" on storage.objects;
  create policy "org-logos:delete admin" on storage.objects for delete
    using (
      bucket_id = 'org-logos'
      and (storage.foldername(name))[1] = public.current_org_id()::text
      and public.is_admin()
    );
exception when insufficient_privilege then
  raise notice 'Skipped org-logos:delete admin — apply via Supabase Dashboard SQL Editor.';
end $$;

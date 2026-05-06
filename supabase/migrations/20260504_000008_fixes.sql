-- =============================================================================
-- 20260504_000008_fixes.sql
-- Two fixes:
--  1. Storage policies — recreate them with %s instead of %I so hyphenated
--     bucket names like "property-photos" don't get double-quoted.
--  2. Profile backfill — for any auth.users that don't have a public.profiles
--     row yet (e.g. signed up before 000004 marked the default org), insert
--     one attached to the default-signup org.
--  3. First-user-becomes-admin — promote the oldest user to admin so the
--     newly seeded org has at least one operator.
--  4. Chat membership re-backfill — make sure every profile is in #general
--     and any auto-created property channels.
-- Idempotent. Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Storage policies (replaces 000003's broken `do $$` block).
-- ---------------------------------------------------------------------------
do $$
declare
  b text;
begin
  foreach b in array array['property-photos','employee-docs','invoice-pdfs']
  loop
    -- %s here, not %I. Bucket names are literal strings we control; we
    -- still wrap the policy name in double-quotes so it survives the
    -- presence of a hyphen.
    execute format('drop policy if exists "%s:read org" on storage.objects', b);
    execute format($p$
      create policy "%s:read org" on storage.objects for select
      using (
        bucket_id = %L
        and (storage.foldername(name))[1] = public.current_org_id()::text
      )
    $p$, b, b);

    execute format('drop policy if exists "%s:write dispatcher" on storage.objects', b);
    execute format($p$
      create policy "%s:write dispatcher" on storage.objects for insert
      with check (
        bucket_id = %L
        and (storage.foldername(name))[1] = public.current_org_id()::text
        and public.is_dispatcher_or_admin()
      )
    $p$, b, b);

    execute format('drop policy if exists "%s:delete admin" on storage.objects', b);
    execute format($p$
      create policy "%s:delete admin" on storage.objects for delete
      using (
        bucket_id = %L
        and (storage.foldername(name))[1] = public.current_org_id()::text
        and public.is_admin()
      )
    $p$, b, b);
  end loop;
end $$;

-- chat-attachments has no hyphen issues but recreate for completeness.
drop policy if exists "chat:read members" on storage.objects;
create policy "chat:read members" on storage.objects for select
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

drop policy if exists "chat:write members" on storage.objects;
create policy "chat:write members" on storage.objects for insert
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- ---------------------------------------------------------------------------
-- 2) Backfill profiles for any auth.users without one.
-- ---------------------------------------------------------------------------
-- Resolve the org now so the insert is deterministic.
do $$
declare
  v_default_org uuid;
begin
  select org_id into v_default_org from public.settings
  where coalesce((data ->> 'is_default_signup_org')::boolean, false) = true
  limit 1;

  -- If no org has been marked default yet, fall back to the seeded one.
  if v_default_org is null then
    v_default_org := '00000000-0000-0000-0000-0000000000aa'::uuid;
  end if;

  -- Make sure it actually exists before we reference it.
  if not exists (select 1 from public.organizations where id = v_default_org) then
    insert into public.organizations (id, name, slug)
    values (v_default_org, 'Priya''s Reinigungsservice', 'priya')
    on conflict (id) do nothing;
  end if;

  insert into public.profiles (id, org_id, full_name, role, avatar_url)
  select
    u.id,
    v_default_org,
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      nullif(trim(coalesce(u.raw_user_meta_data ->> 'given_name', '') || ' ' ||
                  coalesce(u.raw_user_meta_data ->> 'family_name', '')), ''),
      split_part(u.email, '@', 1)
    ),
    coalesce(
      (u.raw_user_meta_data ->> 'role')::public.user_role,
      'employee'::public.user_role
    ),
    u.raw_user_meta_data ->> 'avatar_url'
  from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id)
  on conflict (id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Promote the oldest profile in the default org to admin if no admin yet.
--    This way the first signup gets operator access automatically.
-- ---------------------------------------------------------------------------
do $$
declare
  v_default_org uuid;
  v_first uuid;
begin
  select org_id into v_default_org from public.settings
  where coalesce((data ->> 'is_default_signup_org')::boolean, false) = true
  limit 1;
  if v_default_org is null then
    v_default_org := '00000000-0000-0000-0000-0000000000aa'::uuid;
  end if;

  if not exists (
    select 1 from public.profiles
    where org_id = v_default_org and role = 'admin' and deleted_at is null
  ) then
    select id into v_first from public.profiles
    where org_id = v_default_org and deleted_at is null
    order by created_at asc
    limit 1;

    if v_first is not null then
      update public.profiles
      set role = 'admin'
      where id = v_first;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Re-run chat membership backfill (idempotent — on conflict do nothing).
-- ---------------------------------------------------------------------------
insert into public.chat_members (channel_id, user_id, joined_at)
select c.id, p.id, now()
from public.chat_channels c
join public.profiles p
  on p.org_id = c.org_id and p.deleted_at is null
where c.is_direct = false
on conflict (channel_id, user_id) do nothing;

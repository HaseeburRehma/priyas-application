-- =============================================================================
-- 20260605_000047_bootstrap_default_org.sql
--
-- Self-healing migration that guarantees signup works on any environment:
--
--   1. Ensures a default organization always exists. If the seeded
--      `00000000-0000-0000-0000-0000000000aa` org is missing (because
--      seed.sql was never applied to this environment), insert it.
--
--   2. Ensures that org is flagged as the "default signup" target via
--      `settings.data.is_default_signup_org = true`. `default_signup_org_id()`
--      relies on this; without it the fallback to "lowest-id org" still
--      works, but being explicit makes intent clear and survives later
--      org additions.
--
--   3. Promotes the FIRST signed-up user to `admin` so the org has at
--      least one administrator. This unblocks self-serve setups where
--      a non-technical user signs up and finds themselves with no
--      navigation. Subsequent users land as `employee` per migration
--      000045/000046.
--
--   4. Backfills any auth.users without a public.profiles row, attaching
--      them to the default org. This fixes accounts created during the
--      window when `handle_new_user()` was silently failing on missing
--      org.
--
--   5. Backfills any public.profiles without a public.employees row so
--      every staff member can be referenced by shift / time-entry code.
--
-- Idempotent. Re-runnable safely.
-- =============================================================================

-- Use the seeded org id so the existing seed.sql + this migration agree
-- on a single anchor.
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000aa';
  v_org_count int;
  v_admin_count int;
begin
  -- ------------------------------------------------------------------
  -- 1. Ensure at least one organization exists.
  -- ------------------------------------------------------------------
  select count(*) into v_org_count from public.organizations;
  if v_org_count = 0 then
    -- Create the canonical seed org.
    insert into public.organizations (id, name, slug)
    values (v_org, 'Priya''s Reinigungsservice', 'priya')
    on conflict (id) do nothing;
    raise notice
      'bootstrap_default_org: created default organisation %', v_org;
  else
    -- An org already exists. If our canonical id isn't in there, pick
    -- the lowest-created one as the default signup anchor instead.
    if not exists (select 1 from public.organizations where id = v_org) then
      select o.id into v_org
        from public.organizations o
        order by o.created_at asc nulls last, o.id asc
        limit 1;
      raise notice
        'bootstrap_default_org: using existing organisation % as default', v_org;
    end if;
  end if;

  -- ------------------------------------------------------------------
  -- 2. Mark the chosen org as the default signup target.
  --
  -- `public.settings` is keyed by org_id (one row per org). We upsert
  -- the `is_default_signup_org` flag without disturbing any other
  -- settings already stored on the row.
  -- ------------------------------------------------------------------
  insert into public.settings (org_id, data)
  values (
    v_org,
    jsonb_build_object('is_default_signup_org', true)
  )
  on conflict (org_id) do update
    set data = jsonb_set(
      coalesce(public.settings.data, '{}'::jsonb),
      '{is_default_signup_org}',
      'true'::jsonb,
      true
    );

  -- Clear the flag on any other org so default_signup_org_id() returns
  -- exactly one row.
  update public.settings
     set data = data - 'is_default_signup_org'
   where org_id <> v_org
     and (data ->> 'is_default_signup_org')::boolean = true;

  -- ------------------------------------------------------------------
  -- 3. Backfill profiles for auth.users without a matching profile.
  --
  -- Anyone who signed up during the window when handle_new_user() was
  -- silently returning early (no org existed) ended up with an
  -- auth.users row but no profile. Repair them now. They land as
  -- `employee` for safety; step 4 below promotes the first signup
  -- to admin so the org has at least one administrator.
  -- ------------------------------------------------------------------
  insert into public.profiles (id, org_id, full_name, role)
  select
    au.id,
    v_org,
    coalesce(
      au.raw_user_meta_data ->> 'full_name',
      au.raw_user_meta_data ->> 'name',
      split_part(au.email, '@', 1)
    ),
    'employee'
  from auth.users au
  left join public.profiles p on p.id = au.id
  where p.id is null
  on conflict (id) do nothing;

  -- ------------------------------------------------------------------
  -- 4. Promote the earliest profile to admin if the org has none.
  --
  -- Without an admin nobody can promote anyone — the org is locked
  -- out of its own settings. We bootstrap by giving admin to whoever
  -- signed up first.
  -- ------------------------------------------------------------------
  select count(*) into v_admin_count
    from public.profiles
   where org_id = v_org
     and role = 'admin'
     and deleted_at is null;

  if v_admin_count = 0 then
    update public.profiles
       set role = 'admin'
     where id = (
       select p.id
         from public.profiles p
        where p.org_id = v_org and p.deleted_at is null
        order by p.created_at asc nulls last, p.id asc
        limit 1
     );
    raise notice
      'bootstrap_default_org: promoted earliest profile to admin in org %', v_org;
  end if;

  -- ------------------------------------------------------------------
  -- 5. Backfill employees rows for any profile without one.
  -- ------------------------------------------------------------------
  insert into public.employees (
    org_id, profile_id, full_name, email, phone, status, hire_date
  )
  select
    p.org_id,
    p.id,
    coalesce(p.full_name, split_part(au.email, '@', 1)),
    au.email,
    p.phone,
    'active',
    coalesce(p.created_at::date, current_date)
  from public.profiles p
  left join auth.users au on au.id = p.id
  where p.deleted_at is null
    and not exists (
      select 1 from public.employees e
       where e.profile_id = p.id and e.deleted_at is null
    )
  on conflict (profile_id) do nothing;
end $$;

comment on column public.settings.data is
  'Per-org settings JSONB. Notable keys: is_default_signup_org (boolean) — the org new self-serve signups are auto-attached to.';

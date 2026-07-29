-- =============================================================================
-- 20260724_000052_signup_hotfix.sql
--
-- HOTFIX for silent signup orphaning on production.
--
-- Root cause: `public.default_signup_org_id()` (defined in migration
-- 000004) was never applied to the deployed database. The trigger
-- `handle_new_user()` calls that function; the call threw
-- "function does not exist"; the outer `EXCEPTION WHEN OTHERS` block
-- (installed by 000046 as a safety net) swallowed the error and
-- returned. Result: every self-serve signup landed an `auth.users`
-- row but no `profiles` and no `employees`. gt@priyas.de was one
-- concrete victim, discovered manually.
--
-- This migration:
--   1. Re-creates `default_signup_org_id()` idempotently.
--   2. Re-installs the bulletproof `handle_new_user()` so the wiring
--      is definitely current.
--   3. Notifies PostgREST to reload its schema cache immediately (no
--      need to bounce the API).
--   4. Backfills every orphaned auth.users row that still has no
--      profile (attaches to the default org, role='employee').
--
-- Idempotent. Safe to run multiple times.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ensure default_signup_org_id() exists.
-- -----------------------------------------------------------------------------
create or replace function public.default_signup_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.org_id
  from public.settings s
  where coalesce((s.data ->> 'is_default_signup_org')::boolean, false) = true
  limit 1;
$$;

comment on function public.default_signup_org_id() is
  'Returns the org_id flagged as `is_default_signup_org` in settings, or NULL if none. Read by handle_new_user() to auto-attach self-serve signups to the right org.';

-- -----------------------------------------------------------------------------
-- 2. Guarantee at least one org is flagged as the default signup target.
--    Otherwise the function returns null and the trigger falls back to
--    the "lowest-id org" branch (installed by migration 000046). Being
--    explicit here makes intent survive future org additions.
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid;
begin
  -- Prefer the canonical seed org, else the oldest existing org.
  select id into v_org from public.organizations
   where id = '00000000-0000-0000-0000-0000000000aa';
  if v_org is null then
    select id into v_org from public.organizations
     order by created_at asc nulls last, id asc
     limit 1;
  end if;
  if v_org is null then
    -- No org at all — nothing to flag. handle_new_user() will still
    -- return cleanly; the app just can't attach anyone yet.
    raise notice 'signup_hotfix: no organizations exist yet — skipping default flag';
    return;
  end if;

  insert into public.settings (org_id, data)
  values (v_org, jsonb_build_object('is_default_signup_org', true))
  on conflict (org_id) do update
    set data = jsonb_set(
      coalesce(public.settings.data, '{}'::jsonb),
      '{is_default_signup_org}', 'true'::jsonb, true
    );

  -- Clear the flag on every other org so the function returns exactly one row.
  update public.settings
     set data = data - 'is_default_signup_org'
   where org_id <> v_org
     and (data ->> 'is_default_signup_org')::boolean = true;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Re-install the bulletproof handle_new_user() so the wiring is current.
--    Body identical to migration 000046 — pasted here so this hotfix is
--    self-contained and can be run without depending on any earlier
--    migration having reached production.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_name   text;
  v_email  text;
  v_phone  text;
  v_emp_id uuid;
begin
  begin
    -- Resolve org.
    v_org := public.default_signup_org_id();
    if v_org is null then
      select o.id
        into v_org
        from public.organizations o
        order by o.created_at asc nulls last, o.id asc
        limit 1;
    end if;

    if v_org is null then
      raise notice
        'handle_new_user: no organisation configured, user % left unattached',
        new.id;
      return new;
    end if;

    -- Resolve name + contact.
    v_name := coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      nullif(trim(coalesce(new.raw_user_meta_data ->> 'given_name', '') || ' ' ||
                  coalesce(new.raw_user_meta_data ->> 'family_name', '')), ''),
      split_part(new.email, '@', 1)
    );
    v_email := new.email;
    v_phone := new.raw_user_meta_data ->> 'phone';

    -- Profile insert.
    begin
      insert into public.profiles (id, org_id, full_name, role, avatar_url)
      values (
        new.id,
        v_org,
        v_name,
        'employee', -- SECURITY: never trust client-supplied role
        new.raw_user_meta_data ->> 'avatar_url'
      )
      on conflict (id) do nothing;
    exception when others then
      raise warning 'handle_new_user: profile insert failed for %: % (%)',
        new.id, sqlerrm, sqlstate;
    end;

    -- Employees row: claim any manager-created placeholder first.
    begin
      if v_email is not null then
        select id into v_emp_id
        from public.employees
        where org_id = v_org
          and lower(email) = lower(v_email)
          and profile_id is null
          and deleted_at is null
        limit 1;

        if v_emp_id is not null then
          update public.employees
          set
            profile_id = new.id,
            full_name  = case
              when v_name is null or v_name = split_part(new.email, '@', 1)
                then full_name
              else v_name
            end,
            phone      = coalesce(v_phone, phone),
            updated_at = now()
          where id = v_emp_id;
          return new;
        end if;
      end if;

      insert into public.employees (
        org_id, profile_id, full_name, email, phone, status, hire_date
      )
      values (
        v_org, new.id, v_name, v_email, v_phone, 'active', current_date
      )
      on conflict (profile_id) do nothing;
    exception when others then
      raise warning 'handle_new_user: employees insert failed for %: % (%)',
        new.id, sqlerrm, sqlstate;
    end;

    return new;

  exception when others then
    raise warning
      'handle_new_user: unexpected error for %: % (%). User signed up but profile/employees may be missing.',
      new.id, sqlerrm, sqlstate;
    return new;
  end;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 4. Force PostgREST to see the new function immediately. Without this,
--    the schema cache stays stale until the next natural reload.
-- -----------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- 5. Backfill: any auth.users without a profile → attach to the default
--    org with role='employee'. Same idea as migration 000047 step 3, run
--    here again in case that migration also never reached production.
-- -----------------------------------------------------------------------------
do $$
declare
  v_org uuid;
begin
  select public.default_signup_org_id() into v_org;
  if v_org is null then
    select o.id into v_org from public.organizations o
      order by o.created_at asc nulls last, o.id asc limit 1;
  end if;
  if v_org is null then
    raise notice 'signup_hotfix: no org to backfill against';
    return;
  end if;

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

comment on function public.handle_new_user() is
  'Signup bridge auth.users → profiles + employees. Bulletproof: inner side-writes wrapped in EXCEPTION so signup never fails on a downstream issue. Depends on default_signup_org_id().';

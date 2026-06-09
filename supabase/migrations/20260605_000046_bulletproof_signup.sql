-- =============================================================================
-- 20260605_000046_bulletproof_signup.sql
--
-- Last-mile fix for "Database error saving new user" during /register.
--
-- Background
-- ----------
-- A self-serve signup goes through this chain on the database side:
--
--   1. `auth.users` INSERT (from supabase.auth.signUp)
--   2. AFTER INSERT trigger on auth.users → public.handle_new_user()
--      → inserts into public.profiles
--      → inserts into public.employees
--   3. AFTER INSERT trigger on public.profiles → public.join_existing_channels()
--      → inserts into public.chat_members (one row per non-DM channel
--        in the user's org)
--
-- Any exception thrown anywhere in steps 2 or 3 aborts the auth.users
-- INSERT in step 1. The user sees the generic "Database error saving
-- new user" message with no useful detail.
--
-- Migration 000045 made the bodies of `handle_new_user` defensive, but
-- the AFTER trigger on profiles (`trg_profile_join_channels`) fires
-- *after* `handle_new_user` returns — so its failures still abort the
-- transaction. This migration makes EVERY trigger touched by signup
-- swallow its own errors and emit only a NOTICE / WARNING.
--
-- After this:
--   • profile row missing → signup still succeeds
--   • employees row missing → signup still succeeds
--   • chat_members rows missing → signup still succeeds
--   • Any unforeseen FK / RLS / constraint issue → signup still succeeds
--
-- Trade-off: a brand-new user might land with no chat channel
-- membership and need a manager backfill. That's strictly better than
-- not being able to sign up at all.
--
-- Idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. handle_new_user — fully bulletproof.
--    The entire body is wrapped in BEGIN/EXCEPTION so any error becomes
--    a NOTICE, never a transaction abort.
-- ---------------------------------------------------------------------------
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
  -- Outer exception wrapper: signup must succeed even if every line
  -- below fails. Backfill jobs (or a manager touch) can repair state.
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

    -- No org → no profile to create, but auth.users row is fine.
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

    -- Insert the profile row in its own try block so a single failure
    -- here doesn't abort the rest.
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

    -- Insert / claim the employees row.
    begin
      -- Step A: claim a manager-created placeholder by email match.
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

      -- Step B: fresh insert.
      insert into public.employees (
        org_id, profile_id, full_name, email, phone, status, hire_date
      )
      values (
        v_org,
        new.id,
        v_name,
        v_email,
        v_phone,
        'active',
        current_date
      )
      on conflict (profile_id) do nothing;
    exception when others then
      raise warning 'handle_new_user: employees insert failed for %: % (%)',
        new.id, sqlerrm, sqlstate;
    end;

    return new;

  exception when others then
    -- Catch-all: nothing in this function may abort the auth.users
    -- insert. The user can sign in; backfill will reconcile state.
    raise warning
      'handle_new_user: unexpected error for %: % (%). User has been signed up but profile/employees may be missing.',
      new.id, sqlerrm, sqlstate;
    return new;
  end;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. join_existing_channels — must not abort the profile insert.
--    This trigger fires AFTER INSERT on profiles. If it throws, the
--    profile insert (and indirectly the auth.users insert) rolls back.
-- ---------------------------------------------------------------------------
create or replace function public.join_existing_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.chat_members (channel_id, user_id, joined_at)
    select c.id, new.id, now()
    from public.chat_channels c
    where c.org_id = new.org_id and c.is_direct = false
    on conflict (channel_id, user_id) do nothing;
  exception when others then
    -- chat_members table missing, FK to a deleted channel, RLS denial,
    -- any of these — log and continue. The user can still log in and
    -- be added to channels later by an admin.
    raise warning
      'join_existing_channels: failed for profile %: % (%)',
      new.id, sqlerrm, sqlstate;
  end;
  return new;
end $$;

drop trigger if exists trg_profile_join_channels on public.profiles;
create trigger trg_profile_join_channels
  after insert on public.profiles
  for each row execute function public.join_existing_channels();

-- ---------------------------------------------------------------------------
-- 3. populate_channel_members — same defensive wrapping. Fires when a
--    new channel is created and adds every org member. Not on the
--    signup path, but the same failure-rollback hazard exists if it
--    ever runs as part of a side-effect during signup.
-- ---------------------------------------------------------------------------
create or replace function public.populate_channel_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.is_direct then
      return new;
    end if;
    insert into public.chat_members (channel_id, user_id, joined_at)
    select new.id, p.id, now()
    from public.profiles p
    where p.org_id = new.org_id
      and p.deleted_at is null
    on conflict (channel_id, user_id) do nothing;
  exception when others then
    raise warning
      'populate_channel_members: failed for channel %: % (%)',
      new.id, sqlerrm, sqlstate;
  end;
  return new;
end $$;

drop trigger if exists trg_channel_members on public.chat_channels;
create trigger trg_channel_members
  after insert on public.chat_channels
  for each row execute function public.populate_channel_members();

comment on function public.handle_new_user() is
  'Bulletproof signup bridge. All side-writes wrapped in exception handlers so signup cannot fail on a downstream issue. role=employee always; client-supplied values ignored.';

comment on function public.join_existing_channels() is
  'AFTER INSERT on profiles. Wrapped in exception handler so chat_members issues never abort signup.';

comment on function public.populate_channel_members() is
  'AFTER INSERT on chat_channels. Wrapped in exception handler so chat_members issues never abort the channel creation transaction.';

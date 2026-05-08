-- =============================================================================
-- 20260507_000028_employee_invite_link.sql
--
-- Improves handle_new_user() so that when an invited user accepts and an
-- `employees` row already exists for them (created by the manager via
-- createEmployeeAction with their email pre-filled), we LINK the profile
-- to that row instead of inserting a duplicate.
--
-- Flow:
--   1. Manager fills "Invite employee" form (name, email, weekly_hours…).
--   2. createEmployeeAction inserts an employees row with email set and
--      profile_id NULL.
--   3. Same action calls auth.admin.inviteUserByEmail(...) — Supabase
--      sends the invitee an email with a one-time signup link.
--   4. Invitee clicks the link → auth.users row created → this trigger
--      runs → looks for the existing employees row by email + null
--      profile_id → updates it with profile_id (and full_name if the
--      invitee changed it during signup).
--
-- If no matching employees row exists (e.g. signup outside the invite
-- flow), we fall back to the previous behaviour and insert a new row.
--
-- Idempotent. Safe to re-run.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org      uuid;
  v_name     text;
  v_role     public.user_role;
  v_email    text;
  v_phone    text;
  v_emp_id   uuid;
begin
  -- 1) explicit org_id in metadata wins
  v_org := nullif(new.raw_user_meta_data ->> 'org_id', '')::uuid;

  -- 2) otherwise fall back to the default signup org
  if v_org is null then
    v_org := public.default_signup_org_id();
  end if;

  if v_org is null then
    return new;
  end if;

  v_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'given_name', '') || ' ' ||
                coalesce(new.raw_user_meta_data ->> 'family_name', '')), ''),
    split_part(new.email, '@', 1)
  );

  v_role := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'employee');
  v_email := new.email;
  v_phone := new.raw_user_meta_data ->> 'phone';

  -- Profile row (existing behaviour).
  insert into public.profiles (id, org_id, full_name, role, avatar_url)
  values (
    new.id,
    v_org,
    v_name,
    v_role,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  -- Employees row.
  --
  -- Step A: see if a manager already created a placeholder row for this
  -- person (by matching email, in the same org, where profile_id is
  -- still null). If yes, claim it and stamp the auth identity onto it.
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
        -- The invitee may have entered a different name during signup;
        -- prefer the manager's placeholder unless the invitee provided
        -- something explicit and the placeholder fell back to email-prefix.
        full_name = case
          when v_name is null or v_name = split_part(new.email, '@', 1) then full_name
          else v_name
        end,
        phone = coalesce(v_phone, phone),
        updated_at = now()
      where id = v_emp_id;
      return new;
    end if;
  end if;

  -- Step B: no placeholder — fall back to inserting a fresh employees
  -- row (same as migration 000027 behaviour).
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

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

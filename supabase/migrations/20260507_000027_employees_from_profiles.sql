-- =============================================================================
-- 20260507_000027_employees_from_profiles.sql
--
-- Bridge `auth.users` / `public.profiles` ←→ `public.employees` so that
-- every signed-in user shows up as an employee record without manual
-- HR data entry. Two pieces:
--
--   1. handle_new_user() — extended to insert an `employees` row for
--      every newly-created profile (regardless of role; the role on the
--      profile drives RBAC, the employees row carries the HR/operations
--      metadata). Idempotent via ON CONFLICT.
--
--   2. Backfill — insert an `employees` row for every existing profile
--      that doesn't already have one. Uses `profile_id` as the join
--      key (employees.profile_id is UNIQUE).
--
-- After this migration, the user's 3 existing profiles will land in
-- the Employees page automatically. Future signups + Tablet onboarding
-- + Settings → Team invitations all funnel through here too.
-- =============================================================================

-- --------------------------------------------------------------------------
-- 1) Updated trigger: profile → matching employees row.
-- --------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org      uuid;
  v_name     text;
  v_role     public.user_role;
  v_email    text;
  v_phone    text;
  v_profile_exists boolean;
begin
  -- 1) explicit org_id in metadata wins
  v_org := nullif(new.raw_user_meta_data ->> 'org_id', '')::uuid;

  -- 2) otherwise fall back to the default signup org
  if v_org is null then
    v_org := public.default_signup_org_id();
  end if;

  -- If we still don't know what org to attach to, leave them unattached.
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

  -- Profiles row (existing behaviour).
  insert into public.profiles (id, org_id, full_name, role, avatar_url)
  values (
    new.id,
    v_org,
    v_name,
    v_role,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  -- Confirm the profile insert took (might be a duplicate trigger run).
  -- If the row already existed, we still want to upsert the employees
  -- record so existing users get fixed up too.
  select exists (select 1 from public.profiles where id = new.id)
    into v_profile_exists;
  if not v_profile_exists then
    return new;
  end if;

  -- New: matching employees row. UNIQUE (profile_id) prevents dupes.
  -- We default status to 'active' and leave HR fields (hourly_rate,
  -- weekly_hours, hire_date) NULL so the manager fills them in via
  -- /employees later.
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

-- --------------------------------------------------------------------------
-- 2) Backfill: every profile without a matching employees row gets one.
-- --------------------------------------------------------------------------
-- Uses email + phone from auth.users when available, falling back to
-- whatever's on the profiles row otherwise. Preserves any existing
-- employees rows untouched.
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
    where e.profile_id = p.id
      and e.deleted_at is null
  )
on conflict (profile_id) do nothing;

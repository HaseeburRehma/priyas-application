-- =============================================================================
-- 20260605_000045_handle_new_user_fix.sql
--
-- Fix two regressions in `handle_new_user()` that surface as "Database
-- error saving new user" during self-serve signup at /register:
--
--   1. **Regression from 000031** — when migration 000031 (`lock_signup_role`)
--      hardened the function against client-supplied role/org_id, it
--      accidentally dropped the `employees` row insert that 000027/000028
--      had added. Brand-new signups would land a `profiles` row but no
--      matching `employees` row. Anything that joins employees → profiles
--      (the schedule page, employees list, time-entries action) breaks
--      for that user thereafter.
--
--   2. **Trigger-side error propagation** — `handle_new_user()` runs after
--      the `auth.users` insert and any failure in it (a FK violation, an
--      RLS denial inside a side-trigger like `join_existing_channels`,
--      etc.) bubbles up as the generic "Database error saving new user"
--      message. The original auth.users insert is rolled back too,
--      leaving the would-be user unable to sign up at all.
--
-- This migration replaces the function with a version that:
--
--   a. Keeps the 000031 security guarantee: `role` is ALWAYS forced to
--      'employee' for self-serve signups; client-supplied values are
--      ignored.
--
--   b. Restores the `employees` row creation. Includes the
--      placeholder-claim logic from 000028 — if a manager pre-created
--      an employees row with the invitee's email (via the Settings →
--      Team → Invite flow), we link the new profile to that existing
--      row instead of inserting a duplicate.
--
--   c. Wraps each side-write in its own `EXCEPTION WHEN OTHERS` block.
--      A failure to write the employees row or join chat channels logs
--      a warning but does NOT abort the profile insert. The user can
--      sign in; a backfill job (or the next manager-touch) can clean
--      up the missing row. This is much safer than blocking signup.
--
-- Idempotent (`CREATE OR REPLACE FUNCTION`).
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      uuid;
  v_name     text;
  v_email    text;
  v_phone    text;
  v_emp_id   uuid;
begin
  -- ---------- 1. Resolve org_id (server-side; ignores client input) ----------
  -- Prefer the org explicitly flagged "is_default_signup_org" in settings.
  v_org := public.default_signup_org_id();

  -- Fallback: the lowest-id existing organisation. Single-tenant
  -- deployments will only have one row so this is unambiguous.
  if v_org is null then
    select o.id
      into v_org
      from public.organizations o
      order by o.created_at asc nulls last, o.id asc
      limit 1;
  end if;

  -- If there are no organisations at all we can't attach the user.
  -- Return without inserting — auth.users stays, but the user lands
  -- in a "not yet attached" state. An admin must set up an org first.
  if v_org is null then
    return new;
  end if;

  -- ---------- 2. Resolve human name + contact details ----------
  v_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'given_name', '') || ' ' ||
                coalesce(new.raw_user_meta_data ->> 'family_name', '')), ''),
    split_part(new.email, '@', 1)
  );
  v_email := new.email;
  v_phone := new.raw_user_meta_data ->> 'phone';

  -- ---------- 3. Insert the profile row ----------
  -- SECURITY: `role` is ALWAYS 'employee' for self-serve signups. The
  -- only way to become admin/dispatcher is via the Settings → Team
  -- admin UI, which is gated by requirePermission('settings.update').
  --
  -- Wrapped in EXCEPTION so a transient FK / RLS issue doesn't abort
  -- the whole auth.users insert. The auth row going through without
  -- a profile is recoverable; a hard-fail at signup is not.
  begin
    insert into public.profiles (id, org_id, full_name, role, avatar_url)
    values (
      new.id,
      v_org,
      v_name,
      'employee',
      new.raw_user_meta_data ->> 'avatar_url'
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user: profile insert failed for %: %', new.id, sqlerrm;
    -- Fall through; we still try to create the employees row if
    -- the profile somehow already exists from a previous attempt.
  end;

  -- ---------- 4. Insert / claim the employees row ----------
  -- Step A: see if a manager already pre-created an employees row
  -- for this email (Settings → Team → Invite flow). Match by email
  -- within the same org, only rows without a linked profile_id yet.
  -- If found, attach the new auth identity to it.
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
          full_name = case
            when v_name is null or v_name = split_part(new.email, '@', 1)
              then full_name
            else v_name
          end,
          phone = coalesce(v_phone, phone),
          updated_at = now()
        where id = v_emp_id;
        return new;  -- early exit — placeholder claimed
      end if;
    end if;

    -- Step B: no placeholder — insert a fresh row.
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
    -- Don't abort the signup over a missing employees row. The user
    -- can be cleaned up later via a backfill (see migration 000027
    -- for the existing backfill pattern).
    raise warning 'handle_new_user: employees insert failed for %: %', new.id, sqlerrm;
  end;

  return new;
end $$;

-- Re-bind the trigger to make sure it points at the new function body.
-- The trigger itself is unchanged shape-wise; we just need the new
-- function pointer.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Backfill: any auth.users that signed up between migrations 000031 and
-- this one will be missing their employees row. Walk profiles and
-- insert the missing rows so they show up correctly in the Employees
-- page from now on. Idempotent via the partial WHERE NOT EXISTS.
-- =============================================================================
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

comment on function public.handle_new_user() is
  'Bridge auth.users → profiles + employees. Forces role=employee on self-serve signup; resolves org server-side via settings.is_default_signup_org or the lowest-id org. Side-writes wrapped in EXCEPTION blocks so signup never fails on a downstream issue.';

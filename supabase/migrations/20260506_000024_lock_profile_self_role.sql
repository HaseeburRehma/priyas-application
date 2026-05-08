-- =============================================================================
-- 20260506_000024_lock_profile_self_role.sql
--
-- Security fix: prevent users from promoting themselves to admin.
--
-- Background
-- ----------
-- The original "profiles: own update" RLS policy in 000001_foundation.sql
-- allowed any signed-in user to UPDATE their own profiles row:
--
--     create policy "profiles: own update"
--       on public.profiles for update
--       using (id = auth.uid())
--       with check (id = auth.uid());
--
-- That policy has no column-level scope. A user could call
--   update profiles set role = 'admin' where id = auth.uid()
-- and gain full org access. RLS in Postgres has no native column-level
-- restriction, so we enforce the constraint with a BEFORE UPDATE trigger
-- instead. Admins keep their existing ability to update *anyone* (including
-- changing roles) via the separate "profiles: admin all in org" policy.
--
-- This migration is idempotent: it drops + recreates the trigger and
-- function on every run.
-- =============================================================================

create or replace function public.prevent_profile_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins can change anyone's role / org. Their UPDATEs are already gated
  -- by the "profiles: admin all in org" policy, so we don't need to guard
  -- those further here.
  if public.is_admin() then
    return new;
  end if;

  -- For all other callers: when they're updating *their own* row,
  -- the role and org_id columns must not change. Cross-row updates are
  -- already blocked by RLS, so this is a defence-in-depth check.
  if old.id = auth.uid() then
    if new.role is distinct from old.role then
      raise exception
        'profiles.role cannot be changed by the row owner (current: %, attempted: %)',
        old.role, new.role
        using errcode = '42501';
    end if;
    if new.org_id is distinct from old.org_id then
      raise exception
        'profiles.org_id cannot be changed by the row owner'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_prevent_self_role_escalation on public.profiles;
create trigger trg_prevent_self_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_self_role_escalation();

-- Sanity backfill: if any user has somehow already self-promoted to admin
-- since the original policy was deployed, surface them in the audit_log
-- without rolling back (manual review is safer than auto-demote).
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.profiles
  where role = 'admin' and deleted_at is null;
  if v_count > 0 then
    insert into public.audit_log (
      org_id, user_id, action, table_name, record_id, after
    )
    select
      org_id,
      null,
      'security.audit_admins',
      'profiles',
      id,
      jsonb_build_object(
        'message',
        'Existing admin profile observed at security migration 000024. ' ||
        'No automatic action taken; review manually.'
      )
    from public.profiles
    where role = 'admin' and deleted_at is null;
  end if;
end $$;

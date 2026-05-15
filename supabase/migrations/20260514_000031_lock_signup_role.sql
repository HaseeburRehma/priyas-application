-- =============================================================================
-- 20260514_000031_lock_signup_role.sql
-- SECURITY FIX (Privilege escalation via signup metadata)
--
-- The previous handle_new_user() trusted client-supplied raw_user_meta_data
-- for both `role` and `org_id`. A self-serve signup could therefore pick its
-- own admin role and target any organisation. This migration locks both
-- fields down server-side:
--
--   * `role` is ALWAYS forced to 'employee'. Promotion happens later through
--     the admin UI, which goes through requirePermission().
--   * `org_id` is resolved server-side. We prefer the explicit "default
--     signup org" flag stored on settings.data (see migration 000004), then
--     fall back to the lowest-id existing organisation. Client-supplied
--     org_id is IGNORED.
--
-- Idempotent (CREATE OR REPLACE FUNCTION).
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid;
  v_name  text;
  v_role  public.user_role;
begin
  -- 1) Prefer the org explicitly marked as "default signup" in settings.
  v_org := public.default_signup_org_id();

  -- 2) Otherwise fall back to the first existing organisation (deterministic
  --    by created_at, then id). Single-tenant deployments will only have one
  --    row so this is unambiguous.
  if v_org is null then
    select o.id
      into v_org
      from public.organizations o
      order by o.created_at asc nulls last, o.id asc
      limit 1;
  end if;

  -- If there's still no org we leave the auth user without a profile row;
  -- they'll be unable to use the app until an admin attaches them. This
  -- is intentional — better than silently creating an orphaned profile.
  if v_org is null then
    return new;
  end if;

  -- Resolve name from metadata or, for OAuth, the standard providers' fields.
  v_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'given_name', '') || ' ' ||
                coalesce(new.raw_user_meta_data ->> 'family_name', '')), ''),
    split_part(new.email, '@', 1)
  );

  -- SECURITY: ignore any client-supplied `role`. Self-serve signups are
  -- ALWAYS provisioned as 'employee'. Admins can promote afterwards.
  v_role := 'employee';

  insert into public.profiles (id, org_id, full_name, role, avatar_url)
  values (
    new.id,
    v_org,
    v_name,
    v_role,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end $$;

-- Re-bind the trigger to the latest function (drop+create is idempotent).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

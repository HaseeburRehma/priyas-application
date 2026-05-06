-- =============================================================================
-- 20260504_000004_oauth_signup.sql
-- Make handle_new_user() resilient: when a user signs up via Google OAuth,
-- raw_user_meta_data does not contain org_id. Fall back to the org marked
-- as the "default signup" org. Idempotent.
-- =============================================================================

-- Mark exactly one org as the default for self-serve signups. We use
-- settings.data.is_default_signup_org so we don't need a schema change.
update public.settings
set data = jsonb_set(coalesce(data, '{}'::jsonb), '{is_default_signup_org}', 'true'::jsonb)
where org_id = '00000000-0000-0000-0000-0000000000aa';

-- Helper: returns the default signup org id (or null if none configured).
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

-- Replace handle_new_user() with the resilient version.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid;
  v_name  text;
  v_role  public.user_role;
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

  -- Resolve name from metadata or, for OAuth, the standard providers' fields.
  v_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'given_name', '') || ' ' ||
                coalesce(new.raw_user_meta_data ->> 'family_name', '')), ''),
    split_part(new.email, '@', 1)
  );

  -- Default new accounts to the lowest role. Admins promote later.
  v_role := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'employee');

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

-- The trigger itself was created in the foundation migration; ensure it still
-- points at the latest function (drop+create is idempotent).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

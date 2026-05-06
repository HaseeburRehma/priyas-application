-- =============================================================================
-- 20260504_000006_chat_default_membership.sql
-- Make team channels actually populated:
--   * auto-add every org profile as a member of every non-DM channel in
--     their org (both directions: new channel → existing profiles, and new
--     profile → existing channels).
--   * seed a single "#general" channel for the default signup org.
-- Idempotent.
-- =============================================================================

-- Trigger: when a non-DM channel is created, add every profile in its org.
create or replace function public.populate_channel_members()
returns trigger language plpgsql security definer set search_path = public as $$
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
  return new;
end $$;

drop trigger if exists trg_channel_members on public.chat_channels;
create trigger trg_channel_members
  after insert on public.chat_channels
  for each row execute function public.populate_channel_members();

-- Trigger: when a profile is created, add them to every non-DM channel
-- already in their org. Combined with handle_new_user(), this means a brand
-- new user can sign up and immediately see #general + every property channel.
create or replace function public.join_existing_channels()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.chat_members (channel_id, user_id, joined_at)
  select c.id, new.id, now()
  from public.chat_channels c
  where c.org_id = new.org_id and c.is_direct = false
  on conflict (channel_id, user_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_profile_join_channels on public.profiles;
create trigger trg_profile_join_channels
  after insert on public.profiles
  for each row execute function public.join_existing_channels();

-- Seed: #general for the default signup org (idempotent — exists check).
do $$
declare
  v_org uuid;
  v_channel uuid;
begin
  select org_id into v_org from public.settings
  where coalesce((data ->> 'is_default_signup_org')::boolean, false) = true
  limit 1;
  if v_org is null then return; end if;

  select id into v_channel from public.chat_channels
  where org_id = v_org and name = '#general' and is_direct = false
  limit 1;

  if v_channel is null then
    insert into public.chat_channels (org_id, name, is_direct, created_by)
    values (v_org, '#general', false, null);
  end if;
end $$;

-- Backfill: ensure every existing profile is a member of every existing
-- non-DM channel in their org. Cheap one-shot for tiny seed datasets;
-- safe because of the on-conflict no-op.
insert into public.chat_members (channel_id, user_id, joined_at)
select c.id, p.id, now()
from public.chat_channels c
join public.profiles p
  on p.org_id = c.org_id and p.deleted_at is null
where c.is_direct = false
on conflict (channel_id, user_id) do nothing;

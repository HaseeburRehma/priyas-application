-- 000058's "members:read same channel" policy selected from chat_members inside
-- chat_members' own policy. Postgres rejects that with 42P17 (infinite
-- recursion) on every authenticated read of chat_members, and therefore of
-- chat_channels and chat_messages too, whose policies join chat_members.
-- A SECURITY DEFINER helper reads chat_members without re-entering RLS.

create or replace function public.is_chat_channel_member(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members
    where channel_id = p_channel_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_chat_channel_member(uuid) from public;
grant execute on function public.is_chat_channel_member(uuid) to authenticated;

drop policy if exists "members:read same channel" on public.chat_members;
create policy "members:read same channel" on public.chat_members for select
  using (public.is_chat_channel_member(channel_id));

create or replace function public.unread_chat_count(p_user_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(cnt), 0)::integer
  from (
    select count(*) as cnt
    from public.chat_members cm
    join public.chat_messages msg
      on msg.channel_id = cm.channel_id
      and msg.deleted_at is null
      and msg.user_id <> p_user_id
      and (cm.last_read_at is null or msg.created_at > cm.last_read_at)
      and msg.created_at > now() - interval '30 days'
    where cm.user_id = p_user_id
  ) sub;
$$;

grant execute on function public.unread_chat_count(uuid) to authenticated;
notify pgrst, 'reload schema';

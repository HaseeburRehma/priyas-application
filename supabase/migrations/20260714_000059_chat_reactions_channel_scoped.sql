-- =============================================================================
-- 20260714_000059_chat_reactions_channel_scoped.sql
--
-- `chat_message_reactions` RLS (20260504_000021_chat_overhaul.sql) is
-- scoped more loosely than the messages it reacts to:
--
--   * "chat_reactions:read same channel" only checks the parent message's
--     `org_id`, not actual channel membership — despite its name, it does
--     NOT verify the reader is a member of that message's channel. Any
--     authenticated org member can read reaction metadata (who reacted,
--     with what emoji, on which message_id) for messages in channels
--     they're not a member of — including a restricted channel like the
--     seeded "🔒 #geschaeftsleitung" one, whose whole point is that only
--     specific members can see anything happening in it.
--   * "chat_reactions:insert self" only checks `user_id = auth.uid()` —
--     no channel-membership check at all, unlike `"msg:write members"` on
--     chat_messages. Any authenticated user can attach a reaction to any
--     message_id in the org, including in channels they can't read.
--
-- Fix both to require actual membership in the reacted-to message's
-- channel, mirroring the `chat_messages` policies' shape exactly.
-- =============================================================================

drop policy if exists "chat_reactions:read same channel" on public.chat_message_reactions;
create policy "chat_reactions:read same channel" on public.chat_message_reactions for select
  using (
    exists (
      select 1
      from public.chat_messages m
      join public.chat_members cm on cm.channel_id = m.channel_id
      where m.id = chat_message_reactions.message_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists "chat_reactions:insert self" on public.chat_message_reactions;
create policy "chat_reactions:insert self" on public.chat_message_reactions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.chat_messages m
      join public.chat_members cm on cm.channel_id = m.channel_id
      where m.id = chat_message_reactions.message_id
        and cm.user_id = auth.uid()
    )
  );

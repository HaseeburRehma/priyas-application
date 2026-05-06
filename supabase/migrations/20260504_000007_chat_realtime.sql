-- =============================================================================
-- 20260504_000007_chat_realtime.sql
-- Enable Supabase Realtime publication for the chat tables so the browser
-- subscriptions in src/hooks/chat/useMessages.ts actually fire. Idempotent.
-- =============================================================================

do $$
begin
  -- Add chat_messages to the realtime publication.
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception when duplicate_object then null; end;

  -- Add chat_channels too — useful for "new channel created" toasts later.
  begin
    alter publication supabase_realtime add table public.chat_channels;
  exception when duplicate_object then null; end;

  -- And chat_members for unread-count invalidation.
  begin
    alter publication supabase_realtime add table public.chat_members;
  exception when duplicate_object then null; end;
end $$;

-- =============================================================================
-- 20260714_000058_chat_members_roster_read.sql
--
-- `"members:read self"` on `chat_members` (20260504_000002_domain.sql:375-377)
-- only allows a row where `user_id = auth.uid()` — a non-manager can read
-- their OWN membership row but not their channel co-members'. This has a
-- real, currently-shipping consequence beyond just "no roster UI": in
-- `createOrGetDirectChannelAction` (src/app/actions/chat-channels.ts), the
-- "does a DM with this person already exist" check does
--   select id, members:chat_members ( user_id ) from chat_channels
--     where is_direct = true
-- and then looks for a row whose embedded `members` set contains both
-- participant ids. Under the self-only policy, that embedded select can
-- only ever return the CALLER's own membership row per channel (never the
-- other participant's), so for any non-admin/dispatcher user the set size
-- is always 1, the "already exists" check can never match, and clicking
-- "message" on the same coworker repeatedly creates a fresh duplicate DM
-- channel every time instead of reopening the existing one. (Admins/
-- dispatchers were incidentally unaffected — `"members:admin manage"` is a
-- `for all` policy that already grants them unrestricted select.)
--
-- Fix: let a member of a channel read every membership row for that same
-- channel, not just their own — the same self-referencing-subquery shape
-- already used for `chat_message_reactions` elsewhere in this schema.
-- This doesn't expose anything a member couldn't already infer from the
-- channel's message senders; it was an accidental omission, not a
-- deliberate privacy boundary.
-- =============================================================================

drop policy if exists "members:read self" on public.chat_members;
create policy "members:read same channel" on public.chat_members for select
  using (
    exists (
      select 1 from public.chat_members m2
      where m2.channel_id = chat_members.channel_id
        and m2.user_id = auth.uid()
    )
  );

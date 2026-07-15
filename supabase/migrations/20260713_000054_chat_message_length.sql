-- =============================================================================
-- 20260713_000054_chat_message_length.sql
--
-- `chat_messages.body` had no length bound at all — a single message
-- could be megabytes of text, which every subscriber's realtime channel
-- then has to receive in full. The client (Composer.tsx / useSendMessage)
-- now caps input at 8000 characters, but that's not a substitute for a
-- DB-level bound: any other writer (a future API route, a script, a bug
-- in a different call site) could still insert an unbounded row. Belt and
-- suspenders — add the same cap as a CHECK constraint.
--
-- Idempotent: `add constraint if not exists` requires PG 15+ for CHECK,
-- so we guard with a catalog check instead for broader compatibility.
--
-- Added `not valid`: there was no cap at all before today, so it's
-- possible a message inserted before the client-side 8000-char limit
-- existed is already longer than that. `add constraint` without `not
-- valid` validates every existing row and would abort this migration
-- outright on the first oversized one. `not valid` enforces the check on
-- all new/updated rows immediately but skips validating history, which
-- is what we actually want here — belt-and-suspenders against *future*
-- unbounded writes, not a retroactive data-integrity sweep.
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_body_length_chk'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table public.chat_messages
      add constraint chat_messages_body_length_chk
      check (char_length(body) <= 8000) not valid;
  end if;
end $$;

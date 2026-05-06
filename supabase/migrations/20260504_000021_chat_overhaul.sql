-- =============================================================================
-- Chat overhaul: channel kinds, descriptions, privacy, reactions, pinned
-- messages. Adds the surface needed by the redesigned chat UI.
-- =============================================================================

-- ---- chat_channels: kind + description + is_private + slug -----------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'chat_channels' and column_name = 'kind'
  ) then
    alter table public.chat_channels
      add column kind text not null default 'channel'
        check (kind in ('channel', 'direct', 'group'));
  end if;
end $$;

alter table public.chat_channels
  add column if not exists description text,
  add column if not exists is_private boolean not null default false,
  add column if not exists slug text,
  add column if not exists topic text;

-- Slug is filled from name; we keep it nullable so the trigger has time to
-- backfill on insert.
create unique index if not exists uniq_chat_channels_org_slug
  on public.chat_channels(org_id, slug) where slug is not null;

create or replace function public.chat_channels_set_slug()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.slug is null then
    new.slug := lower(regexp_replace(coalesce(new.name, ''), '[^a-z0-9]+', '-', 'gi'));
  end if;
  return new;
end $$;

drop trigger if exists trg_chat_channels_set_slug on public.chat_channels;
create trigger trg_chat_channels_set_slug
  before insert or update on public.chat_channels
  for each row execute function public.chat_channels_set_slug();

-- ---- chat_message_reactions ------------------------------------------------
create table if not exists public.chat_message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists idx_chat_reactions_message on public.chat_message_reactions(message_id);

alter table public.chat_message_reactions enable row level security;

drop policy if exists "chat_reactions:read same channel" on public.chat_message_reactions;
create policy "chat_reactions:read same channel" on public.chat_message_reactions for select
  using (
    exists (
      select 1
      from public.chat_messages m
      where m.id = chat_message_reactions.message_id
        and m.org_id = public.current_org_id()
    )
  );

drop policy if exists "chat_reactions:insert self" on public.chat_message_reactions;
create policy "chat_reactions:insert self" on public.chat_message_reactions for insert
  with check (user_id = auth.uid());

drop policy if exists "chat_reactions:delete self" on public.chat_message_reactions;
create policy "chat_reactions:delete self" on public.chat_message_reactions for delete
  using (user_id = auth.uid());

-- ---- chat_pinned_messages --------------------------------------------------
create table if not exists public.chat_pinned_messages (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  pinned_by  uuid references public.profiles(id),
  pinned_at  timestamptz not null default now(),
  primary key (channel_id, message_id)
);
create index if not exists idx_chat_pins_channel on public.chat_pinned_messages(channel_id, pinned_at desc);

alter table public.chat_pinned_messages enable row level security;

drop policy if exists "chat_pins:read same org" on public.chat_pinned_messages;
create policy "chat_pins:read same org" on public.chat_pinned_messages for select
  using (
    exists (
      select 1 from public.chat_channels c
      where c.id = chat_pinned_messages.channel_id
        and c.org_id = public.current_org_id()
    )
  );

drop policy if exists "chat_pins:write member" on public.chat_pinned_messages;
create policy "chat_pins:write member" on public.chat_pinned_messages for insert
  with check (
    exists (
      select 1 from public.chat_members m
      where m.channel_id = chat_pinned_messages.channel_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "chat_pins:delete member" on public.chat_pinned_messages;
create policy "chat_pins:delete member" on public.chat_pinned_messages for delete
  using (
    exists (
      select 1 from public.chat_members m
      where m.channel_id = chat_pinned_messages.channel_id
        and m.user_id = auth.uid()
    )
  );

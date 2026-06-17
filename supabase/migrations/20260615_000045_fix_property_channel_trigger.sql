-- Fix property chat-channel trigger to handle duplicates gracefully.
-- Without ON CONFLICT DO NOTHING, creating a property with the same name twice
-- would fail with a unique constraint violation on chat_channels.slug.

create or replace function public.create_property_chat_channel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.chat_channels (org_id, name, is_direct, created_by)
  values (new.org_id, '#prop-' || left(new.name, 60), false, null)
  on conflict do nothing;
  return new;
end $$;

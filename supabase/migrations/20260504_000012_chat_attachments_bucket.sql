-- =============================================================================
-- chat-attachments storage bucket — for photos and voice notes inside chat.
-- =============================================================================
-- Path convention: <org_id>/<channel_id>/<random>.<ext>
-- Bucket is private; thread renderer creates short-lived signed URLs.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', false, 26214400) -- 25 MB
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- ----- RLS for storage.objects -----
do $$
declare bucket_name text := 'chat-attachments';
begin
  -- read: any signed-in member of the same org as the path's org prefix
  execute format(
    'drop policy if exists %s on storage.objects',
    quote_ident('chat-attachments:read org')
  );
  execute $p$
    create policy "chat-attachments:read org" on storage.objects for select
    using (
      bucket_id = 'chat-attachments'
      and (storage.foldername(name))[1]::uuid = public.current_org_id()
    )
  $p$;

  -- write: same org (any role) — anyone who can post in chat can attach
  execute format(
    'drop policy if exists %s on storage.objects',
    quote_ident('chat-attachments:write org')
  );
  execute $p$
    create policy "chat-attachments:write org" on storage.objects for insert
    with check (
      bucket_id = 'chat-attachments'
      and (storage.foldername(name))[1]::uuid = public.current_org_id()
    )
  $p$;

  -- delete: admin or dispatcher only — for moderation
  execute format(
    'drop policy if exists %s on storage.objects',
    quote_ident('chat-attachments:delete dispatcher')
  );
  execute $p$
    create policy "chat-attachments:delete dispatcher" on storage.objects for delete
    using (
      bucket_id = 'chat-attachments'
      and (storage.foldername(name))[1]::uuid = public.current_org_id()
      and public.is_dispatcher_or_admin()
    )
  $p$;
end $$;

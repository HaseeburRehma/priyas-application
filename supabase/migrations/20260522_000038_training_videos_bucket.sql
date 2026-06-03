-- =============================================================================
-- Training-video storage bucket
-- -----------------------------------------------------------------------------
-- Public bucket for the videos that field staff watch as part of mandatory
-- onboarding (spec §4.9). Public on purpose — every signed-in field staff
-- needs to stream them and per-request signed URLs add latency for what is
-- non-sensitive instructional content.
--
-- RLS:
--   • read  → anyone (public assets)
--   • write → only signed-in admin/dispatcher (matches training.manage perm)
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-videos',
  'training-videos',
  true,
  524288000,                                                 -- 500 MB
  array['video/mp4','video/webm','video/quicktime','video/ogg']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Read policy: public bucket, but be explicit anyway so it survives
-- accidentally flipping `public = false` later.
drop policy if exists training_videos_read_any on storage.objects;
create policy training_videos_read_any
  on storage.objects
  for select
  using (bucket_id = 'training-videos');

-- Write policy: only admins/dispatchers may upload. The path prefix must
-- match the caller's org_id so a malicious PM can't drop videos into
-- another org's prefix.
drop policy if exists training_videos_write_manager on storage.objects;
create policy training_videos_write_manager
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'training-videos'
    and (select role from public.profiles where id = auth.uid()) in ('admin','dispatcher')
    and (storage.foldername(name))[1]
        = (select org_id::text from public.profiles where id = auth.uid())
  );

drop policy if exists training_videos_delete_manager on storage.objects;
create policy training_videos_delete_manager
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'training-videos'
    and (select role from public.profiles where id = auth.uid()) in ('admin','dispatcher')
    and (storage.foldername(name))[1]
        = (select org_id::text from public.profiles where id = auth.uid())
  );

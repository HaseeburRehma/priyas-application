-- =============================================================================
-- Storage MIME/size hardening — security review follow-up.
--
-- Findings this closes:
--
--   1. `chat-attachments` had no `allowed_mime_types`. The UI's file picker
--      only offers image/audio/video/pdf/doc/txt (`accept=` in
--      Composer.tsx), but that attribute is a hint only — nothing stopped a
--      direct SDK call from uploading arbitrary bytes with
--      `contentType: "text/html"`. Chat renders attachments as
--      `target="_blank"` links straight to the signed storage URL, so an
--      attacker-chosen `Content-Type: text/html` would have the browser
--      render (and execute) arbitrary HTML/JS when a colleague opens it —
--      a stored-XSS vector scoped to the storage origin. The allowlist
--      below matches the UI's own `accept=` list.
--
--   2. `property-photos` — referenced throughout the app (property photo
--      upload, damage-report photos, tablet onboarding capture — all
--      `accept="image/*"`) — turned out to have NO ROW in storage.buckets
--      at all on this project, despite migration 000003 declaring it and
--      RLS policies already existing for it (policies can reference a
--      bucket_id that has no matching bucket row yet). Every upload to
--      this bucket has been failing outright. Fixed by creating the
--      bucket with an image-only MIME allowlist and a size cap; the
--      pre-existing RLS policies (read org / write dispatcher / delete
--      admin+dispatcher) apply to it immediately once the row exists.
--
--   3. `property-documents` (used by CleaningConceptCard for the PDF
--      cleaning-concept upload) had a size cap but no MIME allowlist at
--      all — restricted to `application/pdf` to match its actual use.
--
--   4. `org-logos` (a PUBLIC bucket) allowed `image/svg+xml`. SVG can
--      embed <script>/event handlers; today the app only renders
--      `logo_url` via <img>/next Image (which neutralizes that), but the
--      object is publicly browsable at its raw storage URL regardless —
--      opening it directly would execute any embedded script. Logos are
--      realistically always raster images, so SVG support wasn't worth
--      the risk. Matching change in LOGO_MIME_ALLOW
--      (src/app/actions/uploads.ts) and the `accept=` attribute in
--      LogoUpload.tsx.
--
-- Note: migration 000003 also declared `employee-docs` and `invoice-pdfs`
-- buckets, but grep found zero references to either bucket id anywhere in
-- the app — they were never wired to a feature and don't exist as bucket
-- rows either. Left alone; nothing to harden since nothing uploads there.
-- =============================================================================

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/webm', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/wav',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]
where id = 'chat-attachments';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-photos',
  'property-photos',
  false,
  15728640, -- 15 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

update storage.buckets
set allowed_mime_types = array['application/pdf']
where id = 'property-documents';

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'org-logos';

-- RLS for property-photos. A "delete admin" policy already existed
-- (created ahead of the bucket row, which Postgres allows), so this only
-- adds the read/write/delete-dispatcher policies that were missing —
-- without them the bucket would have been readable/writable by no one at
-- all despite now existing.
do $$
declare b text := 'property-photos';
begin
  execute format('drop policy if exists "%s:read org" on storage.objects', b);
  execute format($p$
    create policy "%s:read org" on storage.objects for select
    using (
      bucket_id = %L
      and (storage.foldername(name))[1] = public.current_org_id()::text
    )
  $p$, b, b);

  execute format('drop policy if exists "%s:write dispatcher" on storage.objects', b);
  execute format($p$
    create policy "%s:write dispatcher" on storage.objects for insert
    with check (
      bucket_id = %L
      and (storage.foldername(name))[1] = public.current_org_id()::text
      and public.is_dispatcher_or_admin()
    )
  $p$, b, b);

  execute format('drop policy if exists "%s:delete dispatcher" on storage.objects', b);
  execute format($p$
    create policy "%s:delete dispatcher" on storage.objects for delete
    using (
      bucket_id = %L
      and (storage.foldername(name))[1] = public.current_org_id()::text
      and public.is_dispatcher_or_admin()
    )
  $p$, b, b);
end $$;

-- =============================================================================
-- property-documents storage bucket — PDFs (cleaning concepts, contracts).
-- =============================================================================
-- Path convention: <org_id>/<property_id>/<random>.pdf
-- Private bucket; signed URLs handed out from the server.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('property-documents', 'property-documents', false, 26214400) -- 25 MB
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

do $$
declare bucket_name text := 'property-documents';
begin
  execute format(
    'drop policy if exists %s on storage.objects',
    quote_ident('property-documents:read org')
  );
  execute $p$
    create policy "property-documents:read org" on storage.objects for select
    using (
      bucket_id = 'property-documents'
      and (storage.foldername(name))[1]::uuid = public.current_org_id()
    )
  $p$;

  execute format(
    'drop policy if exists %s on storage.objects',
    quote_ident('property-documents:write dispatcher')
  );
  execute $p$
    create policy "property-documents:write dispatcher" on storage.objects for insert
    with check (
      bucket_id = 'property-documents'
      and (storage.foldername(name))[1]::uuid = public.current_org_id()
      and public.is_dispatcher_or_admin()
    )
  $p$;

  execute format(
    'drop policy if exists %s on storage.objects',
    quote_ident('property-documents:delete dispatcher')
  );
  execute $p$
    create policy "property-documents:delete dispatcher" on storage.objects for delete
    using (
      bucket_id = 'property-documents'
      and (storage.foldername(name))[1]::uuid = public.current_org_id()
      and public.is_dispatcher_or_admin()
    )
  $p$;
end $$;

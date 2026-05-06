-- =============================================================================
-- 20260504_000003_storage.sql
-- Storage buckets + access policies. Idempotent.
-- =============================================================================

-- Buckets ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('property-photos', 'property-photos', false)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('employee-docs', 'employee-docs', false)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('invoice-pdfs', 'invoice-pdfs', false)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('chat-attachments', 'chat-attachments', false)
  on conflict (id) do nothing;

-- Access policies. Path convention: <org_id>/<...> ---------------------------
-- Read: anyone in the org (path prefix matches their org_id).
-- Write: dispatcher/admin only.
-- (Chat attachments allow any member to write since chat is more interactive.)

do $$
declare
  b text;
begin
  foreach b in array array['property-photos','employee-docs','invoice-pdfs']
  loop
    -- Use %s not %I — bucket names like "property-photos" contain a hyphen,
    -- which would otherwise be double-quoted by %I and break the policy
    -- name (zero-length delimited identifier error).
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

    execute format('drop policy if exists "%s:delete admin" on storage.objects', b);
    execute format($p$
      create policy "%s:delete admin" on storage.objects for delete
      using (
        bucket_id = %L
        and (storage.foldername(name))[1] = public.current_org_id()::text
        and public.is_admin()
      )
    $p$, b, b);
  end loop;
end $$;

drop policy if exists "chat:read members" on storage.objects;
create policy "chat:read members" on storage.objects for select
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

drop policy if exists "chat:write members" on storage.objects;
create policy "chat:write members" on storage.objects for insert
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- =============================================================================
-- 20260804_000055_alltagshelfer_intake.sql
--
-- Priya's Alltagshelfer intake support.
--
--   1. Extends `public.clients` with columns the paper Kunden-Erfassungs-
--      bogen captures (salutation, customer_number, payer_type,
--      legal_rep_name / _phone, desired_services[], billing_type,
--      preferred_hours_per_week, preferred_days[], preferred_times,
--      conversation_notes).
--   2. Adds `public.client_documents` — a per-customer file cabinet
--      mirroring the paper folders the Alltagshelfer team keeps today.
--   3. Adds a `client-documents` storage bucket (org-scoped, RLS-gated).
--   4. Imports the 30 Alltagshelfer customers from Kundendatenliste
--      Alltagshelfer.xlsx as `customer_type = 'alltagshilfe'`, each
--      with a matching properties row so shifts can reference them.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New client columns.
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists salutation             text,
  add column if not exists customer_number        text,
  add column if not exists payer_type             text,
  add column if not exists legal_rep_name         text,
  add column if not exists legal_rep_phone        text,
  add column if not exists desired_services       text[] not null default '{}',
  add column if not exists billing_type           text,
  add column if not exists preferred_hours_per_week numeric,
  add column if not exists preferred_days         text[] not null default '{}',
  add column if not exists preferred_times        text,
  add column if not exists conversation_notes     text;

-- Payer-type check: constrain to the four values we recognise.
-- Existing NULLs (all rows before this migration) stay valid.
do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'clients_payer_type_check'
  ) then
    alter table public.clients
      add constraint clients_payer_type_check
      check (payer_type is null
             or payer_type in ('care_fund','private_pay','insurance','commercial'));
  end if;
end $$;

-- Billing-type check: intake form asks §45b / §39 / both.
do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'clients_billing_type_check'
  ) then
    alter table public.clients
      add constraint clients_billing_type_check
      check (billing_type is null
             or billing_type in ('paragraph_45b','paragraph_39','both'));
  end if;
end $$;

-- Customer number unique per org (nullable — legacy clients have none).
create unique index if not exists uniq_clients_customer_number_per_org
  on public.clients (org_id, customer_number)
  where customer_number is not null and deleted_at is null;

comment on column public.clients.payer_type is
  'How the customer pays: care_fund (Pflegekasse), private_pay (Selbstzahler), insurance (Krankenkasse), commercial. Drives billing-source chip on the client card.';
comment on column public.clients.billing_type is
  'For Alltagshilfe customers: paragraph_45b (Entlastungsbetrag §45b SGB XI) / paragraph_39 (Verhinderungspflege §39) / both.';
comment on column public.clients.desired_services is
  'Multi-select from the paper intake form: hauswirtschaft, einkaufen, wohnungsreinigung, behoerdengaenge, treppenhausreinigung, begleitung, waeschepflege, mahlzeiten, sonstige, spaziergaenge.';

-- ---------------------------------------------------------------------------
-- 2. client_documents table.
-- ---------------------------------------------------------------------------
create table if not exists public.client_documents (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade,
  uploaded_by    uuid references auth.users(id) on delete set null,

  -- User-visible metadata.
  name           text not null,
  category       text not null default 'other',
  notes          text,

  -- Storage descriptor.
  storage_path   text not null,        -- e.g. '<client_id>/<timestamp>-<rand>.<ext>'
  mime_type      text,
  size_bytes     bigint,

  uploaded_at    timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists idx_client_docs_client
  on public.client_documents (client_id, uploaded_at desc)
  where deleted_at is null;
create index if not exists idx_client_docs_org
  on public.client_documents (org_id, uploaded_at desc)
  where deleted_at is null;

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'client_documents_category_check'
  ) then
    alter table public.client_documents
      add constraint client_documents_category_check
      check (category in ('contract','form','decision','id_card','invoice','photo','other'));
  end if;
end $$;

alter table public.client_documents enable row level security;

-- RLS: anyone in the same org can read; only admin + dispatcher can write.
drop policy if exists client_docs_read on public.client_documents;
create policy client_docs_read
  on public.client_documents for select
  using (
    org_id = public.current_org_id()
    and deleted_at is null
  );

drop policy if exists client_docs_write on public.client_documents;
create policy client_docs_write
  on public.client_documents for insert
  with check (
    org_id = public.current_org_id()
    and public.is_admin_or_dispatcher()
  );

drop policy if exists client_docs_update on public.client_documents;
create policy client_docs_update
  on public.client_documents for update
  using (
    org_id = public.current_org_id()
    and public.is_admin_or_dispatcher()
  );

-- Helper (idempotent): admin OR dispatcher role. Written here so the
-- migration is self-contained if the helper doesn't exist yet.
create or replace function public.is_admin_or_dispatcher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role in ('admin','dispatcher')
       and deleted_at is null
  );
$$;

grant execute on function public.is_admin_or_dispatcher() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Storage bucket for client documents.
--    Non-public: files require a signed URL (client documents are PII).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-documents',
  'client-documents',
  false,
  50 * 1024 * 1024,                       -- 50 MB per doc — plenty for scans
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public             = excluded.public;

-- Storage policies. First folder segment is the org_id — cross-org
-- reads/writes are blocked by RLS.
do $$ begin
  drop policy if exists "client-docs:read same-org" on storage.objects;
  create policy "client-docs:read same-org" on storage.objects for select
    using (
      bucket_id = 'client-documents'
      and (storage.foldername(name))[1] = public.current_org_id()::text
    );
exception when insufficient_privilege then
  raise notice 'skipped client-docs read policy — apply via Studio if needed';
end $$;

do $$ begin
  drop policy if exists "client-docs:write manager" on storage.objects;
  create policy "client-docs:write manager" on storage.objects for insert
    with check (
      bucket_id = 'client-documents'
      and (storage.foldername(name))[1] = public.current_org_id()::text
      and public.is_admin_or_dispatcher()
    );
exception when insufficient_privilege then
  raise notice 'skipped client-docs write policy — apply via Studio if needed';
end $$;

do $$ begin
  drop policy if exists "client-docs:delete manager" on storage.objects;
  create policy "client-docs:delete manager" on storage.objects for delete
    using (
      bucket_id = 'client-documents'
      and (storage.foldername(name))[1] = public.current_org_id()::text
      and public.is_admin_or_dispatcher()
    );
exception when insufficient_privilege then
  raise notice 'skipped client-docs delete policy — apply via Studio if needed';
end $$;

-- Refresh PostgREST cache so new columns show up immediately.
notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- 4. Import the 31 Alltagshelfer customers.
--
-- Each row becomes a client (customer_type='alltagshilfe') AND a matching
-- property (same address) so shifts can reference the location.
-- Idempotent via ON CONFLICT (org_id, customer_number).
-- ---------------------------------------------------------------------------

do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000aa';
  v_client_id uuid;
begin

  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;


  -- —
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', '—',
    null, null,
    null, null,
    null, null,
    null,
    null, null, null, 'DE',
    null, null,
    false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
      display_name        = excluded.display_name,
      first_name          = excluded.first_name,
      last_name           = excluded.last_name,
      salutation          = excluded.salutation,
      email               = excluded.email,
      phone               = excluded.phone,
      date_of_birth       = excluded.date_of_birth,
      address_line1       = excluded.address_line1,
      postal_code         = excluded.postal_code,
      city                = excluded.city,
      insurance_provider  = excluded.insurance_provider,
      insurance_number    = excluded.insurance_number,
      abtretungserklaerung = excluded.abtretungserklaerung,
      payer_type          = excluded.payer_type
  returning id into v_client_id;

  -- Matching property row so shifts can reference this address.
  -- Only insert if this client doesn't already have one — the intake
  -- form assumes one address per Alltagshilfe customer.
  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, '—',
      null, null, null, 'DE'
    );
  end if;

end $$;

-- Sanity check.
select count(*) filter (where customer_type = 'alltagshilfe') as alltagshilfe_count,
       count(*) filter (where payer_type = 'care_fund') as care_fund_count,
       count(*) filter (where payer_type = 'private_pay') as private_pay_count
  from public.clients where org_id = '00000000-0000-0000-0000-0000000000aa' and deleted_at is null;
-- ============================================================================
-- 20260804_000056_alltagshelfer_real_import.sql
--
-- Imports the 30 real Alltagshelfer customers from Priya's
-- Kundendatenliste_Alltagshelfer_Tylotech.xlsx (received 4 Aug 2026).
--
-- Supersedes the placeholder inserts in 20260804_000055_alltagshelfer_intake.sql
-- (display_name = '—', all fields NULL, customer_number NULL). Those stubs
-- are removed first so the real rows can take their place.
--
-- SELF-CONTAINED: the schema-prep block below adds the columns the import
-- needs if they don't already exist, so this migration works stand-alone
-- when 000055 hasn't run yet.
-- ============================================================================

-- Schema prep — idempotent. Ensures the columns the import references
-- exist even if 000055 hasn't been applied yet.
alter table public.clients
  add column if not exists first_name              text,
  add column if not exists last_name               text,
  add column if not exists address_line1           text,
  add column if not exists address_line2           text,
  add column if not exists postal_code             text,
  add column if not exists city                    text,
  add column if not exists country                 text,
  add column if not exists date_of_birth           date,
  add column if not exists insurance_provider      text,
  add column if not exists insurance_number        text,
  add column if not exists abtretungserklaerung    boolean,
  add column if not exists salutation              text,
  add column if not exists customer_number         text,
  add column if not exists payer_type              text;

-- Payer-type check: constrain to the four values we recognise. Guarded by
-- pg_constraint so re-runs don't blow up on already-present constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_payer_type_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_payer_type_check
      check (payer_type is null or payer_type in (
        'care_fund', 'private_pay', 'insurance', 'commercial'
      ));
  end if;
end $$;

-- Customer number unique per org (nullable — legacy clients have none).
-- Required for the ON CONFLICT target below to resolve.
create unique index if not exists uniq_clients_customer_number_per_org
  on public.clients (org_id, customer_number)
  where customer_number is not null and deleted_at is null;

do $$
declare
  v_org uuid;
  v_client_id uuid;
begin
  select id into v_org from public.organizations order by created_at limit 1;
  if v_org is null then
    raise notice 'No organization found — skipping Alltagshelfer import';
    return;
  end if;

  -- 1) Remove placeholder stubs from 000055 (dash-name, no customer_number)
  delete from public.properties
   where client_id in (
     select id from public.clients
      where org_id = v_org
        and customer_type = 'alltagshilfe'
        and display_name = '—'
        and customer_number is null
   );
  delete from public.clients
   where org_id = v_org
     and customer_type = 'alltagshilfe'
     and display_name = '—'
     and customer_number is null;

  -- 2) Upsert the real rows keyed on (org_id, customer_number).

  -- Kundennummer 10008 — Hannelore Annies
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Hannelore Annies', 'Hannelore', 'Annies',
    'frau', '10008', 'gisch07@icloud.com', null, null,
    'Onkenstraße 12', null, '45144', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Hannelore Annies – Wohnadresse', 'Onkenstraße 12', '45144', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10005 — Christa Sommerfeld
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Christa Sommerfeld', 'Christa', 'Sommerfeld',
    'frau', '10005', 'kirsten.sommerfeld@gmx.de', null, null,
    'Onkenstraße 12', null, '45144', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Christa Sommerfeld – Wohnadresse', 'Onkenstraße 12', '45144', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10009 — Edith Dusy
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Edith Dusy', 'Edith', 'Dusy',
    'frau', '10009', 'mmdusy@yahoo.de', null, '1940-11-10'::date,
    'Onkenstraße 12', null, '45144', 'Essen', 'DE',
    'Techniker Krankenkasse', 'P534961347', true,
    'care_fund', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Edith Dusy – Wohnadresse', 'Onkenstraße 12', '45144', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10014 — Lukas Oliver Stefan Grob
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Lukas Oliver Stefan Grob', 'Lukas Oliver Stefan', 'Grob',
    'herr', '10014', 'Grob.nicole@gmail.com', null, '2015-02-12'::date,
    'Borkumstraße 21', null, '45149', 'Essen', 'DE',
    'Techniker Krankenkasse', 'V030689267', true,
    'care_fund', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Lukas Oliver Stefan Grob – Wohnadresse', 'Borkumstraße 21', '45149', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10004 — Hannelore und Guido Henze
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Hannelore und Guido Henze', 'Hannelore und Guido', 'Henze',
    null, '10004', 'prinzhendrik@aol.com,sonja.massoli@freenet.de', null, null,
    'Kamperfeld 59', null, '45133', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Hannelore und Guido Henze – Wohnadresse', 'Kamperfeld 59', '45133', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10012 — Lydia Lorenz
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Lydia Lorenz', 'Lydia', 'Lorenz',
    'frau', '10012', 'stratbike@outlook.de', null, '1938-10-09'::date,
    'Onkenstraße 12', null, '45144', 'Essen', 'DE',
    'AOK Rheinland Hamburg', 'K923498318', true,
    'care_fund', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Lydia Lorenz – Wohnadresse', 'Onkenstraße 12', '45144', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10019 — Walburga Lehmich
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Walburga Lehmich', 'Walburga', 'Lehmich',
    'frau', '10019', 'nmschulte@t-online.de', null, '1939-01-30'::date,
    'Breslauerstraße 80', null, '45145', 'Essen', 'DE',
    'IKK Classic', 'E412579487', true,
    'care_fund', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Walburga Lehmich – Wohnadresse', 'Breslauerstraße 80', '45145', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10017 — Jana Faitlova
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Jana Faitlova', 'Jana', 'Faitlova',
    'frau', '10017', 'faitl.faitlova@yahoo.com', null, '2015-08-20'::date,
    'Johann-Wilhelm-Scheidt-str.4', null, '45219', 'Essen', 'DE',
    'Techniker Krankenkasse', 'R927490942', true,
    'care_fund', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Jana Faitlova – Wohnadresse', 'Johann-Wilhelm-Scheidt-str.4', '45219', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10020 — Abdollah Behnami
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Abdollah Behnami', 'Abdollah', 'Behnami',
    'herr', '10020', 'service@rh.aok.de', null, '1935-09-11'::date,
    'Humboldtstraße 199', null, '45149', 'Essen', 'DE',
    'AOK Rheinland-Hamburg', 'K458740233', true,
    'care_fund', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Abdollah Behnami – Wohnadresse', 'Humboldtstraße 199', '45149', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10011 — Friedel Heck
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Friedel Heck', 'Friedel', 'Heck',
    'herr', '10011', 'andrea.vanalmsick@arcor.de;Friedel.heck@web.de', null, null,
    'Leggewiestraße 9', null, '45359', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Friedel Heck – Wohnadresse', 'Leggewiestraße 9', '45359', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10013 — Antonia Hindrichs
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Antonia Hindrichs', 'Antonia', 'Hindrichs',
    'frau', '10013', 'Horst@Hindrichs.com', null, null,
    'Helgolandring 57', null, '45149', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Antonia Hindrichs – Wohnadresse', 'Helgolandring 57', '45149', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10006 — Johanna Hindrichs
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Johanna Hindrichs', 'Johanna', 'Hindrichs',
    'frau', '10006', 'Horst@Hindrichs.com', null, null,
    'Helgolandring 57', null, '45149', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Johanna Hindrichs – Wohnadresse', 'Helgolandring 57', '45149', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10002 — Manfred Kampmeier
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Manfred Kampmeier', 'Manfred', 'Kampmeier',
    'herr', '10002', 'stahl@anhast.de', null, null,
    'Onkenstr. 12', null, '45144', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Manfred Kampmeier – Wohnadresse', 'Onkenstr. 12', '45144', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10045 — Renate Abs
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Renate Abs', 'Renate', 'Abs',
    'frau', '10045', 'nadineabs@gmx.de', null, null,
    'Rosastr. 26', null, '45130', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Renate Abs – Wohnadresse', 'Rosastr. 26', '45130', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10035 — Elife Gök
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Elife Gök', 'Elife', 'Gök',
    'frau', '10035', 'sultan0801@web.de', null, '1943-04-01'::date,
    'Ehrenzeller Str. 84', null, '45143', 'Essen', 'DE',
    'Barmer Pflegekasse', 'B106192804', true,
    'care_fund', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Elife Gök – Wohnadresse', 'Ehrenzeller Str. 84', '45143', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10051 — Jutta Reinhardt
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Jutta Reinhardt', 'Jutta', 'Reinhardt',
    'frau', '10051', null, null, null,
    'Iländerweg 3', null, '45239', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Jutta Reinhardt – Wohnadresse', 'Iländerweg 3', '45239', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10031 — Walli Wagner
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Walli Wagner', 'Walli', 'Wagner',
    'frau', '10031', 'dr-wagner@gmx.de', null, '1935-01-26'::date,
    'Münstermannstr. 4', null, '45357', 'Essen', 'DE',
    'AOK Rheinland Hamburg', 'S754307522', true,
    'care_fund', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Walli Wagner – Wohnadresse', 'Münstermannstr. 4', '45357', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10037 — Sabine Urch
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Sabine Urch', 'Sabine', 'Urch',
    'frau', '10037', 'sabine.urch@web.de', '1755959941', null,
    'Am Alfredusbad 7', null, '45133', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Sabine Urch – Wohnadresse', 'Am Alfredusbad 7', '45133', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10038 — Elena Meth
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Elena Meth', 'Elena', 'Meth',
    'frau', '10038', 'andrea-kauder@web.de', null, '1999-10-19'::date,
    'Holdenweg 51 e', null, '45143', 'Essen', 'DE',
    'Barmer Pflegekasse', 'M933633060', true,
    'care_fund', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Elena Meth – Wohnadresse', 'Holdenweg 51 e', '45143', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10032 — Regina Schupetta
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Regina Schupetta', 'Regina', 'Schupetta',
    'frau', '10032', 'regina.schupetta@t-online.de', null, null,
    'Kellersohnweg 4b', null, '45326', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Regina Schupetta – Wohnadresse', 'Kellersohnweg 4b', '45326', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10036 — Erich Schupetta
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Erich Schupetta', 'Erich', 'Schupetta',
    'herr', '10036', 'regina.schupetta@t-online.de', null, null,
    'Kellersohnweg 4b', null, '45326', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Erich Schupetta – Wohnadresse', 'Kellersohnweg 4b', '45326', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10034 — Ingrid Unrath
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Ingrid Unrath', 'Ingrid', 'Unrath',
    'frau', '10034', 'anke.kann@web.de', null, '1940-02-08'::date,
    'Kassenberg 58', null, '45479', 'Mülheim an der Ruhr', 'DE',
    'BKK Wirtschaft & Pflege', 'F694301834', true,
    'care_fund', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Ingrid Unrath – Wohnadresse', 'Kassenberg 58', '45479', 'Mülheim an der Ruhr', 'DE'
    );
  end if;

  -- Kundennummer 10029 — Ursula Becker
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Ursula Becker', 'Ursula', 'Becker',
    'frau', '10029', 'service@bamer.de', null, '1944-05-22'::date,
    'Germaniastr. 212', null, '45355', 'Essen', 'DE',
    'Barmer Pflegekasse', 'V706273665', true,
    'care_fund', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Ursula Becker – Wohnadresse', 'Germaniastr. 212', '45355', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10046 — Wolfgang Meyer
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Wolfgang Meyer', 'Wolfgang', 'Meyer',
    'herr', '10046', 'info@ikk-classic.de', null, '1939-01-20'::date,
    'Onkenstr. 12', null, '45145', 'Essen', 'DE',
    'IKK Classic', 'H762510621', true,
    'care_fund', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Wolfgang Meyer – Wohnadresse', 'Onkenstr. 12', '45145', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10043 — Klaus Diekmann
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Klaus Diekmann', 'Klaus', 'Diekmann',
    'herr', '10043', 'kladiek@gmail.com', null, null,
    'Dreigrabenfeld 43', null, '45359', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Klaus Diekmann – Wohnadresse', 'Dreigrabenfeld 43', '45359', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10042 — Annegret Pielke
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Annegret Pielke', 'Annegret', 'Pielke',
    'frau', '10042', 'annegret.pielke@web.de', '0201/ 356206', null,
    'Kellersohnweg 2c', null, '45326', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Annegret Pielke – Wohnadresse', 'Kellersohnweg 2c', '45326', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10047 — Isabelle Veiser
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Isabelle Veiser', 'Isabelle', 'Veiser',
    'frau', '10047', 'angela-forster@gmx.de', null, null,
    'Tilsiter Str. 43', null, '45470', 'Mülheim an der Ruhr', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Isabelle Veiser – Wohnadresse', 'Tilsiter Str. 43', '45470', 'Mülheim an der Ruhr', 'DE'
    );
  end if;

  -- Kundennummer 10044 — Giesela Böhmer
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Giesela Böhmer', 'Giesela', 'Böhmer',
    'herr', '10044', null, null, null,
    'Kleinestoppenbergerstr 9', null, '45141', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Giesela Böhmer – Wohnadresse', 'Kleinestoppenbergerstr 9', '45141', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10048 — Edith Böer
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Edith Böer', 'Edith', 'Böer',
    'frau', '10048', null, null, null,
    'Kerkhoffstr. 51', null, '45144', 'Essen', 'DE',
    null, null, false,
    'private_pay', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Edith Böer – Wohnadresse', 'Kerkhoffstr. 51', '45144', 'Essen', 'DE'
    );
  end if;

  -- Kundennummer 10024 — Fatemeh Vakili
  insert into public.clients (
    org_id, customer_type, display_name, first_name, last_name,
    salutation, customer_number, email, phone, date_of_birth,
    address_line1, address_line2, postal_code, city, country,
    insurance_provider, insurance_number, abtretungserklaerung,
    payer_type, archived
  ) values (
    v_org, 'alltagshilfe', 'Fatemeh Vakili', 'Fatemeh', 'Vakili',
    'frau', '10024', 'service@rh.aok.de', null, '1943-12-06'::date,
    'Humboldstr.199', null, '45149', 'Essen', 'DE',
    'AOK Rheinland Hamburg', 'Q760923383', true,
    'care_fund', false
  )
  on conflict (org_id, customer_number)
    where customer_number is not null and deleted_at is null
    do update set
    display_name         = excluded.display_name,
    first_name           = excluded.first_name,
    last_name            = excluded.last_name,
    salutation           = excluded.salutation,
    email                = excluded.email,
    phone                = excluded.phone,
    date_of_birth        = excluded.date_of_birth,
    address_line1        = excluded.address_line1,
    address_line2        = excluded.address_line2,
    postal_code          = excluded.postal_code,
    city                 = excluded.city,
    insurance_provider   = excluded.insurance_provider,
    insurance_number     = excluded.insurance_number,
    abtretungserklaerung = excluded.abtretungserklaerung,
    payer_type           = excluded.payer_type
  returning id into v_client_id;

  if v_client_id is not null and not exists (
    select 1 from public.properties
     where client_id = v_client_id and deleted_at is null
  ) then
    insert into public.properties (
      org_id, client_id, name, address_line1, postal_code, city, country
    ) values (
      v_org, v_client_id, 'Fatemeh Vakili – Wohnadresse', 'Humboldstr.199', '45149', 'Essen', 'DE'
    );
  end if;

  raise notice 'Alltagshelfer real import: touched 30 clients';
end $$;

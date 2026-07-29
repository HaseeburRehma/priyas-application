-- =============================================================================
-- 20260725_000053_priya_production_import.sql
--
-- Load Priya's real customer roster + operational team + property
-- inventory. Deletes every dummy / test-data row that is not one of
-- three accounts the operator explicitly kept:
--
--   • haseebtylo@gmail.com  (Haseeb — Tylo Tech admin)
--   • gt@priyas.de          (Goundo Touray — Priya's admin)
--   • info@priyas.de        (Rathnakumar Balasubramanian — Priya's admin)
--
-- Sources:
--   • 63 clients from `aktuelle Kundendatenliste - Tylotech.csv`
--   • 63 properties from `Objektliste.csv` (name = street + city)
--   • 18 unique staff from `Mitarbeiter Liste.xlsx` (both sheets)
--
-- Staff are inserted as PLACEHOLDER employees rows (no auth.users).
-- When each person signs up at /register with their listed email,
-- `handle_new_user()` (see migration 000046) auto-attaches their
-- profile to the placeholder by email match.
--
-- Idempotent. Re-runs replace clients + properties, upsert employees.
-- =============================================================================

do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000aa';
  v_kept_user_ids uuid[];
begin
  -- ---------------------------------------------------------------------
  -- 1. Collect the auth.user ids we're keeping. Anything else in
  --    auth.users is a test account and will be hard-deleted below.
  -- ---------------------------------------------------------------------
  select array_agg(id) into v_kept_user_ids
    from auth.users
    where lower(email) in ('haseebtylo@gmail.com', 'gt@priyas.de', 'info@priyas.de');

  raise notice 'preserving % auth.users', coalesce(array_length(v_kept_user_ids, 1), 0);

  -- ---------------------------------------------------------------------
  -- 2. Wipe every operational row that references profiles/auth.users
  --    or clients/properties. Everything here is test data — the user
  --    explicitly asked to nuke it. Order goes leaf-to-root through the
  --    FK graph so no `violates foreign key constraint` errors bite us.
  -- ---------------------------------------------------------------------

  -- Chat surface: reactions → messages → members → channels.
  delete from public.chat_message_reactions;
  delete from public.chat_messages;
  delete from public.chat_members;
  delete from public.chat_channels where org_id = v_org;

  -- Finance: payments → items → invoices → monthly-report deliveries.
  delete from public.invoice_payments;
  delete from public.invoice_items;
  delete from public.invoices where org_id = v_org;
  delete from public.monthly_report_deliveries where org_id = v_org;

  -- Time + schedule: entries reference shifts, shifts reference
  -- properties/employees/profiles(created_by). Delete entries first.
  delete from public.time_entries;
  delete from public.shifts where org_id = v_org;

  -- Property attachments — the shape of `property_documents` isn't
  -- guaranteed across environments (dropped/renamed in the wild), so
  -- guard each block with EXCEPTION so a missing table doesn't abort
  -- the transaction.
  begin
    delete from public.property_photos;
  exception when undefined_table then null; end;
  begin
    delete from public.property_documents;
  exception when undefined_table then null; end;
  begin
    delete from public.property_keys;
  exception when undefined_table then null; end;
  begin
    delete from public.property_closures where org_id = v_org;
  exception when undefined_table then null; end;

  -- Clients + their contact sub-rows + properties.
  begin
    delete from public.client_contacts;
  exception when undefined_table then null; end;
  delete from public.properties where org_id = v_org;
  delete from public.clients where org_id = v_org;

  -- Employee-facing tables that reference profiles/employees.
  delete from public.damage_reports where org_id = v_org;
  delete from public.vacation_requests where org_id = v_org;
  delete from public.training_assignments where org_id = v_org;
  delete from public.employee_training_progress;

  -- Per-user side-tables. audit_log + notifications get wiped fully
  -- (test data isn't worth keeping around) so no FK holds on
  -- profiles/auth.users.
  delete from public.audit_log where org_id = v_org;
  delete from public.notifications where org_id = v_org;
  begin
    delete from public.push_subscriptions;
  exception when undefined_table then null; end;
  begin
    delete from public.calendar_tokens;
  exception when undefined_table then null; end;
  begin
    delete from public.api_keys where org_id = v_org;
  exception when undefined_table then null; end;
  begin
    delete from public.user_devices;
  exception when undefined_table then null; end;

  -- ---------------------------------------------------------------------
  -- 3. Now the profile + auth.users deletes are unblocked.
  --    Employees rows go first (FK to profile_id), then profiles, then
  --    the auth.users rows themselves.
  -- ---------------------------------------------------------------------
  delete from public.employees
    where org_id = v_org
      and (profile_id is null or profile_id <> all(v_kept_user_ids));

  delete from public.profiles
    where org_id = v_org
      and id <> all(v_kept_user_ids);

  -- Cascades to profiles + everything else keyed on user id via ON
  -- DELETE CASCADE FKs from public tables → auth.users.
  delete from auth.users
    where id <> all(v_kept_user_ids);

  raise notice 'wiped clients + properties + all operational + test users';
end $$;


-- ---------------------------------------------------------------------
-- 4. Insert the 63 real clients.
-- ---------------------------------------------------------------------
insert into public.clients (org_id, display_name, contact_name, email, customer_type, archived)
values
  ('00000000-0000-0000-0000-0000000000aa', '2denare GmbH', 'Thomas De Nocker', 'rechnungen@2denare.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'André und Daniela Massoli', null, 'massoli7707@t-online.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'BANDTEC Stahlband GmbH', 'Sophia Herz', 'Sophia.Herz@bandtec.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Beate Kempa', null, 'a.j.kempa@googelemail.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'BSS Blech- & Spaltband-Service GmbH', 'Susanne Trogisch', 'Susanne.Trogisch@bandtec.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'C3 Logistik GmbH', 'Annette Theisen', 'a.theisen@idea-friseureinrichtung.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'C3 System GmbH', 'Annette Theisen', 'a.theisen@idea-friseureinrichtung.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Carina Hansen', null, 'cjesse1911@gmail.com', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Christliches Begegnungszentrum Essen e.V.', 'Armin Jonberg', 'armin@jonberg.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'CVJM Essen e.V.', 'Frank Blome', 'frank.blome@cvjmessen-sozialwerk.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Eqos Energie Deutschland GmbH', 'Janina Thom', 'sabine.persterer@eqos-energie.com', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Dr. Clemens Eckert', null, 'clemens.eckert@maex-partners.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'EFG Essen West', null, 'u.sender@t-online.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Eva Aich', null, 'evaaich2015@gmail.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Kirstin Feifel', null, 'kirstin.feifel@googlemail.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Gabi von der Stein', null, 'GabivdStein@gmx.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Gerti Gradl-Dietsch', null, 'ggradl-dietsch@posteo.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Gil Mehmert und Bettina Mönch', null, 'gil.mehmert@gmx.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Gotlind Pöstges', null, 'gotlindpoestges@gmail.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Christian Gondek', null, 'christian.gondek@yahoo.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Heinrich GmbH', 'Annika Romanski', 'rechnungen@heinrich-info.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Nadine Gottheil', null, 'Nadine.gottheil@t-online.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Wilhelm Hesterkamp', null, 'w.hesterkamp@gmail.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Julia Wälscher', null, 'j.waelscher@gmx.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Iris Becker', null, 'iris.becker@rww.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Janika D''Antino', null, 'janikadantino@hwt-net.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Judith Lange', null, 'Info@villahuerkamp.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Katharina von der Stein', null, 'KvdStein@aol.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Kindergarten Königskinder', 'Nicklas Nowottka', 'nnowottka@stiftung-gl.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Kita- kleine- Arche', 'Nicklas Nowottka', 'nnowottka@stiftung-gl.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Kita "unsere kleine Farm"', 'Gaby Tietz', 'vsimons@stiftung-gl.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Krimhild Riemer', null, 'andreasriemer@arcor.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Leonie Männig', null, 'leoniemaennig@yahoo.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Lies Van Dorpe', null, 'vandorpelies@gmail.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Martin Batterwitz', null, 'martinbatterewitz@gmx.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Nina Theis', null, 'nv.theis@gmail.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Sara Fellmann', null, 'Sara.fellmann@gmail.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Christine Schulze', null, 'chris4schuch@arcor.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Wiebke Schulz', null, 'wiebke.schulz84@gmail.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Sebastian Kleinschmager', null, 'himself@schmaga.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Samuel Grotz', null, 'samuelgrotz@gmx.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Mirjam Seeger', null, 'mirjam.seeger@mailbox.org', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Stiftung Glaubens-und Lebenshilfe', 'Volker Simons', 'vsimons@stiftung-gl.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Rogge- Dannemann', null, 'jenrogge@web.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Tassilo Nitz', null, 'onitone23@gmail.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'therapiebar.ruhr', null, 'gf@therapiebar.ruhr', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Thomas Fleischmann', null, 'fleischmann@gmx.net', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Ulrich Hemming', null, 'ulrich.hemming@t-online.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Ulrike Hansen', null, 'cjesse1911@gmail.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Wolfgang Hesterkamp', null, 'w.hesterkamp@gmail.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Wolfgang und Martina Schröder', null, 'Wums81@gmail.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Dania Zessin', null, 'daniazessin@aol.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Familie Studener', null, 'veronikast.565@gmx.net', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Eva Großimlinghaus', null, 'eva.g@t-online.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Prof. Dr. med. Angelika Eggert', null, 'christiane.ankert@uk-essen.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Matthias und Sarah Maas', null, 'matthias_maas@gmx.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Birgit Heltweg', null, 'Birgit.Heltweg@gmx.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Elektro Dreier GmbH', 'Heike Rysavy', 'info@elektro-dreier.de', 'commercial', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Tanja Werth', null, 'tanja.werth@foerderturm.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Carolin Klein', null, 'carolin_klein@outlook.com', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Sven Vallunthra', null, 'sven_vallonthara@web.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Anke Kann', null, 'anke.kann@web.de', 'residential', false),
  ('00000000-0000-0000-0000-0000000000aa', 'Clara Kattein', null, 'clarakattein@gmail.com', 'residential', false);

-- ---------------------------------------------------------------------
-- 5. Insert the 63 properties. Each linked to its client
--    by display_name (unique within the org after the wipe above).
-- ---------------------------------------------------------------------
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000aa';
  v_client_id uuid;
begin
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = '2denare GmbH' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Reineke-Fuchs-Str.22, Essen', 'Reineke-Fuchs-Str.22', '45149', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', '2denare GmbH';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'André und Daniela Massoli' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Bahnhofstraße. 60, Essen', 'Bahnhofstraße. 60', '45259', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'André und Daniela Massoli';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'BANDTEC Stahlband GmbH' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Rheinstraße.110-112, Mülheim an der Ruhr', 'Rheinstraße.110-112', '45478', 'Mülheim an der Ruhr');
  else
    raise notice 'skipped property (no matching client): %', 'BANDTEC Stahlband GmbH';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Beate Kempa' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Bergmühle 39, Essen', 'Bergmühle 39', '45356', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Beate Kempa';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'BSS Blech- & Spaltband-Service GmbH' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Rheinstr. 110-112, Mülheim an der Ruhr', 'Rheinstr. 110-112', '45478', 'Mülheim an der Ruhr');
  else
    raise notice 'skipped property (no matching client): %', 'BSS Blech- & Spaltband-Service GmbH';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'C3 Logistik GmbH' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Bamlerstraße 1d, Essen', 'Bamlerstraße 1d', '45141', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'C3 Logistik GmbH';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'C3 System GmbH' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Zipfelweg 17, Essen', 'Zipfelweg 17', '45356', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'C3 System GmbH';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Carina Hansen' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Im Löwental 43, Essen', 'Im Löwental 43', '45239', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Carina Hansen';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Christliches Begegnungszentrum Essen e.V.' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Herbrüggenstr. 144, Essen', 'Herbrüggenstr. 144', '45359', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Christliches Begegnungszentrum Essen e.V.';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'CVJM Essen e.V.' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Hindenburgerstraße 57, Essen', 'Hindenburgerstraße 57', '45127', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'CVJM Essen e.V.';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Eqos Energie Deutschland GmbH' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Wolfentalstraße 29, Biberach', 'Wolfentalstraße 29', '88400', 'Biberach');
  else
    raise notice 'skipped property (no matching client): %', 'Eqos Energie Deutschland GmbH';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Dr. Clemens Eckert' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Vossbergring 49, Essen', 'Vossbergring 49', '45259', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Dr. Clemens Eckert';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'EFG Essen West' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Bentheimer Straße 15-17, Essen', 'Bentheimer Straße 15-17', '45145', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'EFG Essen West';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Eva Aich' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Oberlehberg 40, Essen', 'Oberlehberg 40', '45219', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Eva Aich';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Kirstin Feifel' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Grüne Matte 5, Essen', 'Grüne Matte 5', '45133', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Kirstin Feifel';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Gabi von der Stein' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Fulerumerstraße 148, Essen', 'Fulerumerstraße 148', '45149', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Gabi von der Stein';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Gerti Gradl-Dietsch' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Brederbachstr.5, Essen', 'Brederbachstr.5', '45219', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Gerti Gradl-Dietsch';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Gil Mehmert und Bettina Mönch' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Neukircher Mühle 32, Essen', 'Neukircher Mühle 32', '45239', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Gil Mehmert und Bettina Mönch';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Gotlind Pöstges' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Bocholder Straße 138, Essen', 'Bocholder Straße 138', '45355', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Gotlind Pöstges';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Christian Gondek' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Velbertstr.88, Essen', 'Velbertstr.88', '45239', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Christian Gondek';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Heinrich GmbH' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Halbe Höhe 20, Essen', 'Halbe Höhe 20', '45147', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Heinrich GmbH';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Nadine Gottheil' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Fulerumerstr.  7b, Essen', 'Fulerumerstr.  7b', '45149', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Nadine Gottheil';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Wilhelm Hesterkamp' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Wintgenstrasse 32, Essen', 'Wintgenstrasse 32', '45239', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Wilhelm Hesterkamp';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Julia Wälscher' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Halbe Höhe 18, Essen', 'Halbe Höhe 18', '45147', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Julia Wälscher';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Iris Becker' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Im Pferdekamp 3, Essen', 'Im Pferdekamp 3', '45279', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Iris Becker';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Judith Lange' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Hürtkamp 11a, Gladbeck', 'Hürtkamp 11a', '45968', 'Gladbeck');
  else
    raise notice 'skipped property (no matching client): %', 'Judith Lange';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Katharina von der Stein' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Papestraße 56, Essen', 'Papestraße 56', '45147', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Katharina von der Stein';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Kindergarten Königskinder' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Helenenstraße 55, Essen', 'Helenenstraße 55', '45143', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Kindergarten Königskinder';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Kita- kleine- Arche' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Liebigstraße 3, Essen', 'Liebigstraße 3', '45145', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Kita- kleine- Arche';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Kita "unsere kleine Farm"' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Rauterstraße 20, Essen', 'Rauterstraße 20', '45139', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Kita "unsere kleine Farm"';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Krimhild Riemer' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Stensbeckhof 21, Essen', 'Stensbeckhof 21', '45357', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Krimhild Riemer';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Leonie Männig' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Gudulastraße 27, Essen', 'Gudulastraße 27', '45131', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Leonie Männig';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Lies Van Dorpe' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Steigerstraße 3, Essen', 'Steigerstraße 3', '45329', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Lies Van Dorpe';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Martin Batterwitz' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Grüne Harfe 5, Essen', 'Grüne Harfe 5', '45239', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Martin Batterwitz';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Nina Theis' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Am Kettwiger Ruhrbogen 125, Essen', 'Am Kettwiger Ruhrbogen 125', '45219', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Nina Theis';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Sara Fellmann' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Brakeler Wald 32, Essen', 'Brakeler Wald 32', '45239', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Sara Fellmann';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Christine Schulze' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Ratshemweg 11, Essen', 'Ratshemweg 11', '45130', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Christine Schulze';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Wiebke Schulz' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Scheppener Weg 17, Essen', 'Scheppener Weg 17', '45239', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Wiebke Schulz';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Sebastian Kleinschmager' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Sibyllastr. 14, Essen', 'Sibyllastr. 14', '45136', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Sebastian Kleinschmager';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Samuel Grotz' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Dohmanns Kamp 15, Essen', 'Dohmanns Kamp 15', '45130', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Samuel Grotz';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Mirjam Seeger' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Fahrenberg 33d, Essen', 'Fahrenberg 33d', '45257', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Mirjam Seeger';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Stiftung Glaubens-und Lebenshilfe' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Budderstraße 4, Essen', 'Budderstraße 4', '45143', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Stiftung Glaubens-und Lebenshilfe';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Rogge- Dannemann' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Fasanenstraße 2, Essen', 'Fasanenstraße 2', '45143', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Rogge- Dannemann';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Tassilo Nitz' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Am Lamperfeld 5, Bottrop', 'Am Lamperfeld 5', '46236', 'Bottrop');
  else
    raise notice 'skipped property (no matching client): %', 'Tassilo Nitz';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'therapiebar.ruhr' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Heiermannstraße 45, Mülheim an der Ruhr', 'Heiermannstraße 45', '45475', 'Mülheim an der Ruhr');
  else
    raise notice 'skipped property (no matching client): %', 'therapiebar.ruhr';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Thomas Fleischmann' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Potthoffs Börde 4, Essen', 'Potthoffs Börde 4', '45136', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Thomas Fleischmann';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Ulrich Hemming' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Lothringenstraße 28 b, Essen', 'Lothringenstraße 28 b', '45259', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Ulrich Hemming';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Ulrike Hansen' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Ruschenfeld 12, Essen', 'Ruschenfeld 12', '45133', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Ulrike Hansen';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Wolfgang Hesterkamp' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Ludwigstr. 7, Essen', 'Ludwigstr. 7', '45239', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Wolfgang Hesterkamp';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Wolfgang und Martina Schröder' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Stöckmannstr. 172, Oberhausen', 'Stöckmannstr. 172', '46045', 'Oberhausen');
  else
    raise notice 'skipped property (no matching client): %', 'Wolfgang und Martina Schröder';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Dania Zessin' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Schöllerskampstraße 21, Essen', 'Schöllerskampstraße 21', '45307', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Dania Zessin';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Familie Studener' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Fischlaker Str 43, Essen', 'Fischlaker Str 43', '45239', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Familie Studener';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Eva Großimlinghaus' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Kupferdreher Str. 160, Essen', 'Kupferdreher Str. 160', '45257', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Eva Großimlinghaus';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Prof. Dr. med. Angelika Eggert' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Am Hagenbusch 14, Essen', 'Am Hagenbusch 14', '45259', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Prof. Dr. med. Angelika Eggert';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Matthias und Sarah Maas' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Zur Waldesquelle 9, Essen', 'Zur Waldesquelle 9', '45259', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Matthias und Sarah Maas';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Birgit Heltweg' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Graf-Bernadotte-Str. 48, Essen', 'Graf-Bernadotte-Str. 48', '45133', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Birgit Heltweg';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Elektro Dreier GmbH' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Weckenkamp 10, Essen', 'Weckenkamp 10', '45327', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Elektro Dreier GmbH';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Tanja Werth' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Witteringstr. 97, Essen', 'Witteringstr. 97', '45130', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Tanja Werth';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Carolin Klein' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Kronprinzenstraße 15b, Düsseldorf', 'Kronprinzenstraße 15b', '40217', 'Düsseldorf');
  else
    raise notice 'skipped property (no matching client): %', 'Carolin Klein';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Sven Vallunthra' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Am Vogelherd 15, Essen', 'Am Vogelherd 15', '45239', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Sven Vallunthra';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Anke Kann' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Hochfelder Straße 72, Mülheim an der Ruhr', 'Hochfelder Straße 72', '45478', 'Mülheim an der Ruhr');
  else
    raise notice 'skipped property (no matching client): %', 'Anke Kann';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Clara Kattein' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Camphausenstr. 10, Düsseldorf', 'Camphausenstr. 10', '45479', 'Düsseldorf');
  else
    raise notice 'skipped property (no matching client): %', 'Clara Kattein';
  end if;
  select id into v_client_id from public.clients
    where org_id = v_org and display_name = 'Janika D''Antino' limit 1;
  if v_client_id is not null then
    insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
    values (v_org, v_client_id, 'Schinkelst.75, Essen', 'Schinkelst.75', '45136', 'Essen');
  else
    raise notice 'skipped property (no matching client): %', 'Janika D''Antino';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Insert the 18 team members as placeholder employees rows.
--    Trigger `handle_new_user()` will attach their profile when they
--    sign up with the listed email address (matches by lower(email)).
--    Existing kept employees (Haseeb, Goundo, Rathnakumar) are
--    updated in place — the ON CONFLICT clause on (profile_id) makes
--    that safe. Staff whose email matches a preserved account are
--    skipped so their existing employee row is preserved.
-- ---------------------------------------------------------------------
insert into public.employees (org_id, full_name, email, phone, status, hire_date)
values
  ('00000000-0000-0000-0000-0000000000aa', 'Telan Patrick Aloysius', 'telan.patrick82@gmail.com', '+49 176 64045530', 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Uthayakumar Amirthanathan', 'uthayakumar09.01.79@gmail.com', '+4915217669188', 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Jude Nishal Lopez Nerry Stanly Lopez', 'nishallpoez1@gmail.com', null, 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Shahida Alam', 'alamrazar@gmail.com', null, 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Havia Nanthakumar', 'shanthiiyaa.nanthakumar@gmail.com', '+491785002428', 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Hoby Padinjare Cheeranand Bose', 'hobypb6688@gmail.com', '+4917631728032', 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Christeevan Paramanathan', 'sureka@live.de', '+4917643771743', 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Theivanayaki Nanthakumaran', null, '+4917630651293', 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Nihayat Hasan Qader', 'mdtv1888@gmail.com', '+491639459375', 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Easwary Rasathasan', 'eswary15@outlook.de', '+4915901142583', 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Ranjanadevi Sivagnanam', 'nishanthbalini@gmail.com', '+4915228015602', 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Mahinthan Thevaratnam', 'mahinthanthevaratham@gmail.com', '+4915568517648', 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Joyacown Vasantnaruban', 'ktharmabalan@gmail.com', null, 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Priya Thiruchelvam', 'pt@priyas.de', '+4917655412628', 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Skelman Thiruchelvam', 'skelman@hotmail.de', '+491729751976', 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Jansan Pathmanathn', 'jansanpathmanathan01@gmail.com', '+4915215796660', 'active', current_date),
  ('00000000-0000-0000-0000-0000000000aa', 'Pavalarani Ariyapalan', 'pavalaraniariyapalan@gmail.com', '+491782670599', 'active', current_date);

-- ---------------------------------------------------------------------
-- 7. Sanity check — should print counts matching the CSV totals.
-- ---------------------------------------------------------------------
select
  (select count(*) from public.clients where org_id = '00000000-0000-0000-0000-0000000000aa') as clients,
  (select count(*) from public.properties where org_id = '00000000-0000-0000-0000-0000000000aa') as properties,
  (select count(*) from public.employees where org_id = '00000000-0000-0000-0000-0000000000aa' and deleted_at is null) as employees,
  (select count(*) from auth.users) as auth_users;
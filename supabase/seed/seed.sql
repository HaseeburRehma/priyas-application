-- =============================================================================
-- seed.sql — development data only. DO NOT run against production.
-- Run with: psql $SUPABASE_DB_URL -f supabase/seed/seed.sql
-- Or: supabase db reset (which auto-applies seed.sql when configured).
--
-- Creates one organization and a sample dataset that mirrors the visuals in
-- the HTML prototypes (10 clients, 112 properties, 32 employees, etc.).
-- Auth users are NOT created here — invite them through Supabase Auth and
-- attach via raw_user_meta_data.org_id during signup.
-- =============================================================================

begin;

-- Organization ---------------------------------------------------------------
insert into public.organizations (id, name, slug)
values ('00000000-0000-0000-0000-0000000000aa', 'Priya''s Reinigungsservice', 'priya')
on conflict (id) do nothing;

-- Settings -------------------------------------------------------------------
insert into public.settings (org_id, data) values (
  '00000000-0000-0000-0000-0000000000aa',
  jsonb_build_object(
    'currency', 'EUR',
    'tax_rate', 19,
    'working_hours', jsonb_build_object('start','06:00','end','22:00'),
    'integrations', jsonb_build_object('lexware', false, 'whatsapp', false)
  )
) on conflict (org_id) do update set data = excluded.data;

-- Clients (sample) -----------------------------------------------------------
insert into public.clients (org_id, customer_type, display_name, contact_name, email, phone, care_level, insurance_provider)
select '00000000-0000-0000-0000-0000000000aa',
       (array['residential','commercial','alltagshilfe'])[1 + (i % 3)]::public.customer_type,
       'Demo-Kunde ' || i,
       'Frau Muster ' || i,
       'kunde'||i||'@example.de',
       '+49 30 ' || lpad(i::text, 6, '0'),
       case when i % 3 = 2 then ((i % 5) + 1)::smallint else null end,
       case when i % 3 = 2 then (array['AOK','TK','Barmer','DAK'])[1 + (i % 4)] else null end
from generate_series(1, 10) i
on conflict do nothing;

-- Properties (a few per client) ----------------------------------------------
insert into public.properties (org_id, client_id, name, address_line1, postal_code, city)
select c.org_id,
       c.id,
       'Objekt ' || c.display_name || ' #' || g,
       'Musterstraße ' || (10 + g),
       '10' || lpad(((extract(epoch from now())::int + g) % 999)::text, 3, '0'),
       (array['Berlin','München','Hamburg','Köln'])[1 + (g % 4)]
from public.clients c, generate_series(1,3) g
where c.org_id = '00000000-0000-0000-0000-0000000000aa'
on conflict do nothing;

-- Employees (sample) ---------------------------------------------------------
insert into public.employees (org_id, full_name, email, phone, hourly_rate_eur, status)
select '00000000-0000-0000-0000-0000000000aa',
       'Mitarbeiter ' || i,
       'mitarbeiter'||i||'@priya.de',
       '+49 170 ' || lpad(i::text, 7, '0'),
       round((14 + (i % 6))::numeric, 2),
       (array['active','active','active','on_leave'])[1 + (i % 4)]
from generate_series(1, 12) i
on conflict do nothing;

commit;

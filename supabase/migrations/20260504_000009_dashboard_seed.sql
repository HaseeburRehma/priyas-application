-- =============================================================================
-- 20260504_000009_dashboard_seed.sql
-- Realistic seed dataset so the dashboard renders with content matching the
-- HTML prototype (~48 clients, ~112 properties, ~32 employees, today's
-- shifts, recent activity, invoices in mixed states).
--
-- IDEMPOTENT: safe to re-run. Every insert uses a deterministic key derived
-- from the loop index, so re-running tops up missing rows but never
-- duplicates them.
--
-- IMPORTANT: this is dev/staging seed data. Do not run against a real
-- production org. The default-signup org id is hard-coded.
-- =============================================================================

do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000aa';
  i int;
  v_client_id uuid;
  v_prop_id uuid;
  v_emp_id uuid;
  v_shift_id uuid;
  v_today_start timestamptz := date_trunc('day', now());
begin
  ---------------------------------------------------------------------------
  -- 1) Clients — 48 records, mix of three customer types.
  ---------------------------------------------------------------------------
  for i in 1..48 loop
    v_client_id := uuid_generate_v5(
      '11111111-1111-1111-1111-111111111111'::uuid,
      'client-' || i::text
    );
    insert into public.clients (
      id, org_id, customer_type, display_name, contact_name,
      email, phone, care_level, insurance_provider, created_at
    ) values (
      v_client_id, v_org,
      (array['residential','commercial','alltagshilfe','commercial'])[1 + (i % 4)]::public.customer_type,
      case
        when i % 4 = 0 then 'Müller GmbH'
        when i % 7 = 0 then 'Berliner Hotel'
        when i % 5 = 0 then 'Schmidt & Partner'
        when i % 6 = 0 then 'Bauknecht AG'
        when i % 3 = 0 then 'Kanzlei Weber ' || i
        when i % 4 = 1 then 'Frau Helga Weber ' || i
        when i % 4 = 2 then 'Praxis Wagner ' || i
        else 'Demo-Kunde ' || i
      end,
      'Frau Muster ' || i,
      'kunde'||i||'@example.de',
      '+49 30 ' || lpad((1000000 + i)::text, 7, '0'),
      case when i % 4 = 2 then ((i % 5) + 1)::smallint else null end,
      case when i % 4 = 2 then (array['AOK','TK','Barmer','DAK'])[1 + (i % 4)] else null end,
      -- Spread creation across the past 60 days. Items 1..6 are this month.
      now() - ((60 - least(i, 60)) || ' days')::interval
    )
    on conflict (id) do nothing;
  end loop;

  ---------------------------------------------------------------------------
  -- 2) Properties — 112 records, 2–3 per client. Idempotent via UUIDv5.
  ---------------------------------------------------------------------------
  i := 0;
  while i < 112 loop
    v_client_id := (
      select id from public.clients
      where org_id = v_org
      order by created_at
      limit 1 offset (i % 48)
    );
    if v_client_id is null then exit; end if;

    v_prop_id := uuid_generate_v5(
      '22222222-2222-2222-2222-222222222222'::uuid,
      'prop-' || i::text
    );
    insert into public.properties (
      id, org_id, client_id, name, address_line1, postal_code, city,
      latitude, longitude, created_at
    ) values (
      v_prop_id, v_org, v_client_id,
      'Objekt ' || chr(65 + (i % 26)) || ' · #' || lpad((i+1)::text, 3, '0'),
      'Musterstraße ' || (10 + i),
      '1' || lpad(((i + 13) % 9999)::text, 4, '0'),
      (array['Berlin','München','Hamburg','Köln','Frankfurt'])[1 + (i % 5)],
      52.52 + (i % 7) * 0.01,
      13.405 + (i % 7) * 0.01,
      now() - ((90 - least(i, 90)) || ' days')::interval
    )
    on conflict (id) do nothing;
    i := i + 1;
  end loop;

  ---------------------------------------------------------------------------
  -- 3) Employees — 32 records, mostly active. Names mirror the prototype.
  ---------------------------------------------------------------------------
  for i in 1..32 loop
    v_emp_id := uuid_generate_v5(
      '33333333-3333-3333-3333-333333333333'::uuid,
      'emp-' || i::text
    );
    insert into public.employees (
      id, org_id, full_name, email, phone, hourly_rate_eur,
      weekly_hours, status, hire_date, created_at
    ) values (
      v_emp_id, v_org,
      case i
        when 1 then 'Anna Krüger'
        when 2 then 'Markus Weber'
        when 3 then 'Fatima Özdemir'
        when 4 then 'Stefan Hoffmann'
        when 5 then 'Lena Bauer'
        when 6 then 'Lukas Krause'
        when 7 then 'Priya Anand'
        when 8 then 'Ahmed Yilmaz'
        when 9 then 'Maria Schmidt'
        else 'Mitarbeiter ' || i
      end,
      'mitarbeiter'||i||'@priya.de',
      '+49 170 ' || lpad((4000000 + i)::text, 7, '0'),
      round((14 + (i % 6))::numeric, 2),
      40,
      (array['active','active','active','active','on_leave'])[1 + (i % 5)],
      current_date - ((i * 25) || ' days')::interval,
      now() - ((300 - least(i*5, 300)) || ' days')::interval
    )
    on conflict (id) do nothing;
  end loop;

  ---------------------------------------------------------------------------
  -- 4) Today's shifts — 27 entries, mix of statuses, anchored to "today".
  ---------------------------------------------------------------------------
  for i in 0..26 loop
    v_shift_id := uuid_generate_v5(
      '44444444-4444-4444-4444-444444444444'::uuid,
      'shift-today-' || i::text
    );
    v_prop_id := (
      select id from public.properties
      where org_id = v_org
      order by created_at
      limit 1 offset (i % 112)
    );
    v_emp_id := (
      select id from public.employees
      where org_id = v_org and status = 'active'
      order by created_at
      limit 1 offset (i % 9)
    );
    if v_prop_id is null or v_emp_id is null then continue; end if;
    insert into public.shifts (
      id, org_id, property_id, employee_id, starts_at, ends_at, status, notes
    ) values (
      v_shift_id, v_org, v_prop_id, v_emp_id,
      v_today_start + ((6 + i) || ' hours')::interval,
      v_today_start + ((6 + i + (1 + (i % 3))) || ' hours')::interval,
      case
        when i < 5 then 'completed'::public.shift_status
        when i = 5 then 'in_progress'::public.shift_status
        else 'scheduled'::public.shift_status
      end,
      (array['Büroreinigung','Tägliche Pflege','Grundreinigung','Bi-weekly','Industrial · 3h'])[1 + (i % 5)]
    )
    on conflict (id) do nothing;
  end loop;

  ---------------------------------------------------------------------------
  -- 5) This-week shifts (Mo–Sun excluding today) — 100 records → bar chart.
  ---------------------------------------------------------------------------
  for i in 0..99 loop
    v_shift_id := uuid_generate_v5(
      '44444444-4444-4444-4444-444444444444'::uuid,
      'shift-week-' || i::text
    );
    v_prop_id := (
      select id from public.properties
      where org_id = v_org
      order by created_at
      limit 1 offset (i % 112)
    );
    v_emp_id := (
      select id from public.employees
      where org_id = v_org and status = 'active'
      order by created_at
      limit 1 offset (i % 9)
    );
    if v_prop_id is null or v_emp_id is null then continue; end if;
    insert into public.shifts (
      id, org_id, property_id, employee_id, starts_at, ends_at, status
    ) values (
      v_shift_id, v_org, v_prop_id, v_emp_id,
      date_trunc('week', now()) + ((i % 6) || ' days')::interval + ((6 + (i % 8)) || ' hours')::interval,
      date_trunc('week', now()) + ((i % 6) || ' days')::interval + ((9 + (i % 8)) || ' hours')::interval,
      case when i % 7 < 5 then 'completed'::public.shift_status
           else 'scheduled'::public.shift_status end
    )
    on conflict (id) do nothing;
  end loop;

  ---------------------------------------------------------------------------
  -- 6) Time entries for completed shifts (drives the chart "Erfasste Stunden").
  ---------------------------------------------------------------------------
  insert into public.time_entries (
    id, org_id, shift_id, employee_id,
    check_in_at, check_out_at, break_minutes
  )
  select
    uuid_generate_v5('55555555-5555-5555-5555-555555555555'::uuid, s.id::text),
    s.org_id, s.id, s.employee_id,
    s.starts_at, s.ends_at, 15
  from public.shifts s
  where s.org_id = v_org
    and s.status = 'completed'
    and s.starts_at >= date_trunc('week', now())
    and s.starts_at < date_trunc('week', now()) + interval '7 days'
    and s.employee_id is not null
  on conflict (id) do nothing;

  ---------------------------------------------------------------------------
  -- 7) Invoices — 20, mostly paid; ~7 sent (open), 2 overdue.
  ---------------------------------------------------------------------------
  for i in 1..20 loop
    v_client_id := (
      select id from public.clients
      where org_id = v_org
      order by created_at
      limit 1 offset (i % 48)
    );
    if v_client_id is null then continue; end if;

    insert into public.invoices (
      id, org_id, client_id, invoice_number, status, issue_date, due_date,
      subtotal_cents, tax_cents, total_cents, paid_at
    ) values (
      uuid_generate_v5('66666666-6666-6666-6666-666666666666'::uuid, 'inv-' || i::text),
      v_org, v_client_id,
      'INV-2026-' || lpad((100 + i)::text, 4, '0'),
      case
        when i <= 11 then 'paid'::public.invoice_status
        when i <= 18 then 'sent'::public.invoice_status
        else 'overdue'::public.invoice_status
      end,
      current_date - (i * 3),
      current_date - (i * 3) + interval '14 days',
      (i * 35000)::bigint,
      (i * 35000 * 0.19)::bigint,
      (i * 35000 * 1.19)::bigint,
      case when i <= 11 then now() - ((i * 2) || ' days')::interval else null end
    )
    on conflict (id) do nothing;
  end loop;

  ---------------------------------------------------------------------------
  -- 8) Audit log — recent activity feed for the dashboard "Letzte Aktivitäten".
  ---------------------------------------------------------------------------
  insert into public.audit_log (org_id, action, table_name, after, created_at) values
    (v_org, 'create',  'clients',
     jsonb_build_object('message',
        '<strong>Praxis Wagner</strong> wurde als neuer Kunde mit 2 verbundenen Objekten angelegt.',
        'meta','von Projektleitung 02'),
     now() - interval '12 minutes'),
    (v_org, 'checkin', 'time_entries',
     jsonb_build_object('message',
        '<strong>Stefan Hoffmann</strong> eingecheckt um Objekt B · Berliner Hotel · 09:02 Uhr.',
        'meta','GPS verifiziert'),
     now() - interval '32 minutes'),
    (v_org, 'create',  'invoices',
     jsonb_build_object('message',
        'Rechnung <strong>INV-2026-0121</strong> wurde erstellt und gesendet an Frau Helga Weber.',
        'meta','Lexware sync'),
     now() - interval '1 hour'),
    (v_org, 'alert',   'shifts',
     jsonb_build_object('message',
        '<strong>Check-out reminder</strong> ausgelöst für Lukas Krause bei Objekt D · Bauknecht AG.',
        'meta','automatischer Alert'),
     now() - interval '2 hours'),
    (v_org, 'update',  'properties',
     jsonb_build_object('message',
        'Objekt <strong>#087</strong> wurde aktualisiert — Reinigungskonzept-PDF hochgeladen.',
        'meta','von Projektleitung 01'),
     now() - interval '3 hours');

end $$;

-- A composite index that makes the audit-log feed query fast.
create index if not exists idx_audit_org_created_desc
  on public.audit_log (org_id, created_at desc);

-- =============================================================================
-- 20260504_000010_clients_seed.sql
-- Seed contracts + service scopes for the existing seeded clients so the
-- /clients page shows realistic data (active contracts count, dates,
-- "ending soon", etc.).
-- IDEMPOTENT — keys derived deterministically.
-- =============================================================================

do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000aa';
  v_client record;
  i int := 0;
begin
  for v_client in
    select id, customer_type, created_at
    from public.clients
    where org_id = v_org and deleted_at is null
    order by created_at
  loop
    i := i + 1;

    -- Contract per client. ~88% active, the rest mixed.
    insert into public.contracts (
      id, org_id, client_id, start_date, end_date,
      notice_period_days, status, legal_form
    ) values (
      uuid_generate_v5('77777777-7777-7777-7777-777777777777'::uuid, 'contract-' || v_client.id::text),
      v_org,
      v_client.id,
      (v_client.created_at::date) + interval '7 days',
      case
        -- 3 contracts ending within 60 days, drives "Verträge laufen bald aus"
        when i <= 3 then current_date + ((20 + i * 10) || ' days')::interval
        -- standard: 12-month rolling
        else (v_client.created_at::date) + interval '380 days'
      end,
      90,
      case
        when i <= 3 then 'active'
        when i % 12 = 0 then 'draft'
        when i % 25 = 0 then 'terminated'
        else 'active'
      end::text,
      case v_client.customer_type
        when 'commercial' then 'GmbH'
        when 'residential' then 'Privatperson'
        else 'Pflegekasse'
      end
    )
    on conflict (id) do nothing;

    -- One service scope per client (cleaning frequency).
    insert into public.service_scopes (
      id, org_id, client_id, service_type, frequency, special_notes
    ) values (
      uuid_generate_v5('88888888-8888-8888-8888-888888888888'::uuid, 'scope-' || v_client.id::text),
      v_org,
      v_client.id,
      case (i % 4)
        when 0 then 'maintenance_cleaning'
        when 1 then 'deep_cleaning'
        when 2 then 'window_cleaning'
        else 'office_cleaning'
      end,
      case (i % 3)
        when 0 then 'weekly'
        when 1 then 'biweekly'
        else 'monthly'
      end,
      null
    )
    on conflict (id) do nothing;
  end loop;
end $$;

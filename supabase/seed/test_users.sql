-- =============================================================================
-- test_users.sql — three pre-baked accounts (one per role) for local QA.
--
-- ⚠️  DEV ONLY. Never run this in production.
--
-- After applying migrations + seed.sql, run:
--    psql "$SUPABASE_DB_URL" -f supabase/seed/test_users.sql
--
-- It creates three confirmed auth.users + matching profiles + employee rows,
-- all attached to the default org. Passwords are weak on purpose: this is
-- a local-only harness.
--
-- Login credentials:
--   admin@priya.test       / Test1234!     → Management
--   dispatcher@priya.test  / Test1234!     → Project Manager
--   employee@priya.test    / Test1234!     → Field Staff
-- =============================================================================

do $$
declare
  org_id uuid := '00000000-0000-0000-0000-0000000000aa';
  admin_id uuid := '11111111-1111-1111-1111-111111111111';
  disp_id  uuid := '22222222-2222-2222-2222-222222222222';
  emp_id   uuid := '33333333-3333-3333-3333-333333333333';
  -- bcrypt for "Test1234!" cost 10 — pre-computed so we don't depend on pgcrypto
  -- being callable from the migration runner. Generated with: openssl passwd -bcrypt
  pw_hash  text := crypt('Test1234!', gen_salt('bf'));
begin
  -- auth.users rows ---------------------------------------------------------
  insert into auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values
    (admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@priya.test', pw_hash, now(), now(), now(),
      jsonb_build_object('provider','email','providers',array['email']),
      jsonb_build_object('full_name','Priya Test (Admin)'),
      '', '', '', ''),
    (disp_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'dispatcher@priya.test', pw_hash, now(), now(), now(),
      jsonb_build_object('provider','email','providers',array['email']),
      jsonb_build_object('full_name','Daniela Disponentin'),
      '', '', '', ''),
    (emp_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'employee@priya.test', pw_hash, now(), now(), now(),
      jsonb_build_object('provider','email','providers',array['email']),
      jsonb_build_object('full_name','Eli Einsatzkraft'),
      '', '', '', '')
  on conflict (id) do nothing;

  -- auth.identities (Supabase requires one per provider) -------------------
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values
    (gen_random_uuid(), admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', 'admin@priya.test'),
      'email', admin_id::text, now(), now(), now()),
    (gen_random_uuid(), disp_id,
      jsonb_build_object('sub', disp_id::text, 'email', 'dispatcher@priya.test'),
      'email', disp_id::text, now(), now(), now()),
    (gen_random_uuid(), emp_id,
      jsonb_build_object('sub', emp_id::text, 'email', 'employee@priya.test'),
      'email', emp_id::text, now(), now(), now())
  on conflict (provider, provider_id) do nothing;

  -- public.profiles (handle_new_user trigger should fire, but be defensive) -
  insert into public.profiles (id, org_id, full_name, role)
  values
    (admin_id, org_id, 'Priya Test (Admin)', 'admin'),
    (disp_id,  org_id, 'Daniela Disponentin', 'dispatcher'),
    (emp_id,   org_id, 'Eli Einsatzkraft',    'employee')
  on conflict (id) do update set
    org_id    = excluded.org_id,
    full_name = excluded.full_name,
    role      = excluded.role;

  -- Link the field-staff user to an employee record so they show up in
  -- schedule pickers / vacation / training assignments.
  insert into public.employees (
    id, org_id, profile_id, full_name, email, phone,
    weekly_hours, hourly_rate_eur, status
  ) values (
    gen_random_uuid(), org_id, emp_id, 'Eli Einsatzkraft',
    'employee@priya.test', '+49 30 0000003', 40, 18.50, 'active'
  )
  on conflict do nothing;
end $$;

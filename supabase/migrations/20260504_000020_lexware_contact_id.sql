-- =============================================================================
-- Track the Lexware contact_id alongside our client_id so we can update
-- existing contacts on subsequent syncs instead of creating duplicates.
-- =============================================================================

alter table public.clients
  add column if not exists lexware_contact_id text;
create index if not exists idx_clients_lexware_contact
  on public.clients(lexware_contact_id) where lexware_contact_id is not null;

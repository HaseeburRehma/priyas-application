-- =============================================================================
-- Cleanup: kill stale chat channels left over from earlier migration runs.
-- =============================================================================
-- After this runs each org should have exactly five default channels:
--   #einsatzplan
--   #allgemein
--   #pflege-alltagshilfe
--   #finanzen
--   🔒 #geschaeftsleitung (private)
-- =============================================================================

-- 1) Drop a "general" placeholder if it exists (was a debug channel).
delete from public.chat_channels
where name in ('#general', 'general')
  and is_direct = false;

-- 2) Drop the legacy #geschäftsleitung row (diacritic, slug "-eschaeftsleitung")
--    so the canonical ASCII version (#geschaeftsleitung) remains.
delete from public.chat_channels
where name = '#geschäftsleitung'
  and is_direct = false;

-- 3) De-duplicate by (org_id, slug) just in case any sibling rows survived —
--    keep the oldest, drop the rest.
delete from public.chat_channels c
using public.chat_channels older
where c.org_id = older.org_id
  and c.slug = older.slug
  and c.id <> older.id
  and c.created_at > older.created_at
  and c.is_direct = false
  and older.is_direct = false;

-- 4) Re-run the seed to fill in any defaults that ended up missing after
--    the deletes (e.g. an org whose only #geschäftsleitung was the legacy
--    one, now has none).
do $$
declare o record;
begin
  for o in select id from public.organizations loop
    perform public.seed_default_chat_channels(o.id);
  end loop;
end $$;

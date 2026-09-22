/**
 * Feature-update #18 (web view) · Cleaning-supply flags loader.
 *
 * Backed by `public.supply_flags` (migration 20260921_000062).
 * Field staff mark whether the customer has supplies (Yes / No) when
 * they check out of a shift on the mobile app. Missing supplies +
 * note surface here on the web customer profile so the PM can
 * follow up (order/bring supplies next time).
 *
 * RLS is org-scoped, so the loader relies on the caller's session
 * client — no explicit orgId filter needed at this layer.
 */
import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SupplyFlag = {
  id: string;
  supplies_ok: boolean;
  note: string | null;
  reported_by_name: string | null;
  reported_at: string;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by_name: string | null;
};

const RECENT_CAP = 10;

/**
 * Load the last N supply-flag events for a client. Ordered newest
 * first. Includes the reporter's + resolver's full_name via a light
 * profiles join so the card can render the byline without a second
 * round-trip.
 */
export async function loadClientSupplyFlags(
  clientId: string,
): Promise<SupplyFlag[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("supply_flags")
    .select(
      // Disambiguate via column-name hint: supply_flags has two FKs
      // to profiles (reported_by + resolved_by), so PostgREST needs
      // `profiles!<column>` to know which side each embed follows.
      `id, supplies_ok, note, resolved, resolved_at, created_at,
       reporter:profiles!reported_by ( full_name ),
       resolver:profiles!resolved_by ( full_name )`,
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(RECENT_CAP);

  type Row = {
    id: string;
    supplies_ok: boolean;
    note: string | null;
    resolved: boolean;
    resolved_at: string | null;
    created_at: string;
    reporter: { full_name: string | null } | null;
    resolver: { full_name: string | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    supplies_ok: r.supplies_ok,
    note: r.note ?? null,
    reported_by_name: r.reporter?.full_name ?? null,
    reported_at: r.created_at,
    resolved: r.resolved,
    resolved_at: r.resolved_at,
    resolved_by_name: r.resolver?.full_name ?? null,
  }));
}

/**
 * Properties loader for the mobile Properties screen.
 *
 * Admin + dispatcher (via RLS). Read-only surface — creating a new
 * property still goes through the web wizard.
 */

import { getSupabase } from "@/lib/supabase";

export type PropertyRow = {
  id: string;
  name: string;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  weekly_frequency: number | null;
  kind: string | null;
  client_name: string;
  client_id: string;
};

export type PropertyDetail = PropertyRow & {
  notes: string | null;
  key_holder: string | null;
  alarm_notes: string | null;
};

export async function loadMobileProperties(args: {
  q?: string;
  clientId?: string;
}): Promise<PropertyRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("properties")
    .select(
      `id, name, address_line1, postal_code, city, weekly_frequency, kind,
       client_id, client:clients ( display_name )`,
    )
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(500);

  if (args.q && args.q.trim()) {
    const safe = args.q.trim().replace(/[,()\\%_]/g, "");
    if (safe) {
      query = query.or(
        `name.ilike.%${safe}%,address_line1.ilike.%${safe}%,city.ilike.%${safe}%`,
      );
    }
  }
  if (args.clientId) {
    query = query.eq("client_id", args.clientId);
  }

  const { data, error } = await query;
  if (error) throw error;

  type Row = {
    id: string;
    name: string;
    address_line1: string | null;
    postal_code: string | null;
    city: string | null;
    weekly_frequency: number | null;
    kind: string | null;
    client_id: string;
    client: { display_name: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    address_line1: r.address_line1,
    postal_code: r.postal_code,
    city: r.city,
    weekly_frequency: r.weekly_frequency,
    kind: r.kind,
    client_id: r.client_id,
    client_name: r.client?.display_name ?? "—",
  }));
}

export async function loadMobilePropertyDetail(
  id: string,
): Promise<PropertyDetail | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("properties")
    .select(
      `id, name, address_line1, postal_code, city, weekly_frequency, kind,
       client_id, notes, key_holder, alarm_notes,
       client:clients ( display_name )`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as {
    id: string;
    name: string;
    address_line1: string | null;
    postal_code: string | null;
    city: string | null;
    weekly_frequency: number | null;
    kind: string | null;
    client_id: string;
    notes: string | null;
    key_holder: string | null;
    alarm_notes: string | null;
    client: { display_name: string } | null;
  };
  return {
    id: r.id,
    name: r.name,
    address_line1: r.address_line1,
    postal_code: r.postal_code,
    city: r.city,
    weekly_frequency: r.weekly_frequency,
    kind: r.kind,
    client_id: r.client_id,
    client_name: r.client?.display_name ?? "—",
    notes: r.notes,
    key_holder: r.key_holder,
    alarm_notes: r.alarm_notes,
  };
}

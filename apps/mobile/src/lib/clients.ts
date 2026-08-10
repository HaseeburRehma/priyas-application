/**
 * Clients loaders for the mobile Clients tab.
 *
 * Admin + dispatcher only (RLS enforces this — the client tab is also
 * hidden from field staff at the navigation layer, but this stays
 * as the source of truth).
 *
 * Kept intentionally minimal — the web app has the full CRUD wizard;
 * mobile is a read-first surface with drill-down to detail.
 */

import { getSupabase } from "@/lib/supabase";

export type ClientCustomerType = "residential" | "commercial" | "alltagshilfe";
export type ClientPayerType =
  | "care_fund"
  | "private_pay"
  | "insurance"
  | "commercial";

export type ClientRow = {
  id: string;
  display_name: string;
  customer_type: ClientCustomerType;
  payer_type: ClientPayerType | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  property_count: number;
};

export type ClientDetail = {
  id: string;
  display_name: string;
  customer_type: ClientCustomerType;
  payer_type: ClientPayerType | null;
  first_name: string | null;
  last_name: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  insurance_provider: string | null;
  insurance_number: string | null;
  care_level: number | null;
  notes: string | null;
  archived: boolean;
  properties: Array<{ id: string; name: string; city: string | null }>;
};

/**
 * List clients scoped to the caller's org via RLS. Supports a search
 * term (matches name / email / phone) and a type filter.
 */
export async function loadMobileClients(args: {
  q?: string;
  type?: ClientCustomerType | "all";
  limit?: number;
}): Promise<ClientRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("clients")
    .select(
      `id, display_name, customer_type, payer_type, city, phone, email`,
    )
    .eq("archived", false)
    .is("deleted_at", null)
    .order("display_name", { ascending: true })
    .limit(args.limit ?? 200);

  if (args.q && args.q.trim()) {
    // Strip PostgREST grammar chars + LIKE wildcards. Same defence the
    // web loader applies — keeps the caller from breaking out of .or().
    const safe = args.q.trim().replace(/[,()\\%_]/g, "");
    if (safe) {
      query = query.or(
        `display_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
      );
    }
  }
  if (args.type && args.type !== "all") {
    query = query.eq("customer_type", args.type);
  }

  const { data, error } = await query;
  if (error) throw error;

  type Row = {
    id: string;
    display_name: string;
    customer_type: ClientCustomerType;
    payer_type: ClientPayerType | null;
    city: string | null;
    phone: string | null;
    email: string | null;
  };
  const rows = (data ?? []) as Row[];

  // Property counts — one round-trip, group in JS. Empty list short-circuits.
  const ids = rows.map((r) => r.id);
  const countByClient = new Map<string, number>();
  if (ids.length > 0) {
    const { data: props } = await supabase
      .from("properties")
      .select("client_id")
      .is("deleted_at", null)
      .in("client_id", ids);
    for (const p of (props ?? []) as Array<{ client_id: string }>) {
      countByClient.set(p.client_id, (countByClient.get(p.client_id) ?? 0) + 1);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    display_name: r.display_name,
    customer_type: r.customer_type,
    payer_type: r.payer_type,
    city: r.city,
    phone: r.phone,
    email: r.email,
    property_count: countByClient.get(r.id) ?? 0,
  }));
}

export async function loadMobileClientDetail(
  id: string,
): Promise<ClientDetail | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select(
      `id, display_name, customer_type, payer_type, first_name, last_name,
       address_line1, postal_code, city, email, phone,
       insurance_provider, insurance_number, care_level, notes, archived`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const c = data as ClientDetail;

  const { data: props } = await supabase
    .from("properties")
    .select("id, name, city")
    .eq("client_id", id)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  return {
    ...c,
    properties: ((props ?? []) as Array<{
      id: string;
      name: string;
      city: string | null;
    }>).map((p) => ({ id: p.id, name: p.name, city: p.city })),
  };
}

/**
 * Properties loader for the mobile Properties screen.
 *
 * Admin + dispatcher (via RLS). Read-only surface — creating a new
 * property still goes through the web wizard.
 */

import { getSupabase } from "@/lib/supabase";

/** Property kinds — same vocabulary as the web table chips. */
export type PropertyKind =
  | "office"
  | "retail"
  | "residential"
  | "medical"
  | "industrial"
  | "other";

/** Derived from shift activity (there is no properties.status column). */
export type PropertyStatus = "active" | "onboarding" | "attention";

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
  /** Optional extras (added for the redesigned list; may be absent). */
  created_at?: string | null;
  client_customer_type?: string | null;
  /** Shifts in the last 7 days (realised, not pre-booked). */
  shifts_last_7d?: number;
  /** Most recent employee on those shifts. */
  team_lead_name?: string | null;
  status?: PropertyStatus;
};

export type PropertyDetail = PropertyRow & {
  notes: string | null;
  key_holder: string | null;
  alarm_notes: string | null;
  /** Optional extras (structured location + safety fields). */
  address_line2?: string | null;
  size_sqm?: number | null;
  floor?: string | null;
  building_section?: string | null;
  access_code?: string | null;
  allergies?: string | null;
  restricted_areas?: string | null;
  safety_regulations?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/**
 * Same heuristic the web app uses until a real kind column lands: an
 * explicit `kind` value wins when it matches the vocabulary, otherwise
 * infer from the name / owning client type.
 */
export function inferPropertyKind(
  name: string,
  clientType: string | null | undefined,
  kind?: string | null,
): PropertyKind {
  const known: PropertyKind[] = ["office", "retail", "residential", "medical", "industrial", "other"];
  if (kind && (known as string[]).includes(kind)) return kind as PropertyKind;
  const lc = name.toLowerCase();
  if (clientType === "alltagshilfe") return "residential";
  if (lc.includes("hotel") || lc.includes("residence") || lc.includes("home") || lc.includes("wohn"))
    return "residential";
  if (lc.includes("retail") || lc.includes("einzelhandel") || lc.includes("shop") || lc.includes("laden"))
    return "retail";
  if (lc.includes("clinic") || lc.includes("medical") || lc.includes("praxis"))
    return "medical";
  if (lc.includes("industrial") || lc.includes("warehouse") || lc.includes("factory") || lc.includes("lager"))
    return "industrial";
  return "office";
}

// `weekly_frequency`, `kind`, `key_holder`, `alarm_notes` don't exist in
// the production schema (checked 2026-10-09; no migration declares them),
// and selecting a missing column fails the whole request. The selects use
// the declared columns only; those fields stay optional (always null) so
// the UI hides them until real columns land.
const LIST_LEGACY = "";
const DETAIL_LEGACY = "";

export async function loadMobileProperties(args: {
  q?: string;
  clientId?: string;
}): Promise<PropertyRow[]> {
  const supabase = getSupabase();
  const build = (legacy: string) => {
    let query = supabase
      .from("properties")
      .select(
        `id, name, address_line1, postal_code, city, ${legacy}
         created_at, client_id, client:clients ( display_name, customer_type )`,
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
    return query;
  };

  const res = await build(LIST_LEGACY);
  if (res.error) throw res.error;

  type Row = {
    id: string;
    name: string;
    address_line1: string | null;
    postal_code: string | null;
    city: string | null;
    weekly_frequency?: number | null;
    kind?: string | null;
    created_at: string | null;
    client_id: string;
    client: { display_name: string; customer_type: string | null } | null;
  };
  const rows = (res.data ?? []) as unknown as Row[];

  // Realised shifts in the last 7 days → frequency, team lead, status.
  // Org-scoped by RLS; no id list so the URL stays short for 500 rows.
  const now = new Date();
  const sevenAgo = new Date(now.getTime() - 7 * 86_400_000);
  const shiftsByProp = new Map<string, number>();
  const leadByProp = new Map<string, string>();
  if (rows.length > 0) {
    const { data: shifts } = await supabase
      .from("shifts")
      .select("property_id, starts_at, employee:employees ( full_name )")
      .is("deleted_at", null)
      .gte("starts_at", sevenAgo.toISOString())
      .lte("starts_at", now.toISOString())
      .order("starts_at", { ascending: false })
      .limit(5000);
    for (const s of (shifts ?? []) as unknown as Array<{
      property_id: string;
      employee: { full_name: string } | null;
    }>) {
      shiftsByProp.set(s.property_id, (shiftsByProp.get(s.property_id) ?? 0) + 1);
      if (s.employee && !leadByProp.has(s.property_id)) {
        leadByProp.set(s.property_id, s.employee.full_name);
      }
    }
  }

  const thirtyAgo = now.getTime() - 30 * 86_400_000;
  return rows.map((r) => {
    const recent = shiftsByProp.get(r.id) ?? 0;
    const young = !!r.created_at && new Date(r.created_at).getTime() >= thirtyAgo;
    return {
      id: r.id,
      name: r.name,
      address_line1: r.address_line1,
      postal_code: r.postal_code,
      city: r.city,
      weekly_frequency: r.weekly_frequency ?? null,
      kind: r.kind ?? null,
      client_id: r.client_id,
      client_name: r.client?.display_name ?? "—",
      created_at: r.created_at,
      client_customer_type: r.client?.customer_type ?? null,
      shifts_last_7d: recent,
      team_lead_name: leadByProp.get(r.id) ?? null,
      // Same rule as the web list: new + no shifts → onboarding,
      // no shifts → attention, otherwise active.
      status: recent > 0 ? "active" : young ? "onboarding" : "attention",
    };
  });
}

export async function loadMobilePropertyDetail(
  id: string,
): Promise<PropertyDetail | null> {
  const supabase = getSupabase();
  const build = (legacy: string) =>
    supabase
      .from("properties")
      .select(
        `id, name, address_line1, address_line2, postal_code, city, ${legacy}
         client_id, notes, size_sqm, created_at, latitude, longitude,
         floor, building_section, access_code,
         allergies, restricted_areas, safety_regulations,
         client:clients ( display_name, customer_type )`,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
  const res = await build(DETAIL_LEGACY);
  if (res.error || !res.data) return null;
  const r = res.data as unknown as {
    id: string;
    name: string;
    address_line1: string | null;
    address_line2: string | null;
    postal_code: string | null;
    city: string | null;
    weekly_frequency?: number | null;
    kind?: string | null;
    client_id: string;
    notes: string | null;
    key_holder?: string | null;
    alarm_notes?: string | null;
    size_sqm: number | string | null;
    created_at: string | null;
    latitude: number | string | null;
    longitude: number | string | null;
    floor: string | null;
    building_section: string | null;
    access_code: string | null;
    allergies: string | null;
    restricted_areas: string | null;
    safety_regulations: string | null;
    client: { display_name: string; customer_type: string | null } | null;
  };
  const num = (v: number | string | null) => (v == null ? null : Number(v));
  return {
    id: r.id,
    name: r.name,
    address_line1: r.address_line1,
    postal_code: r.postal_code,
    city: r.city,
    weekly_frequency: r.weekly_frequency ?? null,
    kind: r.kind ?? null,
    client_id: r.client_id,
    client_name: r.client?.display_name ?? "—",
    notes: r.notes,
    key_holder: r.key_holder ?? null,
    alarm_notes: r.alarm_notes ?? null,
    created_at: r.created_at,
    client_customer_type: r.client?.customer_type ?? null,
    address_line2: r.address_line2,
    size_sqm: num(r.size_sqm),
    floor: r.floor,
    building_section: r.building_section,
    access_code: r.access_code,
    allergies: r.allergies,
    restricted_areas: r.restricted_areas,
    safety_regulations: r.safety_regulations,
    latitude: num(r.latitude),
    longitude: num(r.longitude),
  };
}

/* ============================================================================
 * Property activity — shifts, team and safety counters for the detail
 * screen. Separate from the base record so a missing table can't hide it.
 * ========================================================================== */

export type PropertyShift = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  employee_name: string | null;
};

export type PropertyActivity = {
  /** Most recent shifts (incl. the coming week), newest first. */
  shifts: PropertyShift[];
  total_shifts: number;
  shifts_last_7d: number;
  shifts_last_14d: number;
  shifts_this_month: number;
  /** Distinct employees on the last 50 shifts. */
  team: string[];
  /** damage_reports in the trailing 12 months (null if unavailable). */
  incidents_12mo: number | null;
  /** property_keys still out (null if unavailable). */
  keys_out: number | null;
};

export async function loadMobilePropertyActivity(id: string): Promise<PropertyActivity> {
  const supabase = getSupabase();
  const now = new Date();
  const ahead = new Date(now.getTime() + 7 * 86_400_000);
  const d7 = new Date(now.getTime() - 7 * 86_400_000);
  const d14 = new Date(now.getTime() - 14 * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
  const count = (from: Date, to?: Date) => {
    let q = supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .eq("property_id", id)
      .is("deleted_at", null)
      .gte("starts_at", from.toISOString());
    if (to) q = q.lte("starts_at", to.toISOString());
    return q;
  };

  const [listRes, totalRes, c7, c14, cMonth, teamRes, incRes, keysRes] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, starts_at, ends_at, status, notes, employee:employees ( full_name )")
      .eq("property_id", id)
      .is("deleted_at", null)
      .lte("starts_at", ahead.toISOString())
      .order("starts_at", { ascending: false })
      .limit(30),
    supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .eq("property_id", id)
      .is("deleted_at", null),
    count(d7, now),
    count(d14, now),
    count(monthStart),
    supabase
      .from("shifts")
      .select("employee:employees ( id, full_name )")
      .eq("property_id", id)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false })
      .limit(50),
    supabase
      .from("damage_reports")
      .select("id", { count: "exact", head: true })
      .eq("property_id", id)
      .gte("created_at", yearAgo.toISOString()),
    supabase
      .from("property_keys")
      .select("id", { count: "exact", head: true })
      .eq("property_id", id)
      .is("returned_at", null),
  ]);
  if (listRes.error) throw listRes.error;

  type S = {
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    notes: string | null;
    employee: { full_name: string } | null;
  };
  const seen = new Set<string>();
  const team: string[] = [];
  for (const s of (teamRes.data ?? []) as unknown as Array<{
    employee: { id: string; full_name: string } | null;
  }>) {
    if (!s.employee || seen.has(s.employee.id)) continue;
    seen.add(s.employee.id);
    team.push(s.employee.full_name);
  }

  return {
    shifts: ((listRes.data ?? []) as unknown as S[]).map((s) => ({
      id: s.id,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      status: s.status,
      notes: s.notes,
      employee_name: s.employee?.full_name ?? null,
    })),
    total_shifts: totalRes.count ?? 0,
    shifts_last_7d: c7.count ?? 0,
    shifts_last_14d: c14.count ?? 0,
    shifts_this_month: cMonth.count ?? 0,
    team,
    incidents_12mo: incRes.error ? null : (incRes.count ?? 0),
    keys_out: keysRes.error ? null : (keysRes.count ?? 0),
  };
}

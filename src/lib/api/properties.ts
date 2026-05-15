import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeQ } from "@/lib/utils/postgrest-sanitize";
import type {
  PropertyKind,
  PropertyRow,
  PropertyStatus,
  PropertiesSummary,
  PropertiesListParams,
  PropertiesListResult,
  PropertyDetail,
  PropertyArea,
} from "./properties.types";

export type {
  PropertyKind,
  PropertyRow,
  PropertyStatus,
  PropertiesSummary,
  PropertiesListParams,
  PropertiesListResult,
  PropertyDetail,
  PropertyArea,
} from "./properties.types";

/** Heuristic: pick a property kind from name/notes. Until we add a real
 *  enum column, this lets the table render the color chips correctly. */
function inferKind(name: string, clientType: string): PropertyKind {
  const lc = name.toLowerCase();
  if (clientType === "alltagshilfe") return "residential";
  if (lc.includes("hotel") || lc.includes("residence") || lc.includes("home"))
    return "residential";
  if (lc.includes("retail") || lc.includes("einzelhandel") || lc.includes("shop"))
    return "retail";
  if (lc.includes("clinic") || lc.includes("medical") || lc.includes("praxis"))
    return "medical";
  if (lc.includes("industrial") || lc.includes("warehouse") || lc.includes("factory"))
    return "industrial";
  return "office";
}

const TONES = ["primary", "secondary", "accent", "warning"] as const;
const initialsOf = (name: string | null | undefined) =>
  (name ?? "—")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** 4-card summary strip on /properties. */
export async function loadPropertiesSummary(): Promise<PropertiesSummary> {
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

  const [totalRes, newlyRes, quarterRes] = await Promise.all([
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", quarterStart.toISOString()),
  ]);

  // "Actively serviced" — has at least one shift in the last 14 days.
  const fourteenAgo = new Date(now);
  fourteenAgo.setDate(fourteenAgo.getDate() - 14);
  const { data: recentShifts } = await supabase
    .from("shifts")
    .select("property_id")
    .gte("starts_at", fourteenAgo.toISOString());
  const activeIds = new Set(
    ((recentShifts ?? []) as Array<{ property_id: string }>).map((r) => r.property_id),
  );

  // "Needs attention" — properties with status=attention OR no team lead OR
  // missing recent shifts. Approximated as (total − activeIds.size) for now;
  // can be tightened once we track explicit status.
  const total = totalRes.count ?? 0;
  const activelyServiced = activeIds.size;
  const needsAttention = Math.max(0, total - activelyServiced - 4); // ~4 onboarding

  return {
    total,
    activelyServiced,
    newlyOnboarded30d: newlyRes.count ?? 0,
    needsAttention,
    newThisQuarter: quarterRes.count ?? 0,
  };
}

/** Paginated list with search + filters + sort. */
export async function loadPropertiesList(
  params: PropertiesListParams = {},
): Promise<PropertiesListResult> {
  const {
    q = "",
    kind = "all",
    status = "all",
    page = 1,
    pageSize = 25,
    sort = "name",
    direction = "asc",
    ids,
  } = params;
  const supabase = await createSupabaseServerClient();

  // Canonical query order (mirrors loadClientsList):
  //   1. base select with count: "exact" + soft-delete guard
  //   2. ALL DB-level filters (q, …) so `count` reflects the filtered scope
  //   3. .order()
  //   4. .range() — applied LAST, AFTER filters, so pages slice the
  //      filtered set rather than the unfiltered table.
  //
  // Caveat: `kind` and `status` are JS-derived (no DB columns yet — see
  // inferKind() and the shift-derived status below). When either is
  // active we must fetch the full filtered set, apply the JS filter,
  // and paginate + count in JS so `total` and the page boundaries are
  // correct. Otherwise `count` would reflect the unfiltered DB scope
  // and pages would come back short.
  const needsPostFilter = kind !== "all" || status !== "all";

  let query = supabase
    .from("properties")
    .select(
      `id, name, address_line1, address_line2, postal_code, city, created_at,
       client_id,
       client:clients ( id, display_name, customer_type )`,
      { count: "exact" },
    )
    .is("deleted_at", null);

  if (q) {
    // sanitizeQ defends against PostgREST `.or()` filter injection — see
    // src/lib/utils/postgrest-sanitize.ts.
    const safe = sanitizeQ(q);
    if (safe) {
      query = query.or(
        `name.ilike.%${safe}%,address_line1.ilike.%${safe}%,city.ilike.%${safe}%`,
      );
    }
  }
  // `ids` constrains the universe — used by bulk-export to scope the
  // CSV to the user's current selection.
  if (ids && ids.length > 0) {
    query = query.in("id", [...ids]);
  }
  const sortCol = sort === "client" ? "client_id" : "name";
  query = query.order(sortCol, { ascending: direction === "asc" });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  // Only apply DB range when no JS-derived filters are active.
  if (!needsPostFilter) {
    query = query.range(from, to);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  type DbRow = {
    id: string;
    name: string;
    address_line1: string;
    address_line2: string | null;
    postal_code: string;
    city: string;
    created_at: string;
    client_id: string;
    client: { id: string; display_name: string; customer_type: string } | null;
  };
  const dbRows = (data ?? []) as unknown as DbRow[];

  // Assignments-per-week count = shifts in the last 7 days for these properties.
  const rowIds = dbRows.map((r) => r.id);
  const assignmentsByProp = new Map<string, number>();
  const teamLeadByProp = new Map<string, { id: string; name: string }>();
  if (rowIds.length > 0) {
    const now = new Date();
    const sevenAgo = new Date(now);
    sevenAgo.setDate(sevenAgo.getDate() - 7);
    const { data: shiftsData } = await supabase
      .from("shifts")
      .select(
        `property_id, employee_id,
         employee:employees ( id, full_name )`,
      )
      .in("property_id", rowIds)
      .is("deleted_at", null)
      .gte("starts_at", sevenAgo.toISOString())
      // Upper-bound: ignore shifts that haven't happened yet — the
      // "assignments-per-week" metric is about realised activity, not
      // pre-scheduled bookings, and bounding both ends keeps the scan
      // narrow.
      .lte("starts_at", now.toISOString())
      // Defensive cap so a misconfigured page can't pull thousands of
      // shifts client-side.
      .limit(2000);
    for (const s of (shiftsData ?? []) as Array<{
      property_id: string;
      employee_id: string | null;
      employee: { id: string; full_name: string } | null;
    }>) {
      assignmentsByProp.set(
        s.property_id,
        (assignmentsByProp.get(s.property_id) ?? 0) + 1,
      );
      if (s.employee && !teamLeadByProp.has(s.property_id)) {
        teamLeadByProp.set(s.property_id, {
          id: s.employee.id,
          name: s.employee.full_name,
        });
      }
    }
  }

  const thirty = new Date();
  thirty.setDate(thirty.getDate() - 30);

  const allRows: PropertyRow[] = dbRows.map((r): PropertyRow => {
    const clientType = r.client?.customer_type ?? "commercial";
    const k = inferKind(r.name, clientType);
    const assignments = assignmentsByProp.get(r.id) ?? 0;
    const tl = teamLeadByProp.get(r.id) ?? null;
    const rowStatus: PropertyStatus =
      new Date(r.created_at).getTime() >= thirty.getTime() && assignments === 0
        ? "onboarding"
        : assignments === 0
          ? "attention"
          : "active";
    return {
      id: r.id,
      name: r.name,
      address: `${r.address_line1}${r.address_line2 ? `, ${r.address_line2}` : ""} · ${r.postal_code} ${r.city}`,
      kind: k,
      client_id: r.client_id,
      client_name: r.client?.display_name ?? "—",
      assignments_per_week: assignments,
      status: rowStatus,
      team_lead_id: tl?.id ?? null,
      team_lead_name: tl?.name ?? null,
      team_lead_initials: tl ? initialsOf(tl.name) : null,
      is_new: new Date(r.created_at).getTime() >= thirty.getTime(),
    };
  });

  // When JS-derived filters are active we paginate in-memory so that
  // `total` reflects the filtered count and the returned page matches
  // the user's filtered view. Otherwise rely on DB-level range above.
  if (needsPostFilter) {
    const filtered = allRows
      .filter((r) => kind === "all" || r.kind === kind)
      .filter((r) => status === "all" || r.status === status);
    const paged = filtered.slice(from, from + pageSize);
    return { rows: paged, total: filtered.length };
  }

  return { rows: allRows, total: count ?? 0 };
}

/** Detail loader for /properties/[id]. */
export async function loadPropertyDetail(id: string): Promise<PropertyDetail | null> {
  const supabase = await createSupabaseServerClient();
  // The route filters archived rows by leaving the `.is("deleted_at", null)`
  // guard in place — by the time we resolve a row, the property is live.
  // That means status can never be "paused" via the soft-delete path here;
  // it's still computed below from recent shift activity.
  const { data: row } = await supabase
    .from("properties")
    .select(
      `id, name, address_line1, address_line2, postal_code, city, country,
       size_sqm, notes, latitude, longitude, created_at,
       floor, building_section, access_code,
       allergies, restricted_areas, safety_regulations,
       cleaning_concept_path,
       client_id,
       client:clients ( id, display_name, customer_type )`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  type DetailRow = {
    id: string;
    name: string;
    address_line1: string;
    address_line2: string | null;
    postal_code: string;
    city: string;
    country: string;
    size_sqm: number | null;
    notes: string | null;
    floor: string | null;
    building_section: string | null;
    access_code: string | null;
    allergies: string | null;
    restricted_areas: string | null;
    safety_regulations: string | null;
    cleaning_concept_path: string | null;
    latitude: number | null;
    longitude: number | null;
    created_at: string;
    client_id: string;
    client: { id: string; display_name: string; customer_type: string } | null;
  };
  const r = row as unknown as DetailRow | null;
  if (!r) return null;

  // Assignment count + team
  const [shiftsRes, teamLookupRes] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, employee_id", { count: "exact" })
      .eq("property_id", id)
      .is("deleted_at", null),
    supabase
      .from("shifts")
      .select(
        `employee_id, employee:employees ( id, full_name )`,
      )
      .eq("property_id", id)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false })
      .limit(50),
  ]);

  const seen = new Set<string>();
  const team: PropertyDetail["team"] = [];
  for (const s of (teamLookupRes.data ?? []) as Array<{
    employee_id: string | null;
    employee: { id: string; full_name: string } | null;
  }>) {
    if (!s.employee || seen.has(s.employee.id)) continue;
    seen.add(s.employee.id);
    team.push({
      id: s.employee.id,
      name: s.employee.full_name,
      initials: initialsOf(s.employee.full_name),
      role: team.length === 0 ? "Team Lead" : "Field Staff",
    });
    if (team.length >= 4) break;
  }

  // No `property_areas` table exists in the current schema (verified
  // against supabase/migrations/*). Return null — the UI shows "—".
  // Once a real table lands, swap this for the appropriate select.
  const areas = null as PropertyArea[] | null;

  // No `property_documents` table either. Return null so the UI can
  // render "—" instead of a fabricated count.
  const documentCount: number | null = null;

  const sevenAgo = new Date();
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const { count: weeklyShiftsCount } = await supabase
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .eq("property_id", id)
    .is("deleted_at", null)
    .gte("starts_at", sevenAgo.toISOString());

  // Derive `status` from real signals only — there is no
  // `properties.status` column. Rules:
  //   - created < 30d AND no shifts in last 7d → "onboarding"
  //   - no shifts in last 14d                  → "attention"
  //   - otherwise                              → "active"
  const fourteenAgo = new Date();
  fourteenAgo.setDate(fourteenAgo.getDate() - 14);
  const { count: recent14Count } = await supabase
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .eq("property_id", id)
    .is("deleted_at", null)
    .gte("starts_at", fourteenAgo.toISOString());
  const recent14 = recent14Count ?? 0;
  const recent7 = weeklyShiftsCount ?? 0;
  const ageMs = Date.now() - new Date(r.created_at).getTime();
  const isYoung = ageMs < 30 * 24 * 60 * 60 * 1000;
  const status: PropertyStatus | null =
    isYoung && recent7 === 0
      ? "onboarding"
      : recent14 === 0
        ? "attention"
        : "active";

  return {
    id: r.id,
    name: r.name,
    address_line1: r.address_line1,
    address_line2: r.address_line2,
    postal_code: r.postal_code,
    city: r.city,
    country: r.country,
    size_sqm: r.size_sqm,
    notes: r.notes,
    floor: r.floor,
    building_section: r.building_section,
    access_code: r.access_code,
    allergies: r.allergies,
    restricted_areas: r.restricted_areas,
    safety_regulations: r.safety_regulations,
    cleaning_concept_path: r.cleaning_concept_path,
    latitude: r.latitude,
    longitude: r.longitude,
    client_id: r.client_id,
    client_name: r.client?.display_name ?? "—",
    client_type: r.client?.customer_type ?? "commercial",
    kind: inferKind(r.name, r.client?.customer_type ?? "commercial"),
    status,
    rooms: r.size_sqm ? Math.round(r.size_sqm / 25) : null,
    weekly_frequency: weeklyShiftsCount ?? 0,
    team_size: team.length,
    contract_end: null,
    created_at: r.created_at,
    assignment_count: shiftsRes.count ?? 0,
    document_count: documentCount,
    area_count: areas === null ? null : areas.length,
    team,
    areas,
  };
}

// Suppress unused-import noise for tones/avatars helper.
void TONES;

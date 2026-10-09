/**
 * Schedule + shift loaders scoped to the caller's own assignments.
 */

import { startOfWeek } from "date-fns";
import { getSupabase } from "@/lib/supabase";

export type ShiftRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  /** Dispatcher notes on the shift (access, special requests). */
  notes?: string | null;
  property: {
    id: string;
    name: string;
    /** One-line postal address ("Hauptstraße 12, 10115 Berlin"). */
    address: string | null;
    lat: number | null;
    lng: number | null;
    address_line1?: string | null;
    floor?: string | null;
    building_section?: string | null;
  };
  client: {
    id: string;
    name: string;
    /** "alltagshilfe" | "residential" | "commercial" — drives the
     *  Priya's / Alltagshilfe service split in the plan. */
    customer_type?: string | null;
  };
};

type SRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  properties: {
    id: string;
    name: string;
    address_line1: string | null;
    postal_code: string | null;
    city: string | null;
    latitude: number | string | null;
    longitude: number | string | null;
    floor: string | null;
    building_section: string | null;
    clients: { id: string; display_name: string; customer_type: string | null };
  };
};

/** numeric(9,6) can arrive as number or string — normalise to number. */
function num(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function joinAddress(p: {
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
}): string | null {
  const street = p.address_line1?.trim();
  if (!street) return null;
  const town = [p.postal_code?.trim(), p.city?.trim()].filter(Boolean).join(" ");
  return town ? `${street}, ${town}` : street;
}

/**
 * The caller's shifts from the start of the current week (or the last
 * 24 h, whichever is earlier) onward, so the plan's week strip can show
 * the days already behind us. Column names follow the DB schema
 * (clients.display_name, properties.address_line1/latitude/longitude);
 * the returned shape is unchanged apart from optional extras.
 */
export async function loadMyShifts(employeeId: string): Promise<ShiftRow[]> {
  const supabase = getSupabase();
  const now = new Date();
  const from = Math.min(
    startOfWeek(now, { weekStartsOn: 1 }).getTime(),
    now.getTime() - 24 * 3_600_000,
  );
  const { data } = await supabase
    .from("shifts")
    .select(
      "id, starts_at, ends_at, status, notes, properties!inner(id, name, address_line1, postal_code, city, latitude, longitude, floor, building_section, clients!inner(id, display_name, customer_type))",
    )
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .gte("ends_at", new Date(from).toISOString())
    .order("starts_at", { ascending: true })
    .limit(100);
  const rows = ((data ?? []) as unknown) as SRow[];
  return rows.map((s) => ({
    id: s.id,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    status: s.status,
    notes: s.notes,
    property: {
      id: s.properties.id,
      name: s.properties.name,
      address: joinAddress(s.properties),
      lat: num(s.properties.latitude),
      lng: num(s.properties.longitude),
      address_line1: s.properties.address_line1,
      floor: s.properties.floor,
      building_section: s.properties.building_section,
    },
    client: {
      id: s.properties.clients.id,
      name: s.properties.clients.display_name,
      customer_type: s.properties.clients.customer_type,
    },
  }));
}

export type TimeEntry = {
  id: string;
  shift_id: string;
  kind: "check_in" | "check_out" | "break_start" | "break_end";
  occurred_at: string;
  lat: number | null;
  lng: number | null;
};

export async function loadShiftEntries(
  shiftId: string,
  employeeId: string,
): Promise<TimeEntry[]> {
  const supabase = getSupabase();
  // DB columns are latitude/longitude; exposed as lat/lng (unchanged type).
  const { data } = await supabase
    .from("time_entries")
    .select("id, shift_id, kind, occurred_at, latitude, longitude")
    .eq("shift_id", shiftId)
    .eq("employee_id", employeeId)
    .order("occurred_at", { ascending: true });
  type Row = Omit<TimeEntry, "lat" | "lng"> & {
    latitude: number | string | null;
    longitude: number | string | null;
  };
  return ((data ?? []) as unknown as Row[]).map(({ latitude, longitude, ...e }) => ({
    ...e,
    lat: num(latitude),
    lng: num(longitude),
  }));
}

/**
 * Insert a time_entry. Mirrors what the web `clockAction` /
 * `breakAction` do server-side: validates state (can't check-out
 * before check-in, can't double-check-in, break-end requires an open
 * break-start).
 */
export async function insertTimeEntry(args: {
  shiftId: string;
  employeeId: string;
  kind: TimeEntry["kind"];
  lat: number | null;
  lng: number | null;
  /** GPS accuracy radius in metres, if known. */
  accuracy?: number | null;
  /** Distance to the property in metres, if computed. */
  distance?: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  // Validate state client-side (best-effort). RLS + server checks still
  // final-guard, but this gives a snappier error for the common case.
  const existing = await loadShiftEntries(args.shiftId, args.employeeId);
  const hasIn = existing.some((e) => e.kind === "check_in");
  const hasOut = existing.some((e) => e.kind === "check_out");
  const openBreak =
    existing.filter((e) => e.kind === "break_start").length >
    existing.filter((e) => e.kind === "break_end").length;

  if (args.kind === "check_in" && hasIn)
    return { ok: false, error: "already_checked_in" };
  if (args.kind === "check_out" && !hasIn)
    return { ok: false, error: "must_check_in_first" };
  if (args.kind === "check_out" && hasOut)
    return { ok: false, error: "already_checked_out" };
  if (args.kind === "break_start" && !hasIn)
    return { ok: false, error: "must_check_in_first" };
  if (args.kind === "break_start" && hasOut)
    return { ok: false, error: "shift_already_ended" };
  if (args.kind === "break_start" && openBreak)
    return { ok: false, error: "break_already_open" };
  if (args.kind === "break_end" && !openBreak)
    return { ok: false, error: "no_open_break" };

  // time_entries (migration 000018) needs org_id + property_id, both NOT
  // NULL, and the RLS insert policy checks org_id = current_org_id().
  // Take both from the shift itself so callers can't get them wrong.
  const { data: sh, error: shErr } = await supabase
    .from("shifts")
    .select("org_id, property_id")
    .eq("id", args.shiftId)
    .maybeSingle();
  if (shErr) return { ok: false, error: shErr.message };
  const shift = sh as { org_id: string; property_id: string } | null;
  if (!shift) return { ok: false, error: "shift_not_found" };

  const { error } = await supabase.from("time_entries").insert({
    org_id: shift.org_id,
    shift_id: args.shiftId,
    employee_id: args.employeeId,
    property_id: shift.property_id,
    kind: args.kind,
    occurred_at: new Date().toISOString(),
    latitude: args.lat,
    longitude: args.lng,
    accuracy_m: args.accuracy ?? null,
    distance_m: args.distance != null ? Math.round(args.distance * 10) / 10 : null,
    manual: false,
  });
  // check_in/check_out are unique per shift (partial index): a duplicate
  // tap or a retry lands as 23505 — treat it as already done, like the web.
  if (error && error.code !== "23505") return { ok: false, error: error.message };

  if (args.kind === "check_in") {
    // Mirror the web: flag the shift as running. Only dispatchers/admins
    // may update shifts (RLS), so for field staff this is a silent no-op.
    await supabase
      .from("shifts")
      .update({ status: "in_progress" })
      .eq("id", args.shiftId)
      .eq("status", "scheduled");
  }
  return { ok: true };
}

/* ============================================================================
 * Admin: planning a new shift from mobile.
 *
 * Mirrors the web /schedule shift-creation flow. RLS enforces that only
 * admin + dispatcher can insert; the mobile UI additionally hides the
 * button for field staff.
 * ========================================================================== */

export type EligibleEmployee = {
  id: string;
  full_name: string;
  service_line: "priya" | "alltagshilfe" | null;
};

export type EligibleProperty = {
  id: string;
  name: string;
  city: string | null;
  client_name: string;
  client_customer_type: "residential" | "commercial" | "alltagshilfe";
};

export async function loadEligibleEmployees(): Promise<EligibleEmployee[]> {
  const supabase = getSupabase();
  // The column is `service_type` ('priya' | 'alltagshilfe' | 'both');
  // selecting the old `service_line` name errored and left the picker
  // empty. 'both' maps to null = eligible for either line.
  const { data } = await supabase
    .from("employees")
    .select("id, full_name, service_type")
    .is("deleted_at", null)
    .eq("status", "active")
    .order("full_name", { ascending: true })
    .limit(500);
  type R = { id: string; full_name: string; service_type: string | null };
  return ((data ?? []) as R[]).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    service_line:
      r.service_type === "priya" || r.service_type === "alltagshilfe" ? r.service_type : null,
  }));
}

export async function loadEligibleProperties(): Promise<EligibleProperty[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("properties")
    .select(
      `id, name, city,
       client:clients ( display_name, customer_type )`,
    )
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(500);
  type R = {
    id: string;
    name: string;
    city: string | null;
    client: {
      display_name: string;
      customer_type: "residential" | "commercial" | "alltagshilfe";
    } | null;
  };
  return ((data ?? []) as unknown as R[]).map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    client_name: r.client?.display_name ?? "—",
    client_customer_type: r.client?.customer_type ?? "residential",
  }));
}

export type PlanShiftInput = {
  property_id: string;
  employee_id: string | null;
  scheduled_start: string; // ISO
  scheduled_end: string; // ISO
  notes: string | null;
};

export async function planShift(
  input: PlanShiftInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (new Date(input.scheduled_end) <= new Date(input.scheduled_start)) {
    return { ok: false, error: "end_must_be_after_start" };
  }
  const supabase = getSupabase();
  // Resolve org_id from the caller's profile — RLS re-enforces this on
  // insert, but including it explicitly matches the shape web actions
  // use (fewer surprises when the column becomes non-nullable).
  const { data: authUser } = await supabase.auth.getUser();
  const uid = authUser?.user?.id;
  if (!uid) return { ok: false, error: "not_signed_in" };
  const { data: prof } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", uid)
    .maybeSingle();
  const orgId = (prof as { org_id: string | null } | null)?.org_id;
  if (!orgId) return { ok: false, error: "no_org" };

  const { data, error } = await supabase
    .from("shifts")
    .insert({
      org_id: orgId,
      property_id: input.property_id,
      employee_id: input.employee_id,
      // DB columns are starts_at / ends_at (the input keeps its old names).
      starts_at: input.scheduled_start,
      ends_at: input.scheduled_end,
      notes: input.notes,
      created_by: uid,
      status: "scheduled",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

/** Haversine distance in metres, for GPS proximity checks. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

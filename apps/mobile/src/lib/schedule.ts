/**
 * Schedule + shift loaders scoped to the caller's own assignments.
 */

import { getSupabase } from "@/lib/supabase";

export type ShiftRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  property: { id: string; name: string; address: string | null; lat: number | null; lng: number | null };
  client: { id: string; name: string };
};

type SRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  properties: {
    id: string;
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    clients: { id: string; name: string };
  };
};

export async function loadMyShifts(employeeId: string): Promise<ShiftRow[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("shifts")
    .select(
      "id, starts_at, ends_at, status, properties!inner(id, name, address, lat, lng, clients!inner(id, name))",
    )
    .eq("employee_id", employeeId)
    .gte("ends_at", new Date(Date.now() - 24 * 3_600_000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(50);
  const rows = ((data ?? []) as unknown) as SRow[];
  return rows.map((s) => ({
    id: s.id,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    status: s.status,
    property: {
      id: s.properties.id,
      name: s.properties.name,
      address: s.properties.address,
      lat: s.properties.lat,
      lng: s.properties.lng,
    },
    client: { id: s.properties.clients.id, name: s.properties.clients.name },
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
  const { data } = await supabase
    .from("time_entries")
    .select("id, shift_id, kind, occurred_at, lat, lng")
    .eq("shift_id", shiftId)
    .eq("employee_id", employeeId)
    .order("occurred_at", { ascending: true });
  return (data ?? []) as TimeEntry[];
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

  const { error } = await supabase.from("time_entries").insert({
    shift_id: args.shiftId,
    employee_id: args.employeeId,
    kind: args.kind,
    occurred_at: new Date().toISOString(),
    lat: args.lat,
    lng: args.lng,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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

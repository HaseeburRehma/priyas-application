"use server";

/**
 * Per-user device tracking — backs Settings → Sessions & Devices.
 *
 * Two actions:
 *   - `recordCurrentDeviceAction()` — upsert the current browser/device
 *     fingerprint on each page load from the dashboard layout. Idempotent.
 *     Returns the device id so the UI can mark it as "this device".
 *   - `revokeDeviceAction(id)` — mark a device row as revoked. The next
 *     request from that browser is forced to sign out by a middleware
 *     check (see `requireActiveDevice`).
 *   - `listDevicesAction()` — return the active (non-revoked) device
 *     list for the signed-in user.
 *
 * Fingerprint is a SHA-256 hash of `(user_id + user_agent + accept_language)`.
 * Stable for the same browser-OS-locale combo, distinct per device.
 */

import crypto from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeDeviceFingerprint } from "@/lib/security/device-revocation";
import { getCachedUser } from "@/lib/api/current-user";

/**
 * In-memory heartbeat throttle. Lives for the process lifetime, which
 * on Vercel means "this warm instance" — for the same visitor served by
 * the same warm instance (the common case), the second and subsequent
 * `recordCurrentDeviceAction` calls in a 5-minute window short-circuit
 * before any Supabase round-trip.
 *
 * Cold instances still fire once (as they should — that's the first
 * sighting of the device on that instance). Fresh sign-ins bypass the
 * throttle so revocation-clearing still works immediately.
 *
 * Keyed by a hash of (user-agent + IP + accept-language) so we don't
 * need an authenticated user lookup to consult it. The key is derived
 * from public request headers only — safe to keep in RAM.
 */
const HEARTBEAT_TTL_MS = 5 * 60_000;
const heartbeatSeen = new Map<string, number>();

function heartbeatKey(ua: string, ip: string | null, lang: string): string {
  return crypto
    .createHash("sha256")
    .update(`${ua}|${ip ?? ""}|${lang}`)
    .digest("hex")
    .slice(0, 32);
}

/** Best-effort periodic sweep so the Map doesn't grow unbounded on
 *  long-running warm instances. Cheap: only inspects entries older
 *  than the TTL, no timer needed. */
function pruneHeartbeatMap(now: number) {
  // Amortised prune — every ~200 calls we sweep expired keys. Cheap
  // enough to run inline; avoids scheduling a setInterval that would
  // outlive an aborted request.
  if (heartbeatSeen.size < 200) return;
  for (const [k, v] of heartbeatSeen) {
    if (now - v > HEARTBEAT_TTL_MS) heartbeatSeen.delete(k);
  }
}

type DeviceRow = {
  id: string;
  device_label: string;
  device_kind: "desktop" | "mobile" | "tablet" | "unknown";
  os: string | null;
  browser: string | null;
  ip_address: string | null;
  geo_label: string | null;
  first_seen_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  isCurrent: boolean;
};

/**
 * Cheap User-Agent parse — pulls out OS + browser without a real
 * library. Good enough for "MacBook Pro · Chrome 124" labels.
 */
function parseUserAgent(ua: string): {
  label: string;
  kind: DeviceRow["device_kind"];
  os: string;
  browser: string;
} {
  const isMobile = /Mobile|iPhone|Android.*Mobile/i.test(ua);
  const isTablet = /iPad|Android(?!.*Mobile)|Tablet/i.test(ua);
  const kind: DeviceRow["device_kind"] = isMobile
    ? "mobile"
    : isTablet
      ? "tablet"
      : ua
        ? "desktop"
        : "unknown";

  let os = "Unknown OS";
  if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/iPhone|iPad|iOS/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Browser";
  const edge = ua.match(/Edg\/(\d+)/);
  const chrome = ua.match(/Chrome\/(\d+)/);
  const firefox = ua.match(/Firefox\/(\d+)/);
  const safari = ua.match(/Version\/(\d+).*Safari/);
  if (edge) browser = `Edge ${edge[1]}`;
  else if (chrome) browser = `Chrome ${chrome[1]}`;
  else if (firefox) browser = `Firefox ${firefox[1]}`;
  else if (safari) browser = `Safari ${safari[1]}`;

  // Device-class label is the rough family, not the exact model —
  // we can't tell "MacBook Pro" vs "iMac" from UA. The hand-friendly
  // string the UI shows mirrors what Apple's own privacy report does.
  let device = "Computer";
  if (/iPhone/i.test(ua)) device = "iPhone";
  else if (/iPad/i.test(ua)) device = "iPad";
  else if (/Android/i.test(ua)) device = isTablet ? "Android Tablet" : "Android Phone";
  else if (/Macintosh/i.test(ua)) device = "Mac";
  else if (/Windows/i.test(ua)) device = "Windows PC";
  else if (/Linux/i.test(ua)) device = "Linux PC";

  return { label: `${device} · ${browser}`, kind, os, browser };
}

function ipFromHeaders(h: Headers): string | null {
  // Vercel / typical reverse-proxy hop. Picks the first non-private IP
  // in the chain. `cf-connecting-ip` from Cloudflare wins if present.
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = h.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first || null;
}

export async function recordCurrentDeviceAction(opts?: {
  /**
   * Set only right after a successful password sign-in (see
   * `loginAction` in actions/auth.ts). A fresh sign-in is the one
   * event that should clear a prior revocation — the dashboard-layout
   * heartbeat call (fired on every navigation) must NOT do this, or
   * "Revoke" in Settings → Sessions & Devices would undo itself on the
   * device's very next page load while its session cookie is still valid.
   */
  freshSignIn?: boolean;
}): Promise<{ ok: true; deviceId: string; throttled?: boolean } | { ok: false; error: string }> {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  const lang = h.get("accept-language")?.split(",")[0] ?? "";
  const ip = ipFromHeaders(h);

  // Throttle: skip everything if this instance saw the same request
  // signature within HEARTBEAT_TTL_MS. Fresh sign-ins bypass the
  // throttle — those must clear revoked_at immediately.
  if (!opts?.freshSignIn) {
    const key = heartbeatKey(ua, ip, lang);
    const now = Date.now();
    const last = heartbeatSeen.get(key);
    if (last != null && now - last < HEARTBEAT_TTL_MS) {
      return { ok: true, deviceId: "", throttled: true };
    }
    heartbeatSeen.set(key, now);
    pruneHeartbeatMap(now);
  }

  const supabase = await createSupabaseServerClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const fp = computeDeviceFingerprint(user.id, ua, lang);
  const { label, kind, os, browser } = parseUserAgent(ua);

  // Best-effort geo. We don't ship a GeoIP DB in this app — a
  // realistic deployment would call a Vercel header (`x-vercel-ip-country`)
  // or an external service. Falling back to "Unknown" keeps the row valid.
  const country = h.get("x-vercel-ip-country") ?? null;
  const city = h.get("x-vercel-ip-city") ?? null;
  const geo = [city, country].filter(Boolean).join(", ") || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from("user_devices") as any;
  const payload: Record<string, unknown> = {
    user_id: user.id,
    fingerprint: fp,
    device_label: label,
    device_kind: kind,
    os,
    browser,
    ip_address: ip,
    geo_label: geo,
    last_seen_at: new Date().toISOString(),
  };
  if (opts?.freshSignIn) {
    // Only a genuine new sign-in clears a prior revocation. Supabase's
    // upsert only SETs the columns present in the payload on conflict,
    // so omitting `revoked_at` on the routine heartbeat call below
    // leaves an existing revocation untouched instead of clearing it.
    payload.revoked_at = null;
  }
  const { data, error } = await table
    .upsert(payload, { onConflict: "user_id,fingerprint" })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, deviceId: (data as { id: string }).id };
}

export async function listDevicesAction(): Promise<
  { ok: true; devices: DeviceRow[]; currentDeviceId: string | null }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  const lang = h.get("accept-language")?.split(",")[0] ?? "";
  const fp = computeDeviceFingerprint(user.id, ua, lang);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from("user_devices") as any;
  const { data, error } = await table
    .select(
      "id, fingerprint, device_label, device_kind, os, browser, ip_address, geo_label, first_seen_at, last_seen_at, revoked_at",
    )
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false });

  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as Array<Omit<DeviceRow, "isCurrent"> & { fingerprint: string }>;
  let currentDeviceId: string | null = null;
  const devices = rows.map((r) => {
    const isCurrent = r.fingerprint === fp;
    if (isCurrent) currentDeviceId = r.id;
    return {
      id: r.id,
      device_label: r.device_label,
      device_kind: r.device_kind,
      os: r.os,
      browser: r.browser,
      ip_address: r.ip_address,
      geo_label: r.geo_label,
      first_seen_at: r.first_seen_at,
      last_seen_at: r.last_seen_at,
      revoked_at: r.revoked_at,
      isCurrent,
    } satisfies DeviceRow;
  });

  return { ok: true, devices, currentDeviceId };
}

export async function revokeDeviceAction(
  deviceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from("user_devices") as any;
  const { error } = await table
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: user.id,
    })
    .eq("id", deviceId)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  // Best-effort audit log row. Failure here doesn't block the revoke
  // — the device is marked revoked regardless.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileTable = supabase.from("profiles") as any;
    const { data: profile } = await profileTable
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = (profile as { org_id: string | null } | null)?.org_id ?? null;
    if (orgId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("audit_log") as any).insert({
        org_id: orgId,
        user_id: user.id,
        action: "session.device_revoked",
        table_name: "user_devices",
        record_id: deviceId,
      });
    }
  } catch {
    /* opportunistic */
  }

  revalidatePath("/settings");
  return { ok: true };
}

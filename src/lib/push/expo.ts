import "server-only";
import { createPushServiceClient } from "@/lib/push/service-client";

/**
 * Expo push — delivers notifications to the mobile app.
 *
 * The app registers its Expo push token in `user_devices` on sign-in
 * (apps/mobile/src/lib/push.ts). Here we look those tokens up and hand
 * the message to Expo's push service, which forwards it to APNs / FCM.
 *
 * Without the service-role key (local dev) this is a silent no-op,
 * matching how Web Push degrades without VAPID keys.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo accepts at most 100 messages per request. */
const EXPO_BATCH = 100;

export type ExpoPushPayload = {
  title: string;
  body: string;
  /** Web-app path from the notification's link_url. */
  url?: string;
};

type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

/** Screens that exist in the mobile app, keyed by first path segment. */
const MOBILE_LIST_ROUTES = new Set([
  "schedule",
  "clients",
  "properties",
  "employees",
  "invoices",
  "training",
  "vacation",
  "damage",
  "chat",
  "notifications",
  "dashboard",
]);
/** Segments whose `/<segment>/<id>` detail screen exists in the app. */
const MOBILE_DETAIL_ROUTES = new Set([
  "schedule",
  "clients",
  "properties",
  "employees",
  "invoices",
  "chat",
]);

/**
 * Map a web link_url onto a screen the mobile app can open. The app
 * pushes `data.url` straight into expo-router, so an unknown path would
 * land on a "not found" screen — anything we can't place goes to the
 * notifications list instead.
 */
export function toMobilePath(url: string | null | undefined): string {
  const fallback = "/notifications";
  if (!url) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(url, "https://app.invalid");
  } catch {
    return fallback;
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  const [root, id] = segments;
  if (!root) return "/";

  // The web schedule deep-links a shift via ?shift=<id>; mobile has a
  // real detail route for it.
  const shiftId = parsed.searchParams.get("shift");
  if (root === "schedule" && shiftId && segments.length === 1) {
    return `/schedule/${encodeURIComponent(shiftId)}`;
  }

  if (!MOBILE_LIST_ROUTES.has(root)) return fallback;
  if (segments.length === 1) return `/${root}`;
  if (segments.length === 2 && id && MOBILE_DETAIL_ROUTES.has(root)) {
    return `/${root}/${id}`;
  }
  return `/${root}`;
}

export async function sendExpoPushToProfile(
  profileId: string,
  payload: ExpoPushPayload,
): Promise<{ sent: number; failed: number }> {
  const supabase = createPushServiceClient();
  if (!supabase) return { sent: 0, failed: 0 };

  const { data: rows, error } = await supabase
    .from("user_devices")
    .select("expo_push_token")
    .eq("user_id", profileId)
    .is("revoked_at", null)
    .not("expo_push_token", "is", null);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[push/expo] token lookup failed", error.message);
    return { sent: 0, failed: 0 };
  }

  const tokens = Array.from(
    new Set(
      ((rows ?? []) as Array<{ expo_push_token: string | null }>)
        .map((r) => r.expo_push_token)
        .filter((t): t is string => !!t),
    ),
  );
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const data = { url: toMobilePath(payload.url) };
  const messages = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data,
    sound: "default",
    priority: "high",
    // Matches the channel the app creates on Android.
    channelId: "default",
  }));

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  // Only needed if "Enhanced push security" is switched on in Expo.
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  let sent = 0;
  let failed = 0;
  const deadTokens: string[] = [];

  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    const batch = messages.slice(i, i + EXPO_BATCH);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: ExpoTicket[]; errors?: Array<{ message?: string }> }
        | null;
      if (!res.ok || !json?.data) {
        failed += batch.length;
        // eslint-disable-next-line no-console
        console.warn(
          "[push/expo] request failed",
          res.status,
          json?.errors?.map((e) => e.message).join("; "),
        );
        continue;
      }
      json.data.forEach((ticket, idx) => {
        if (ticket.status === "ok") {
          sent += 1;
          return;
        }
        failed += 1;
        const to = batch[idx]?.to;
        if (ticket.details?.error === "DeviceNotRegistered" && to) {
          deadTokens.push(to);
        } else {
          // eslint-disable-next-line no-console
          console.warn("[push/expo] ticket error", ticket.details?.error, ticket.message);
        }
      });
    } catch (err) {
      failed += batch.length;
      // eslint-disable-next-line no-console
      console.warn("[push/expo] send threw", err);
    }
  }

  // Uninstalled apps / revoked permission: stop targeting the token.
  if (deadTokens.length > 0) {
    await supabase
      .from("user_devices")
      .update({ expo_push_token: null })
      .in("expo_push_token", deadTokens);
  }

  return { sent, failed };
}

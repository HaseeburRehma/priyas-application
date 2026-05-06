import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Late-bound `web-push` import. The package may not be installed in
 * environments that don't use push (CI typecheck against a fresh clone),
 * so we resolve it at first call and gracefully no-op when it's missing
 * or when VAPID keys aren't configured.
 */
type WebPushModule = {
  setVapidDetails: (subject: string, pub: string, priv: string) => void;
  sendNotification: (
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<unknown>;
};

let webpushSingleton: WebPushModule | null = null;
let configured = false;

async function loadAndConfigure(): Promise<WebPushModule | null> {
  if (configured && webpushSingleton) return webpushSingleton;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT || "mailto:support@example.com";
  if (!pub || !priv) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const mod = (await import("web-push" as any)) as
      | { default?: WebPushModule }
      | WebPushModule;
    const wp =
      "setVapidDetails" in mod
        ? (mod as WebPushModule)
        : ((mod as { default?: WebPushModule }).default ?? null);
    if (!wp) return null;
    wp.setVapidDetails(subject, pub, priv);
    webpushSingleton = wp;
    configured = true;
    return wp;
  } catch {
    return null;
  }
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPushToProfile(
  profileId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const wp = await loadAndConfigure();
  if (!wp) return { sent: 0, failed: 0 };

  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", profileId);

  type Row = { id: string; endpoint: string; p256dh: string; auth: string };
  const subs = (rows ?? []) as Row[];

  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await wp.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (status === 404 || status === 410) {
          expiredEndpoints.push(s.endpoint);
        }
      }
    }),
  );

  if (expiredEndpoints.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", expiredEndpoints);
  }

  return { sent, failed };
}

export async function sendPushToOrg(
  orgId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const wp = await loadAndConfigure();
  if (!wp) return { sent: 0, failed: 0 };
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("push_subscriptions")
    .select("profile_id")
    .eq("org_id", orgId);
  const profiles = Array.from(
    new Set(((rows ?? []) as Array<{ profile_id: string }>).map((r) => r.profile_id)),
  );
  const totals = await Promise.all(
    profiles.map((id) => sendPushToProfile(id, payload)),
  );
  return totals.reduce(
    (acc, t) => ({ sent: acc.sent + t.sent, failed: acc.failed + t.failed }),
    { sent: 0, failed: 0 },
  );
}

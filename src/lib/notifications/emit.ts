import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendPushToProfile } from "@/lib/push/send";
import { createWhatsAppClient } from "@/lib/integrations/whatsapp";

export type NotificationCategory =
  | "new_client"
  | "shift_change"
  | "missed_checkin"
  | "invoice_overdue"
  | "vacation_request"
  | "damage_report"
  | "training_assigned"
  | "chat_mention";

type EmitInput = {
  /** Recipient profile id. */
  user_id: string;
  /** Org id — must match the recipient's org for RLS. */
  org_id: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  link_url?: string;
  /** When true, also sends a Web Push payload (requires VAPID configured). */
  push?: boolean;
};

/**
 * Maps NotificationCategory → settings.notifications event key. The two
 * vocabularies grew apart over time; this keeps the call sites stable
 * while we look up channel preferences.
 */
const CATEGORY_TO_EVENT: Record<NotificationCategory, string | null> = {
  new_client: "new_client",
  shift_change: "shift_change",
  missed_checkin: "missed_checkin",
  invoice_overdue: "invoice_overdue",
  vacation_request: "vacation_request",
  // No matching toggle in Settings yet — these flow through in_app + push only.
  damage_report: null,
  training_assigned: null,
  chat_mention: null,
};

/**
 * Single entry point for "tell this user something happened." Writes an
 * in-app notification row, fires a Web Push (when `push: true`), and —
 * if the org has WhatsApp enabled for this category in Settings →
 * Notifications — dispatches a Twilio message to the recipient's phone.
 *
 * Failures are logged but never thrown — notifications are best-effort.
 */
export async function emitNotification(input: EmitInput): Promise<void> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await ((supabase.from("notifications") as any)).insert({
    org_id: input.org_id,
    user_id: input.user_id,
    channel: "in_app",
    category: input.category,
    title: input.title,
    body: input.body ?? null,
    link_url: input.link_url ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[notifications] insert failed", error.message);
  }

  if (input.push) {
    try {
      await sendPushToProfile(input.user_id, {
        title: input.title,
        body: input.body ?? "",
        url: input.link_url || "/",
        tag: input.category,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[notifications] push failed", err);
    }
  }

  // WhatsApp dispatch — gated on (a) the category having a matching
  // settings toggle and (b) the org having that toggle on for the
  // whatsapp channel in their settings.notifications matrix.
  await maybeSendWhatsApp(input).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[notifications] whatsapp failed", err);
  });
}

async function maybeSendWhatsApp(input: EmitInput): Promise<void> {
  const eventKey = CATEGORY_TO_EVENT[input.category];
  if (!eventKey) return;

  const supabase = await createSupabaseServerClient();
  // 1) Org-level matrix: settings.data.notifications[event].whatsapp ?
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settingsRow } = await ((supabase.from("settings") as any))
    .select("data")
    .eq("org_id", input.org_id)
    .maybeSingle();
  type SettingsShape = {
    notifications?: Record<string, { whatsapp?: boolean }>;
    integrations?: { whatsapp?: boolean };
  };
  const data = ((settingsRow as { data: SettingsShape } | null)?.data ?? {}) as SettingsShape;
  const whatsappOnForEvent = !!data.notifications?.[eventKey]?.whatsapp;
  if (!whatsappOnForEvent) return;
  // The Integrations page also has a master switch — respect it if set.
  if (data.integrations?.whatsapp === false) return;

  // 2) Recipient's phone — `profiles.phone` is the canonical channel.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("phone, full_name")
    .eq("id", input.user_id)
    .maybeSingle();
  const phone = (profile as { phone: string | null } | null)?.phone;
  if (!phone) return;

  // 3) Compose a short body. WhatsApp doesn't render rich content for us
  // here, so we use plain text; an absolute link helps when the
  // recipient is off-network.
  const lines: string[] = [`*${input.title}*`];
  if (input.body) lines.push(input.body);
  if (input.link_url) {
    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
    lines.push(`${origin}${input.link_url}`);
  }
  const wa = createWhatsAppClient();
  await wa.sendText(phone, lines.join("\n"));
}

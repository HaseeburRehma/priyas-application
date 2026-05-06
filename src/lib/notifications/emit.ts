import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendPushToProfile } from "@/lib/push/send";

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
 * Single entry point for "tell this user something happened." Writes an
 * in-app notification row, and (when `push: true`) fires a Web Push to
 * every registered subscription for that profile.
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
}

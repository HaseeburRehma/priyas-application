/**
 * Notifications loader + mutations. Backs the /notifications tab.
 *
 * A notification is anything the server generated for a specific user:
 * shift changes, missed check-in, invoice paid, vacation approved,
 * training expiring. Grouped by category so the filter pills can
 * narrow the view.
 */

import { getSupabase } from "@/lib/supabase";

export type NotificationCategory =
  | "shift"
  | "invoice"
  | "vacation"
  | "training"
  | "damage"
  | "chat"
  | "system"
  | "other";

export type NotificationRow = {
  id: string;
  created_at: string;
  read_at: string | null;
  category: NotificationCategory;
  title: string;
  body: string | null;
  link: string | null;
  /** Same heuristic as the web inbox (`src/lib/api/notifications.ts`). */
  urgent?: boolean;
};

export async function loadMyNotifications(): Promise<NotificationRow[]> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("notifications")
    // The column is `link_url` (migration 000002); we keep exposing it as
    // `link` so callers stay unchanged.
    .select("id, created_at, read_at, category, title, body, link_url")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return [];

  type DbRow = {
    id: string;
    created_at: string;
    read_at: string | null;
    category: string | null;
    title: string;
    body: string | null;
    link_url: string | null;
  };
  return ((data ?? []) as DbRow[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    read_at: r.read_at,
    category: normaliseCategory(r.category),
    title: r.title,
    body: r.body,
    link: r.link_url,
    urgent: isUrgent(r.category, r.body),
  }));
}

/** Mirrors `isUrgent` in the web app's notifications loader. */
function isUrgent(category: string | null, body: string | null): boolean {
  const c = (category ?? "").toLowerCase();
  if (c.includes("overdue") || c.includes("urgent") || c.includes("dringend")) {
    return true;
  }
  return !!body && /(überfällig|overdue|urgent|missed)/i.test(body);
}

function normaliseCategory(raw: string | null): NotificationCategory {
  const known: NotificationCategory[] = [
    "shift",
    "invoice",
    "vacation",
    "training",
    "damage",
    "chat",
    "system",
    "other",
  ];
  if (raw && (known as readonly string[]).includes(raw)) {
    return raw as NotificationCategory;
  }
  // The server emits event-style categories (`shift_change`,
  // `missed_checkin`, `invoice_overdue`, `vacation_request`,
  // `damage_report`, `training_assigned`, `chat_mention`, …) — map them
  // onto the mobile buckets so the filter chips work.
  const c = (raw ?? "").toLowerCase();
  if (c.includes("shift") || c.includes("checkin") || c.includes("schedule")) return "shift";
  if (c.includes("invoice")) return "invoice";
  if (c.includes("vacation") || c.includes("leave")) return "vacation";
  if (c.includes("training")) return "training";
  if (c.includes("damage")) return "damage";
  if (c.includes("chat") || c.includes("mention")) return "chat";
  return "other";
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
}

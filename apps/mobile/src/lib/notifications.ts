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
};

export async function loadMyNotifications(): Promise<NotificationRow[]> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("id, created_at, read_at, category, title, body, link")
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
    link: string | null;
  };
  return ((data ?? []) as DbRow[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    read_at: r.read_at,
    category: normaliseCategory(r.category),
    title: r.title,
    body: r.body,
    link: r.link,
  }));
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

import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NotificationCategory =
  | "invoice"
  | "schedule"
  | "alltagshilfe"
  | "mention"
  | "system"
  | "other";

export type NotificationItem = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  link_url: string | null;
  channel: "in_app" | "email" | "whatsapp";
  read_at: string | null;
  created_at: string;
  urgent: boolean;
};

export type NotificationsTab =
  | "all"
  | "unread"
  | "mentions"
  | "invoices"
  | "schedule"
  | "alltagshilfe";

export type NotificationsData = {
  items: NotificationItem[];
  counts: Record<NotificationsTab, number>;
};

function inferCategory(category: string): NotificationCategory {
  const c = category.toLowerCase();
  if (c.includes("invoice") || c === "rechnung") return "invoice";
  if (c.includes("shift") || c.includes("einsatz") || c === "schedule")
    return "schedule";
  if (c === "alltagshilfe" || c.includes("pflege")) return "alltagshilfe";
  if (c.includes("mention") || c.includes("erwähnung")) return "mention";
  if (c === "system") return "system";
  return "other";
}

function isUrgent(category: string, body: string | null): boolean {
  const c = category.toLowerCase();
  if (c.includes("overdue") || c.includes("urgent") || c.includes("dringend"))
    return true;
  if (body && /(überfällig|overdue|urgent|missed)/i.test(body)) return true;
  return false;
}

export async function loadNotifications(
  tab: NotificationsTab = "all",
): Promise<NotificationsData> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      items: [],
      counts: {
        all: 0,
        unread: 0,
        mentions: 0,
        invoices: 0,
        schedule: 0,
        alltagshilfe: 0,
      },
    };
  }

  const { data: rows } = await supabase
    .from("notifications")
    .select("id, category, title, body, link_url, channel, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  type Row = {
    id: string;
    category: string;
    title: string;
    body: string | null;
    link_url: string | null;
    channel: "in_app" | "email" | "whatsapp";
    read_at: string | null;
    created_at: string;
  };
  const all = ((rows ?? []) as Row[]).map<NotificationItem>((r) => ({
    id: r.id,
    category: inferCategory(r.category),
    title: r.title,
    body: r.body,
    link_url: r.link_url,
    channel: r.channel,
    read_at: r.read_at,
    created_at: r.created_at,
    urgent: isUrgent(r.category, r.body),
  }));

  const counts: Record<NotificationsTab, number> = {
    all: all.length,
    unread: all.filter((i) => !i.read_at).length,
    mentions: all.filter((i) => i.category === "mention").length,
    invoices: all.filter((i) => i.category === "invoice").length,
    schedule: all.filter((i) => i.category === "schedule").length,
    alltagshilfe: all.filter((i) => i.category === "alltagshilfe").length,
  };

  let items: NotificationItem[];
  switch (tab) {
    case "unread":
      items = all.filter((i) => !i.read_at);
      break;
    case "mentions":
      items = all.filter((i) => i.category === "mention");
      break;
    case "invoices":
      items = all.filter((i) => i.category === "invoice");
      break;
    case "schedule":
      items = all.filter((i) => i.category === "schedule");
      break;
    case "alltagshilfe":
      items = all.filter((i) => i.category === "alltagshilfe");
      break;
    default:
      items = all;
  }
  return { items, counts };
}

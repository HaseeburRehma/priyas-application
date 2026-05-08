import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Live counts that drive the sidebar badges.
 *
 * Why server-side rather than realtime subscriptions: the dashboard layout
 * is already dynamic (cookies-based auth means every navigation re-renders
 * the layout against fresh Supabase queries). That gives us "fresh on
 * every page load" without the complexity of a realtime channel for what
 * is essentially decorative chrome. Push notifications + chat realtime
 * still keep the user informed in-app while between navigations.
 *
 * Each count is bounded — we never show counts > 999, falling back to
 * "999+". Zero / unknown returns `null` so the Sidebar can omit the
 * badge entirely (the user's request: "remove default numbers… show
 * realtime updates only").
 */
export type SidebarCounts = {
  clients: number | null;
  properties: number | null;
  employees: number | null;
  unreadChat: number | null;
  unreadNotifications: number | null;
};

/** Cap displayed counts so the badge never spills out of the chrome. */
function capCount(n: number | null | undefined): number | null {
  if (n == null) return null;
  if (n <= 0) return null;
  return Math.min(n, 999);
}

export async function loadSidebarCounts(): Promise<SidebarCounts> {
  const supabase = await createSupabaseServerClient();

  // We rely on RLS to scope each count to the current org.
  // `head: true` + `count: "exact"` returns just the count without rows.
  const [
    clientsRes,
    propertiesRes,
    employeesRes,
    notificationsRes,
    chatUnreadRes,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
    countUnreadChatMessages(supabase),
  ]);

  return {
    clients: capCount(clientsRes.count),
    properties: capCount(propertiesRes.count),
    employees: capCount(employeesRes.count),
    unreadChat: capCount(chatUnreadRes),
    unreadNotifications: capCount(notificationsRes.count),
  };
}

/**
 * Sum unread chat messages across all channels the current user is a
 * member of. "Unread" means `chat_messages.created_at > chat_members.last_read_at`
 * (or all messages if last_read_at is null). We query each side once and
 * combine in memory since RLS already restricts both sides to channels
 * the user can see.
 */
async function countUnreadChatMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<number | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Memberships → channel_id → last_read_at
  const { data: memberships } = await supabase
    .from("chat_members")
    .select("channel_id, last_read_at")
    .eq("user_id", user.id);

  type Member = { channel_id: string; last_read_at: string | null };
  const list = (memberships ?? []) as Member[];
  if (list.length === 0) return 0;

  // Pull message timestamps for these channels in one round-trip. We only
  // need created_at + channel_id + the author so we can exclude the
  // current user's own messages from "unread".
  const channelIds = list.map((m) => m.channel_id);
  const { data: messages } = await supabase
    .from("chat_messages")
    .select("channel_id, user_id, created_at")
    .in("channel_id", channelIds)
    .is("deleted_at", null);

  type Msg = {
    channel_id: string;
    user_id: string;
    created_at: string;
  };
  const lastReadByChannel = new Map(
    list.map((m) => [m.channel_id, m.last_read_at]),
  );

  let unread = 0;
  for (const m of (messages ?? []) as Msg[]) {
    if (m.user_id === user.id) continue; // your own messages aren't "unread"
    const last = lastReadByChannel.get(m.channel_id);
    if (!last || new Date(m.created_at) > new Date(last)) {
      unread += 1;
    }
  }
  return unread;
}

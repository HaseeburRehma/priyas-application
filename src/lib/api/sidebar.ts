import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Cache tags used to invalidate the sidebar org-scoped counts from
 * mutating actions. Every create/update/archive action that touches
 * clients / employees / properties calls `revalidateTag()` on the
 * matching tag so the next sidebar render fetches fresh counts.
 *
 * The generic 'sidebar-counts' tag lets us blast the whole widget
 * when we don't know which resource changed (e.g. bulk imports).
 */
export const SIDEBAR_TAGS = {
  all: "sidebar-counts" as const,
  clients: "sidebar-counts:clients" as const,
  properties: "sidebar-counts:properties" as const,
  employees: "sidebar-counts:employees" as const,
};

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

/**
 * Cached org-scoped counts.
 *
 * These three numbers are identical for every user in an org and
 * change only when someone creates / archives a client, property or
 * employee. Wrapping in `unstable_cache` keyed on orgId means the
 * whole org shares a single cached row and every dashboard nav hits
 * the memoised value instead of firing three fresh `count` queries
 * against Postgres.
 *
 * Invalidation: every mutating action (createClientAction,
 * archiveClientAction, bulk archives, employee create/update, etc.)
 * calls `revalidateTag(SIDEBAR_TAGS.all)` so the next request pulls
 * fresh numbers within milliseconds of any change.
 *
 * TTL of 60 s is the belt-and-braces fallback in case a mutation
 * path forgets to revalidate — the counts will still self-heal within
 * a minute rather than remaining stale forever.
 */
const loadOrgCountsCached = (orgId: string) =>
  unstable_cache(
    async () => {
      const supabase = await createSupabaseServerClient();
      const [clientsRes, propertiesRes, employeesRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("org_id", orgId),
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("org_id", orgId),
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("org_id", orgId),
      ]);
      return {
        clients: clientsRes.count ?? 0,
        properties: propertiesRes.count ?? 0,
        employees: employeesRes.count ?? 0,
      };
    },
    ["sidebar-org-counts", orgId],
    {
      // Tags → revalidateTag from mutations. Include both the generic
      // 'all' tag and the resource-specific ones so a granular
      // invalidation (only clients changed) doesn't need to touch the
      // other resource counts' cache entries.
      tags: [
        SIDEBAR_TAGS.all,
        SIDEBAR_TAGS.clients,
        SIDEBAR_TAGS.properties,
        SIDEBAR_TAGS.employees,
      ],
      revalidate: 60,
    },
  )();

export async function loadSidebarCounts(): Promise<SidebarCounts> {
  const supabase = await createSupabaseServerClient();

  // Resolve the caller's org first so the cached org-counts key on it.
  // The lookup is dedup'd within a request by React.cache elsewhere,
  // so this doesn't add a round-trip for pages that already resolved
  // the user.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const orgId = user
    ? ((
        (
          await supabase
            .from("profiles")
            .select("org_id")
            .eq("id", user.id)
            .maybeSingle()
        ).data as { org_id: string | null } | null
      )?.org_id ?? null)
    : null;

  // Org-scoped counts come from the memoised branch; per-user counts
  // (chat unread, notifications unread) stay uncached because they
  // change with every read the user makes.
  const [orgCounts, notificationsRes, chatUnreadRes] = await Promise.all([
    orgId ? loadOrgCountsCached(orgId) : Promise.resolve(null),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
    countUnreadChatMessages(supabase),
  ]);

  return {
    clients: capCount(orgCounts?.clients ?? null),
    properties: capCount(orgCounts?.properties ?? null),
    employees: capCount(orgCounts?.employees ?? null),
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
  //
  // Defensive caps:
  //   • Use the oldest `last_read_at` (or 30 days ago, whichever is more
  //     recent) as a date floor. Once a channel has been read everything
  //     before that read is irrelevant; without a floor a channel
  //     untouched for a year drags in years of history.
  //   • `.limit(5000)` so a single overactive channel can't OOM the
  //     lambda. The badge caps at "999+" anyway.
  const channelIds = list.map((m) => m.channel_id);
  const THIRTY_DAYS_AGO = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  // Pick the oldest non-null last_read; if any channel has never been
  // read, fall back to the 30-day floor.
  let dateFloor = THIRTY_DAYS_AGO;
  const reads = list
    .map((m) => m.last_read_at)
    .filter((s): s is string => !!s);
  const hasUnreadChannel = list.some((m) => !m.last_read_at);
  if (!hasUnreadChannel && reads.length > 0) {
    const oldest = reads.reduce((a, b) => (a < b ? a : b));
    // Use whichever is older — last_read or 30-day floor — so we can
    // still tell whether the channel has anything newer.
    dateFloor = oldest < THIRTY_DAYS_AGO ? oldest : THIRTY_DAYS_AGO;
  }
  const { data: messages } = await supabase
    .from("chat_messages")
    .select("channel_id, user_id, created_at")
    .in("channel_id", channelIds)
    .is("deleted_at", null)
    .gt("created_at", dateFloor)
    .limit(5000);

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

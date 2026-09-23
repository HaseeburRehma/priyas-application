import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedProfile, getCachedUser } from "@/lib/api/current-user";
import { env } from "@/lib/constants/env";

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

function capCount(n: number | null | undefined): number | null {
  if (n == null) return null;
  if (n <= 0) return null;
  return Math.min(n, 999);
}

/**
 * Cross-user org-scoped count cache.
 *
 * The three headline numbers (clients / properties / employees) are
 * identical for every user in the org and change only when someone
 * creates or archives a row. Wrapping the query in `unstable_cache`
 * keyed on `orgId` means the whole org shares a single memoised row
 * and every dashboard nav hits the cached value instead of firing
 * three fresh `count(*)` queries against Postgres.
 *
 * Two rules make this safe:
 *   1. The inner function uses a **service-role** Supabase client, not
 *      the session client. Session clients call `cookies()`, and
 *      `cookies()` is illegal inside `unstable_cache` (a fresh clone
 *      of this file bit us with a full-site 500 last week).
 *   2. Bypassing RLS means we MUST include `.eq("org_id", orgId)`
 *      explicitly on every query, or a compromised cache would leak
 *      cross-org counts. Callers still pass the caller-derived orgId,
 *      never one from user input.
 *
 * Invalidation: every mutating action (createClientAction,
 * archiveClientAction, employee create/update, etc.) calls
 * `revalidateTag(SIDEBAR_TAGS.*)` so the next request pulls fresh
 * numbers within milliseconds of any change. The 60 s TTL is a
 * belt-and-braces fallback for a mutation path that forgets to
 * revalidate — the counts still self-heal within a minute.
 */
function loadOrgCountsCached(orgId: string) {
  return unstable_cache(
    async () => {
      const service = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const [clientsRes, propertiesRes, employeesRes] = await Promise.all([
        service
          .from("clients")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("org_id", orgId),
        service
          .from("properties")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("org_id", orgId),
        service
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
      tags: [
        SIDEBAR_TAGS.all,
        SIDEBAR_TAGS.clients,
        SIDEBAR_TAGS.properties,
        SIDEBAR_TAGS.employees,
      ],
      revalidate: 60,
    },
  )();
}

export async function loadSidebarCounts(): Promise<SidebarCounts> {
  const supabase = await createSupabaseServerClient();
  const profile = await getCachedProfile();
  const orgId = profile?.orgId ?? null;

  // Org counts come from the cross-user cache; per-user unread counts
  // stay uncached (they change with every read the user makes).
  //
  // The cache handles ~100% of the org-scoped hits on a typical
  // navigation. If the service-role env var is missing (local dev
  // without one) the cached path returns null and we fall back to the
  // session-client query below so the sidebar still renders numbers.
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const [orgCounts, fallbackClients, fallbackProperties, fallbackEmployees, notificationsRes, chatUnread] =
    await Promise.all([
      orgId && hasServiceKey ? loadOrgCountsCached(orgId) : Promise.resolve(null),
      !hasServiceKey
        ? supabase
            .from("clients")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
        : Promise.resolve({ count: null as number | null }),
      !hasServiceKey
        ? supabase
            .from("properties")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
        : Promise.resolve({ count: null as number | null }),
      !hasServiceKey
        ? supabase
            .from("employees")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
        : Promise.resolve({ count: null as number | null }),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
      countUnreadChatMessages(supabase),
    ]);

  return {
    clients: capCount(orgCounts?.clients ?? fallbackClients.count ?? null),
    properties: capCount(orgCounts?.properties ?? fallbackProperties.count ?? null),
    employees: capCount(orgCounts?.employees ?? fallbackEmployees.count ?? null),
    unreadChat: capCount(chatUnread),
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
  const user = await getCachedUser();
  if (!user) return null;

  const { data: memberships } = await supabase
    .from("chat_members")
    .select("channel_id, last_read_at")
    .eq("user_id", user.id);

  type Member = { channel_id: string; last_read_at: string | null };
  const list = (memberships ?? []) as Member[];
  if (list.length === 0) return 0;

  const channelIds = list.map((m) => m.channel_id);
  const THIRTY_DAYS_AGO = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  let dateFloor = THIRTY_DAYS_AGO;
  const reads = list
    .map((m) => m.last_read_at)
    .filter((s): s is string => !!s);
  const hasUnreadChannel = list.some((m) => !m.last_read_at);
  if (!hasUnreadChannel && reads.length > 0) {
    const oldest = reads.reduce((a, b) => (a < b ? a : b));
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
    if (m.user_id === user.id) continue;
    const last = lastReadByChannel.get(m.channel_id);
    if (!last || new Date(m.created_at) > new Date(last)) {
      unread += 1;
    }
  }
  return unread;
}

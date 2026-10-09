/**
 * Team chat — channels, messages, realtime.
 *
 * Backed by `chat_channels`, `chat_members`, `chat_messages` tables.
 * RLS scopes both reads and writes to channels the user is a member of.
 * Realtime uses Supabase's Postgres CDC broadcast on the same tables.
 */

import { getSupabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ChatChannelRow = {
  id: string;
  name: string | null;
  kind: string | null;
  is_direct: boolean;
  is_private: boolean;
  description: string | null;
  last_read_at: string | null;
  last_message_at: string | null;
  last_message_body: string | null;
  unread_count: number;
};

export type ChatMessageRow = {
  id: string;
  channel_id: string;
  user_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  author_name: string;
  /** Author's profile role (admin / dispatcher / employee) when known. */
  author_role?: string | null;
};

export type ChatMemberRow = {
  user_id: string;
  last_read_at: string | null;
  full_name: string | null;
  role: string | null;
};

export type ChatChannelKind = "channel" | "direct" | "group";

/** Channel kind with the web app's fallback for legacy rows without `kind`. */
export function channelKind(c: Pick<ChatChannelRow, "kind" | "is_direct">): ChatChannelKind {
  const k = c.kind ?? (c.is_direct ? "direct" : "channel");
  return k === "direct" || k === "group" ? k : "channel";
}

/**
 * Display name for a channel, or null when it has none. Channel names are
 * stored with a leading "#"; DMs as "A ↔ B" (web
 * `createOrGetDirectChannelAction`), so a DM shows the other participant.
 */
export function channelDisplayName(
  c: Pick<ChatChannelRow, "name" | "kind" | "is_direct">,
  myName?: string | null,
): string | null {
  const raw = (c.name ?? "").trim();
  if (channelKind(c) === "direct") {
    const parts = raw.split("↔").map((s) => s.trim()).filter(Boolean);
    return parts.find((p) => p !== myName) ?? parts[0] ?? null;
  }
  return raw.replace(/^#/, "") || null;
}

/** Load every channel the current user is a member of, with unread + last message metadata. */
export async function loadMyChannels(): Promise<ChatChannelRow[]> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // 1) Memberships for me (channel_id + last_read_at).
  const { data: memberships } = await supabase
    .from("chat_members")
    .select("channel_id, last_read_at")
    .eq("user_id", user.id);

  type M = { channel_id: string; last_read_at: string | null };
  const memList = (memberships ?? []) as M[];
  if (memList.length === 0) return [];

  const channelIds = memList.map((m) => m.channel_id);

  // 2) Channel rows + 3) latest messages fan-out in parallel.
  const [channelsRes, messagesRes] = await Promise.all([
    supabase
      .from("chat_channels")
      .select("id, name, kind, is_direct, is_private, description")
      .in("id", channelIds),
    supabase
      .from("chat_messages")
      .select("channel_id, body, created_at, user_id")
      .in("channel_id", channelIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  type Ch = {
    id: string;
    name: string | null;
    kind: string | null;
    is_direct: boolean;
    is_private: boolean;
    description: string | null;
  };
  const chList = (channelsRes.data ?? []) as Ch[];

  type Msg = { channel_id: string; body: string; created_at: string; user_id: string };
  const msgs = (messagesRes.data ?? []) as Msg[];

  const lastByCh = new Map<string, Msg>();
  const unreadByCh = new Map<string, number>();
  const readMap = new Map(memList.map((m) => [m.channel_id, m.last_read_at]));

  for (const m of msgs) {
    if (!lastByCh.has(m.channel_id)) lastByCh.set(m.channel_id, m);
    if (m.user_id === user.id) continue;
    const readAt = readMap.get(m.channel_id);
    if (!readAt || new Date(m.created_at) > new Date(readAt)) {
      unreadByCh.set(m.channel_id, (unreadByCh.get(m.channel_id) ?? 0) + 1);
    }
  }

  return chList
    .map((c) => {
      const last = lastByCh.get(c.id);
      return {
        id: c.id,
        name: c.name,
        kind: c.kind,
        is_direct: c.is_direct,
        is_private: c.is_private,
        description: c.description,
        last_read_at: readMap.get(c.id) ?? null,
        last_message_at: last?.created_at ?? null,
        last_message_body: last?.body ?? null,
        unread_count: unreadByCh.get(c.id) ?? 0,
      } satisfies ChatChannelRow;
    })
    .sort((a, b) => {
      // Newest activity first; channels with no messages sink.
      const at = a.last_message_at ?? "";
      const bt = b.last_message_at ?? "";
      return bt.localeCompare(at);
    });
}

/** Load messages for one channel, oldest→newest. Names joined from profiles. */
export async function loadChannelMessages(
  channelId: string,
  limit = 100,
): Promise<ChatMessageRow[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("chat_messages")
    .select("id, channel_id, user_id, body, created_at, edited_at, author:profiles(full_name, role)")
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  type Row = {
    id: string;
    channel_id: string;
    user_id: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    author: { full_name: string; role?: string | null } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .map((r) => ({
      id: r.id,
      channel_id: r.channel_id,
      user_id: r.user_id,
      body: r.body,
      created_at: r.created_at,
      edited_at: r.edited_at,
      author_name: r.author?.full_name ?? "—",
      author_role: r.author?.role ?? null,
    }))
    .reverse(); // oldest first for chat rendering
}

/**
 * Members of one channel with their read cursor. RLS ("members:read same
 * channel", migrations 000058/000065) lets any member read the roster.
 * Used for the thread header (member count, DM partner) and read receipts.
 */
export async function loadChannelMembers(channelId: string): Promise<ChatMemberRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("chat_members")
    .select("user_id, last_read_at, profile:profiles(full_name, role)")
    .eq("channel_id", channelId);
  if (error) return [];
  type Row = {
    user_id: string;
    last_read_at: string | null;
    profile: { full_name: string | null; role: string | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    user_id: r.user_id,
    last_read_at: r.last_read_at,
    full_name: r.profile?.full_name ?? null,
    role: r.profile?.role ?? null,
  }));
}

/** Module-level cache so we don't re-fetch org_id for the same channel on every send. */
const orgIdCache = new Map<string, string>();

/** Post a message. Server enforces org_id via trigger/RLS; we send channel + body. */
export async function sendMessage(
  channelId: string,
  body: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  // Look up org_id for the channel — required by the insert since the
  // `chat_messages.org_id` is `not null` and defence-in-depth on top of RLS.
  let orgId = orgIdCache.get(channelId);
  if (!orgId) {
    const { data: chan } = await supabase
      .from("chat_channels")
      .select("org_id")
      .eq("id", channelId)
      .maybeSingle();
    orgId = (chan as { org_id: string } | null)?.org_id;
    if (!orgId) return { ok: false, error: "channel_not_found" };
    orgIdCache.set(channelId, orgId);
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      channel_id: channelId,
      user_id: user.id,
      org_id: orgId,
      body: trimmed,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

/** Mark a channel read up to now. Called when the user opens the thread. */
export async function markChannelRead(channelId: string): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("chat_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);
}

/**
 * Subscribe to new messages on one channel. Returns an unsubscribe fn.
 * onMessage fires with the raw row from Postgres CDC — caller reshapes.
 */
export function subscribeChannelMessages(
  channelId: string,
  onMessage: (msg: { id: string; channel_id: string; user_id: string; body: string; created_at: string }) => void,
): () => void {
  const supabase = getSupabase();
  const channel: RealtimeChannel = supabase
    .channel(`chat:${channelId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `channel_id=eq.${channelId}`,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        if (payload?.new) onMessage(payload.new);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Typing indicator via broadcast — a lightweight ephemeral signal that
 * doesn't touch the database. Both `broadcastTyping` and
 * `subscribeTyping` operate on the same named channel.
 */
export function subscribeTyping(
  channelId: string,
  onTyping: (payload: { userId: string; userName: string }) => void,
): { broadcast: (userId: string, userName: string) => void; unsubscribe: () => void } {
  const supabase = getSupabase();
  const channel = supabase
    .channel(`typing:${channelId}`)
    .on("broadcast", { event: "typing" }, (payload) => {
      const p = payload.payload as { userId: string; userName: string } | undefined;
      if (p?.userId && p?.userName) onTyping(p);
    })
    .subscribe();

  return {
    broadcast: (userId, userName) => {
      void channel.send({
        type: "broadcast",
        event: "typing",
        payload: { userId, userName },
      });
    },
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}

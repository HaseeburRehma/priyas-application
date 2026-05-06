"use client";

import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Channel } from "@/types/chat";

/**
 * Lists every channel the signed-in user is a member of, joined with their
 * `chat_members.last_read_at` so we can compute unread counts. RLS already
 * scopes the rows to the user's org and channel membership.
 */
export function useChannels() {
  const supabase = createSupabaseBrowserClient();

  return useQuery<Channel[]>({
    queryKey: ["chat", "channels"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      // Load membership rows joined with the channel.
      const { data, error } = await supabase
        .from("chat_members")
        .select(
          `last_read_at,
           channel:chat_channels (
             id, org_id, name, is_direct, created_by, created_at
           )`,
        )
        .eq("user_id", user.id);
      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<{
        last_read_at: string | null;
        channel: Omit<Channel, "last_read_at" | "unread_count"> | null;
      }>;

      const channels: Channel[] = rows
        .filter((r) => r.channel)
        .map((r) => ({ ...r.channel!, last_read_at: r.last_read_at }));

      // Compute unread counts in a single query: count messages newer than
      // each membership's last_read_at. (Cheap for small N; if it grows we
      // move it server-side via a Postgres function.)
      const ids = channels.map((c) => c.id);
      if (ids.length > 0) {
        const { data: counts } = await supabase
          .from("chat_messages")
          .select("channel_id, created_at")
          .in("channel_id", ids)
          .is("deleted_at", null);

        const map = new Map<string, number>();
        for (const row of (counts ?? []) as Array<{
          channel_id: string;
          created_at: string;
        }>) {
          const ch = channels.find((c) => c.id === row.channel_id);
          if (!ch) continue;
          if (!ch.last_read_at || row.created_at > ch.last_read_at) {
            map.set(row.channel_id, (map.get(row.channel_id) ?? 0) + 1);
          }
        }
        channels.forEach((c) => {
          c.unread_count = map.get(c.id) ?? 0;
        });
      }

      // Sort: unread first, then by name.
      channels.sort((a, b) => {
        const u = (b.unread_count ?? 0) - (a.unread_count ?? 0);
        return u !== 0 ? u : a.name.localeCompare(b.name);
      });

      return channels;
    },
    staleTime: 10_000,
  });
}

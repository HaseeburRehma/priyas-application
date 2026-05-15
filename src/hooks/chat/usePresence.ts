"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Track which org members are currently online via Supabase Realtime presence.
 *
 * On mount, joins the per-org presence channel keyed by the current
 * user's id, listens for sync/join/leave events, and returns a Set of
 * profile ids that are online right now.
 *
 * Channel lifecycle: we defer channel creation until `getUser()`
 * resolves so we never create-then-discard a channel. The previous
 * version eagerly opened one keyed by an empty string, then re-opened
 * it keyed by user.id — the eager channel leaked on every mount.
 *
 * Usage:
 *   const online = usePresence(orgId);
 *   const isOnline = online.has(memberId);
 */
export function usePresence(orgId: string | null): Set<string> {
  const [online, setOnline] = useState<Set<string>>(() => new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!orgId) return;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Create the channel ONCE, after we know the user id. Storing it
      // in a ref lets the cleanup callback close over a stable handle
      // even though the channel is created asynchronously.
      const channel = supabase.channel(`presence:${orgId}`, {
        config: { presence: { key: user.id } },
      });
      channelRef.current = channel;

      const sync = () => {
        const state = channel.presenceState() as Record<string, unknown[]>;
        setOnline(new Set(Object.keys(state)));
      };

      channel
        .on("presence", { event: "sync" }, sync)
        .on("presence", { event: "join" }, sync)
        .on("presence", { event: "leave" }, sync)
        .subscribe(async (status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            await channel.track({
              user_id: user.id,
              joined_at: new Date().toISOString(),
            });
          }
        });
    })();

    return () => {
      cancelled = true;
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) {
        void channel.untrack();
        void supabase.removeChannel(channel);
      }
    };
  }, [orgId]);

  return online;
}

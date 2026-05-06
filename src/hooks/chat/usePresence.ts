"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Track which org members are currently online via Supabase Realtime presence.
 *
 * On mount, joins the per-org presence channel, broadcasts the current
 * user's id, and listens for sync/join/leave events. Returns a Set of
 * profile ids that are online right now.
 *
 * Usage:
 *   const online = usePresence(orgId);
 *   const isOnline = online.has(memberId);
 */
export function usePresence(orgId: string | null): Set<string> {
  const [online, setOnline] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!orgId) return;
    const supabase = createSupabaseBrowserClient();
    let channel = supabase.channel(`presence:${orgId}`, {
      config: { presence: { key: "" } },
    });

    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      // Re-create the channel keyed by the user id so each tab gets its
      // own presence slot.
      channel = supabase.channel(`presence:${orgId}`, {
        config: { presence: { key: user.id } },
      });

      const sync = () => {
        const state = channel.presenceState() as Record<string, unknown[]>;
        setOnline(new Set(Object.keys(state)));
      };

      channel
        .on("presence", { event: "sync" }, sync)
        .on("presence", { event: "join" }, sync)
        .on("presence", { event: "leave" }, sync)
        .subscribe(async (status) => {
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
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [orgId]);

  return online;
}

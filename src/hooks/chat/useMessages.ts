"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Message } from "@/types/chat";

type Profile = { id: string; full_name: string | null; avatar_url: string | null };

/**
 * Loads a channel's messages and subscribes to realtime INSERTs.
 *
 * - Initial fetch returns up to `limit` most recent messages, sorted oldest
 *   first so the UI can append new ones without resorting.
 * - Subscription pushes new INSERTs into local state and bumps the parent's
 *   `chat_members.last_read_at` so the channel-list unread count clears
 *   while you're actively in the room.
 *
 * Profile lookups for senders are batched into a single follow-up query.
 */
export function useMessages(channelId: string | null, limit = 100) {
  const supabase = createSupabaseBrowserClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const profilesRef = useRef<Map<string, Profile>>(new Map());

  // Hydrate any missing sender profiles in one batch, then attach them.
  const hydrateSenders = useCallback(
    async (msgs: Message[]) => {
      const missing = msgs
        .map((m) => m.user_id)
        .filter((id) => !profilesRef.current.has(id));
      if (missing.length === 0) return msgs;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", Array.from(new Set(missing)));
      for (const p of (data ?? []) as Profile[]) {
        profilesRef.current.set(p.id, p);
      }
      return msgs.map((m) => ({
        ...m,
        sender: profilesRef.current.get(m.user_id) ?? null,
      }));
    },
    [supabase],
  );

  // Initial load
  useEffect(() => {
    if (!channelId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("channel_id", channelId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const ordered = ((data ?? []) as Message[]).slice().reverse();
      const hydrated = await hydrateSenders(ordered);
      if (cancelled) return;
      setMessages(hydrated);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId, supabase, limit, hydrateSenders]);

  // Realtime subscription
  useEffect(() => {
    if (!channelId) return;

    const sub = supabase
      .channel(`chat:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          const incoming = payload.new as Message;
          const [hydrated] = await hydrateSenders([incoming]);
          if (!hydrated) return;
          setMessages((prev) => {
            // De-dupe by real id (realtime arrived after the insert
            // response already swapped the optimistic placeholder).
            if (prev.some((m) => m.id === hydrated.id)) return prev;

            // Also collapse any pending `temp-` placeholder from the
            // same user with the same body — that's our own
            // optimistic that hasn't been swapped yet because the
            // realtime event won the race.
            const tempIdx = prev.findIndex(
              (m) =>
                m.id.startsWith("temp-") &&
                m.user_id === hydrated.user_id &&
                (m.body ?? "") === (hydrated.body ?? ""),
            );
            if (tempIdx >= 0) {
              const next = prev.slice();
              next[tempIdx] = hydrated;
              return next;
            }
            return [...prev, hydrated];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(sub);
    };
  }, [channelId, supabase, hydrateSenders]);

  // Optimistic local insert used by the composer.
  const append = useCallback((m: Message) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  /**
   * Replace the temp- placeholder produced by `append()` with the
   * persisted row once the insert resolves. Fixes the "send one,
   * see two" duplication where the optimistic and the realtime
   * arrival had different ids and both stayed in state.
   */
  const replace = useCallback(
    async (tempId: string, real: Message) => {
      const [hydrated] = await hydrateSenders([real]);
      const final = hydrated ?? real;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === tempId);
        if (idx < 0) {
          // Already swapped (realtime won) — just ensure we have it.
          if (prev.some((m) => m.id === final.id)) return prev;
          return [...prev, final];
        }
        const next = prev.slice();
        next[idx] = final;
        return next;
      });
    },
    [hydrateSenders],
  );

  return { messages, loading, error, append, replace };
}

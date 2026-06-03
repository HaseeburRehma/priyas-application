"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Typing-indicator plumbing built on Supabase Realtime **broadcast**
 * (not presence). Broadcast was chosen over presence because the
 * lifetime of a "typing" signal is sub-second; a presence join/leave
 * would re-emit on every reconnect and is far heavier than what we
 * need.
 *
 * Each chat channel gets its own broadcast channel keyed
 * `chat-typing:{channelId}`. The composer fires `typing:start` on the
 * first keystroke and a leading-edge throttled `typing:start` every 2 s
 * while the user keeps typing — this keeps the indicator alive
 * without spamming the wire on every character. A `typing:stop` fires
 * when the input is cleared or 3 s pass without a keystroke.
 *
 * The subscriber hook keeps a Map of `{userId → {name, expiresAt}}`,
 * trimmed on a 1-second tick so a sender disconnecting mid-burst
 * doesn't leave the indicator hanging.
 *
 * `getTypingLabel()` formats the names into the localised "X is
 * typing…" / "X and Y are typing…" / "X, Y and N others are
 * typing…" string using next-intl on the caller side.
 */

const STALE_MS = 5_000;

type TypingPayload = {
  user_id: string;
  name: string;
};

type Sender = {
  notifyTyping: () => void;
  notifyStopped: () => void;
};

/**
 * Returns a `notifyTyping()` callback bound to the given channel.
 * Call it on every keystroke; the hook handles throttling internally.
 * `notifyStopped()` is fired automatically 3 s after the last call.
 */
export function useTypingBroadcaster(
  channelId: string | null,
  selfUserId: string | null,
  selfName: string | null,
): Sender {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef<number>(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!channelId || !selfUserId) return;
    const supabase = createSupabaseBrowserClient();
    const ch = supabase.channel(`chat-typing:${channelId}`, {
      config: {
        broadcast: { self: false, ack: false },
      },
    });
    channelRef.current = ch;
    void ch.subscribe();

    return () => {
      channelRef.current = null;
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      void supabase.removeChannel(ch);
    };
  }, [channelId, selfUserId]);

  const send = useCallback(
    (event: "typing:start" | "typing:stop") => {
      const ch = channelRef.current;
      if (!ch || !selfUserId) return;
      const payload: TypingPayload = {
        user_id: selfUserId,
        name: selfName ?? "—",
      };
      // Fire-and-forget; broadcast.ack: false means the send doesn't
      // wait for an acknowledgement, which is what we want.
      void ch.send({ type: "broadcast", event, payload });
    },
    [selfUserId, selfName],
  );

  const notifyTyping = useCallback(() => {
    if (!channelRef.current) return;
    const now = Date.now();
    // Leading-edge + 2 s throttle: send immediately the first time,
    // then at most every 2 s while the user keeps typing.
    if (now - lastSentRef.current > 2_000) {
      lastSentRef.current = now;
      send("typing:start");
    }
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      send("typing:stop");
      lastSentRef.current = 0;
    }, 3_000);
  }, [send]);

  const notifyStopped = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    lastSentRef.current = 0;
    send("typing:stop");
  }, [send]);

  return { notifyTyping, notifyStopped };
}

export type TypingUser = {
  id: string;
  name: string;
};

/**
 * Subscribes to typing events from peers on a channel and returns the
 * currently-typing list (excluding the current user). The list is
 * trimmed on a 1 s tick — if a sender disconnects mid-burst its entry
 * expires after STALE_MS even without an explicit `typing:stop`.
 */
export function useTypingSubscribers(
  channelId: string | null,
  selfUserId: string | null,
): TypingUser[] {
  const [typingMap, setTypingMap] = useState<
    Map<string, { name: string; expiresAt: number }>
  >(new Map());

  useEffect(() => {
    if (!channelId) return;
    const supabase = createSupabaseBrowserClient();
    const ch = supabase.channel(`chat-typing:${channelId}`, {
      config: {
        broadcast: { self: false, ack: false },
      },
    });

    ch.on("broadcast", { event: "typing:start" }, (msg) => {
      const p = (msg.payload ?? {}) as TypingPayload;
      if (!p.user_id || p.user_id === selfUserId) return;
      setTypingMap((prev) => {
        const next = new Map(prev);
        next.set(p.user_id, {
          name: p.name,
          expiresAt: Date.now() + STALE_MS,
        });
        return next;
      });
    });

    ch.on("broadcast", { event: "typing:stop" }, (msg) => {
      const p = (msg.payload ?? {}) as TypingPayload;
      if (!p.user_id) return;
      setTypingMap((prev) => {
        if (!prev.has(p.user_id)) return prev;
        const next = new Map(prev);
        next.delete(p.user_id);
        return next;
      });
    });

    void ch.subscribe();

    // Sweeper: every second, prune entries whose expiresAt passed.
    const interval = setInterval(() => {
      setTypingMap((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [k, v] of prev.entries()) {
          if (v.expiresAt <= now) {
            next.delete(k);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1_000);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(ch);
    };
  }, [channelId, selfUserId]);

  return Array.from(typingMap.entries())
    .map(([id, v]) => ({ id, name: v.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

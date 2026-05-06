"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  Member,
  PinnedMessage,
} from "@/components/chat/ChannelInfoPanel";
import type { ChatAttachment } from "@/types/chat";

export type ChannelInfo = {
  members: Member[];
  pinned: PinnedMessage[];
  files: ChatAttachment[];
};

const EMPTY: ChannelInfo = { members: [], pinned: [], files: [] };

/**
 * Loads members, pinned messages, and shared files for one channel.
 * Re-runs whenever the channelId changes; doesn't subscribe (the data is
 * stable enough that a route change is the right invalidation point).
 */
export function useChannelInfo(channelId: string | null): {
  data: ChannelInfo;
  loading: boolean;
} {
  const [data, setData] = useState<ChannelInfo>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!channelId) {
      setData(EMPTY);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    (async () => {
      // Members — join chat_members → profiles, plus the member's role/role label.
      const { data: memberRows } = await supabase
        .from("chat_members")
        .select(
          `user_id,
           profile:profiles ( id, full_name, role )`,
        )
        .eq("channel_id", channelId);

      type MemRow = {
        user_id: string;
        profile: { id: string; full_name: string; role: string | null } | null;
      };
      const members: Member[] = ((memberRows ?? []) as unknown as MemRow[])
        .map((m) => m.profile)
        .filter(Boolean)
        .map((p) => ({
          id: p!.id,
          full_name: p!.full_name,
          role: p!.role,
          role_label: p!.role
            ? p!.role === "admin"
              ? "Management"
              : p!.role === "dispatcher"
                ? "Project Manager"
                : "Field Staff"
            : null,
        }));

      // Pinned messages
      const { data: pinRows } = await supabase
        .from("chat_pinned_messages")
        .select(
          `message_id, pinned_at,
           message:chat_messages ( id, body ),
           pinner:profiles!chat_pinned_messages_pinned_by_fkey ( full_name )`,
        )
        .eq("channel_id", channelId)
        .order("pinned_at", { ascending: false });

      type PinRow = {
        message_id: string;
        pinned_at: string;
        message: { id: string; body: string } | null;
        pinner: { full_name: string } | null;
      };
      const pinned: PinnedMessage[] = ((pinRows ?? []) as unknown as PinRow[])
        .filter((p) => p.message)
        .map((p) => ({
          id: p.message!.id,
          body: p.message!.body,
          pinned_at: p.pinned_at,
          pinned_by_name: p.pinner?.full_name ?? null,
        }));

      // Files — pull message attachments JSON for the channel and flatten.
      const { data: msgRows } = await supabase
        .from("chat_messages")
        .select("attachments")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(200);

      type MsgRow = { attachments: ChatAttachment[] | null };
      const files: ChatAttachment[] = ((msgRows ?? []) as unknown as MsgRow[])
        .flatMap((r) => r.attachments ?? [])
        .slice(0, 50);

      if (cancelled) return;
      setData({ members, pinned, files });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [channelId]);

  return { data, loading };
}

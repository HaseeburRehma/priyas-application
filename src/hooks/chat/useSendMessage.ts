"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ChatAttachment, Message } from "@/types/chat";

type SendArgs = {
  channelId: string;
  body: string;
  attachments?: ChatAttachment[];
  /** Called with the optimistic message before it's persisted. */
  onOptimistic?: (m: Message) => void;
};

/**
 * Sends a chat message. The component is expected to render the optimistic
 * row immediately (via `onOptimistic`); on success we replace it with the
 * persisted row, and on failure we surface the error.
 */
export function useSendMessage() {
  const supabase = createSupabaseBrowserClient();
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async ({ channelId, body, attachments, onOptimistic }: SendArgs) => {
      setError(null);
      const trimmed = body.trim();
      const atts = attachments ?? [];
      // A message must have either text or at least one attachment.
      if (!trimmed && atts.length === 0) return null;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated");
        return null;
      }

      // Look up org_id once. This could be cached on user-context later.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await ((supabase as any).from("profiles"))
        .select("org_id")
        .eq("id", user.id)
        .maybeSingle();
      const orgId = (profile as { org_id: string } | null)?.org_id;
      if (!orgId) {
        setError("Profile is not attached to an organization yet");
        return null;
      }

      // Optimistic message
      const tempId = `temp-${crypto.randomUUID()}`;
      const optimistic: Message = {
        id: tempId,
        org_id: orgId,
        channel_id: channelId,
        user_id: user.id,
        body: trimmed,
        attachments: atts,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
      };
      onOptimistic?.(optimistic);

      setSending(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await ((supabase as any).from("chat_messages"))
        .insert({
          org_id: orgId,
          channel_id: channelId,
          user_id: user.id,
          body: trimmed,
          attachments: atts,
        })
        .select("*")
        .single();
      setSending(false);

      if (error) {
        setError(error.message);
        return null;
      }

      // Bust the channel list cache so unread/last-message refresh on next load.
      qc.invalidateQueries({ queryKey: ["chat", "channels"] });
      return data as Message;
    },
    [supabase, qc],
  );

  return { send, sending, error };
}

/** Mark every message in a channel as read up to "now". */
export function useMarkChannelRead() {
  const supabase = createSupabaseBrowserClient();
  const qc = useQueryClient();
  return useCallback(
    async (channelId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ((supabase as any).from("chat_members"))
        .update({ last_read_at: new Date().toISOString() })
        .eq("channel_id", channelId)
        .eq("user_id", user.id);
      qc.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
    [supabase, qc],
  );
}

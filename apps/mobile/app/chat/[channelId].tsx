/**
 * Chat thread — messages list + input, with realtime + typing.
 *
 * On mount:
 *   1. Load the last 100 messages (oldest → newest).
 *   2. Mark the channel read.
 *   3. Subscribe to Postgres CDC for new inserts on this channel.
 *   4. Subscribe to a `typing:<channelId>` broadcast channel for
 *      lightweight typing indicators.
 * On unmount: tear both subscriptions down.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CenterSpinner } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  loadChannelMessages,
  markChannelRead,
  sendMessage,
  subscribeChannelMessages,
  subscribeTyping,
  type ChatMessageRow,
} from "@/lib/chat";
import { colors, radius, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

const TYPING_TTL_MS = 3500;

export default function ChatThread() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState<Map<string, { name: string; at: number }>>(
    new Map(),
  );

  const listRef = useRef<FlatList<ChatMessageRow>>(null);
  const typingCleanupRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingBroadcastRef = useRef<((u: string, n: string) => void) | null>(null);

  const { data, isLoading } = useQuery<ChatMessageRow[]>({
    queryKey: ["chat-messages", channelId],
    queryFn: () =>
      channelId ? loadChannelMessages(channelId) : Promise.resolve([]),
    enabled: !!channelId,
  });
  const messages = data ?? [];

  // Mark read on mount so the channel-list unread badge drops.
  useEffect(() => {
    if (!channelId) return;
    void markChannelRead(channelId).then(() => {
      void qc.invalidateQueries({ queryKey: ["chat-channels"] });
    });
  }, [channelId, qc]);

  // Realtime message subscription.
  useEffect(() => {
    if (!channelId) return;
    const unsub = subscribeChannelMessages(channelId, (raw) => {
      qc.setQueryData<ChatMessageRow[]>(
        ["chat-messages", channelId],
        (prev) => {
          const list = prev ?? [];
          if (list.some((m) => m.id === raw.id)) return list; // dedup
          return [
            ...list,
            {
              id: raw.id,
              channel_id: raw.channel_id,
              user_id: raw.user_id,
              body: raw.body,
              created_at: raw.created_at,
              edited_at: null,
              // Author name unknown from CDC payload; the query will
              // refetch on next window focus with the full name.
              author_name: raw.user_id === profile?.id ? profile.fullName : "…",
            },
          ];
        },
      );
      // Also mark the channel read so the sender-side badge doesn't
      // accumulate against them.
      if (raw.user_id === profile?.id) {
        void markChannelRead(channelId);
      }
    });
    return unsub;
  }, [channelId, profile?.id, profile?.fullName, qc]);

  // Typing indicator subscription.
  useEffect(() => {
    if (!channelId || !profile) return;
    const sub = subscribeTyping(channelId, ({ userId, userName }) => {
      if (userId === profile.id) return;
      setTyping((prev) => {
        const next = new Map(prev);
        next.set(userId, { name: userName, at: Date.now() });
        return next;
      });
    });
    typingBroadcastRef.current = sub.broadcast;

    // GC loop: drop entries older than TYPING_TTL_MS so the badge fades.
    typingCleanupRef.current = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [uid, val] of next) {
          if (now - val.at > TYPING_TTL_MS) {
            next.delete(uid);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1_000);

    return () => {
      sub.unsubscribe();
      if (typingCleanupRef.current) clearInterval(typingCleanupRef.current);
      typingBroadcastRef.current = null;
    };
  }, [channelId, profile]);

  const onSubmit = useCallback(async () => {
    if (!channelId) return;
    const body = draft;
    setDraft("");
    setSending(true);
    const r = await sendMessage(channelId, body);
    setSending(false);
    if (!r.ok) {
      setDraft(body); // restore on failure so the user doesn't lose the text
    }
  }, [channelId, draft]);

  // Auto-scroll to bottom whenever the message list grows.
  useEffect(() => {
    if (!messages.length) return;
    const id = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(id);
  }, [messages.length]);

  const activeTypers = Array.from(typing.values()).map((v) => v.name);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>← {t("chat.back")}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
        style={{ flex: 1 }}
      >
        {isLoading ? (
          <CenterSpinner />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.msgList}
            renderItem={({ item }) => {
              const mine = item.user_id === profile?.id;
              return (
                <View
                  style={[
                    styles.bubbleRow,
                    { justifyContent: mine ? "flex-end" : "flex-start" },
                  ]}
                >
                  <View
                    style={[
                      styles.bubble,
                      mine ? styles.bubbleMine : styles.bubbleTheirs,
                    ]}
                  >
                    {!mine && (
                      <Text style={styles.author}>{item.author_name}</Text>
                    )}
                    <Text
                      style={mine ? styles.bodyMine : styles.bodyTheirs}
                    >
                      {item.body}
                    </Text>
                    <Text
                      style={mine ? styles.timeMine : styles.timeTheirs}
                    >
                      {format(parseISO(item.created_at), "HH:mm")}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {activeTypers.length > 0 && (
          <View style={styles.typing}>
            <View style={styles.typingDot} />
            <Text style={styles.typingText}>
              {activeTypers.slice(0, 2).join(", ")}
              {activeTypers.length > 2 ? ` +${activeTypers.length - 2}` : ""}{" "}
              {t("chat.typing")}
            </Text>
          </View>
        )}

        <View style={styles.inputBar}>
          <TextInput
            value={draft}
            onChangeText={(txt) => {
              setDraft(txt);
              if (profile && typingBroadcastRef.current) {
                typingBroadcastRef.current(profile.id, profile.fullName);
              }
            }}
            placeholder={t("chat.messagePlaceholder")}
            placeholderTextColor={colors.neutral[400]}
            style={styles.input}
            multiline
          />
          <Pressable
            onPress={onSubmit}
            disabled={sending || !draft.trim()}
            style={[
              styles.sendBtn,
              (sending || !draft.trim()) && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.sendLabel}>{t("chat.send")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
    backgroundColor: colors.white,
  },
  back: {
    fontSize: typography.size.md,
    color: colors.primary[600],
    fontWeight: "600",
  },
  msgList: {
    padding: spacing[4],
    gap: spacing[2],
  },
  bubbleRow: {
    flexDirection: "row",
    width: "100%",
  },
  bubble: {
    maxWidth: "80%",
    padding: spacing[3],
    borderRadius: radius.lg,
  },
  bubbleMine: {
    backgroundColor: colors.primary[500],
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: colors.white,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.neutral[100],
  },
  author: {
    fontSize: typography.size.xs,
    fontWeight: "700",
    color: colors.secondary[500],
    marginBottom: 2,
  },
  bodyMine: {
    color: colors.white,
    fontSize: typography.size.md,
    lineHeight: 20,
  },
  bodyTheirs: {
    color: colors.neutral[800],
    fontSize: typography.size.md,
    lineHeight: 20,
  },
  timeMine: {
    fontSize: typography.size.xs,
    color: "rgba(255,255,255,0.75)",
    textAlign: "right",
    marginTop: 4,
    fontFamily: "Menlo",
  },
  timeTheirs: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    textAlign: "right",
    marginTop: 4,
    fontFamily: "Menlo",
  },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing[4],
    paddingVertical: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary[500],
  },
  typingText: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    fontStyle: "italic",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing[2],
    padding: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
    backgroundColor: colors.white,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    fontSize: typography.size.md,
    color: colors.neutral[800],
  },
  sendBtn: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.primary[500],
    justifyContent: "center",
  },
  sendLabel: {
    color: colors.white,
    fontWeight: "700",
    fontSize: typography.size.md,
  },
});

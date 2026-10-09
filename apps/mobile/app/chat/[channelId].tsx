/**
 * Chat thread — Figma "09 · Chat-Verlauf". Messages list + composer,
 * with realtime + typing.
 *
 * On mount:
 *   1. Load the last 100 messages (oldest → newest).
 *   2. Mark the channel read.
 *   3. Subscribe to Postgres CDC for new inserts on this channel.
 *   4. Subscribe to a `typing:<channelId>` broadcast channel for
 *      lightweight typing indicators.
 * On unmount: tear both subscriptions down.
 *
 * Presentation: white top bar (back · channel chip · member line), day
 * separators, others' bubbles on the left with avatar + name + role
 * badge + time, own bubbles on the right in brand green with a read
 * receipt derived from the members' `last_read_at` cursors.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isSameDay, isToday, isYesterday, parseISO } from "date-fns";
import { de, enUS, ta } from "date-fns/locale";
import { Avatar, Badge, CenterSpinner, EmptyState, IconChip, RoundButton, Txt } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  channelDisplayName,
  channelKind,
  loadChannelMembers,
  loadChannelMessages,
  loadMyChannels,
  markChannelRead,
  sendMessage,
  subscribeChannelMessages,
  subscribeTyping,
  type ChatChannelRow,
  type ChatMemberRow,
  type ChatMessageRow,
} from "@/lib/chat";
import { colors, fonts, radius, spacing, text } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

const TYPING_TTL_MS = 3500;
/** Consecutive messages from one author within this window share a header. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const CARE_RE = /alltagshilfe|pflege/i;

function dfLocale() {
  return i18n.locale === "en" ? enUS : i18n.locale === "ta" ? ta : de;
}

/** "Heute · 9. Oktober" / "Gestern · 8. Oktober" / "Montag · 6. Oktober". */
function dayLabel(d: Date): string {
  const locale = dfLocale();
  const date = format(d, locale === de ? "d. MMMM" : "d MMMM", { locale });
  if (isToday(d)) return t("notifications.groups.today", { date });
  if (isYesterday(d)) return t("notifications.groups.yesterday", { date });
  return `${format(d, "EEEE", { locale })} · ${date}`;
}

function roleLabel(role?: string | null): string | null {
  return role === "admin" || role === "dispatcher" || role === "employee"
    ? t(`mobile.ui.more.role.${role}`)
    : null;
}

function sameGroup(a: ChatMessageRow, b: ChatMessageRow): boolean {
  if (a.user_id !== b.user_id) return false;
  const da = parseISO(a.created_at);
  const db = parseISO(b.created_at);
  return isSameDay(da, db) && Math.abs(db.getTime() - da.getTime()) < GROUP_WINDOW_MS;
}

export default function ChatThread() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  // Header data: the channel row comes from the list cache shared with
  // the Chat tab + tab bar; the roster gives member count, the DM
  // partner, author roles for realtime rows and read receipts.
  const { data: channels } = useQuery<ChatChannelRow[]>({
    queryKey: ["chat-channels"],
    queryFn: loadMyChannels,
  });
  const channel = channels?.find((c) => c.id === channelId) ?? null;
  const { data: members } = useQuery<ChatMemberRow[]>({
    queryKey: ["chat-members", channelId],
    queryFn: () => (channelId ? loadChannelMembers(channelId) : Promise.resolve([])),
    enabled: !!channelId,
    refetchInterval: 30_000,
  });

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

  // ── Derived presentation data ─────────────────────────────────────
  const memberById = useMemo(
    () => new Map((members ?? []).map((m) => [m.user_id, m])),
    [members],
  );
  const kind = channel ? channelKind(channel) : "channel";
  const dmPartner =
    kind === "direct" ? (members ?? []).find((m) => m.user_id !== profile?.id) ?? null : null;
  const title =
    dmPartner?.full_name ??
    (channel ? channelDisplayName(channel, profile?.fullName) : null) ??
    (kind === "direct" ? t("chat.dm") : t("chat.channel"));
  const care = kind === "channel" && CARE_RE.test(channel?.name ?? "");
  const metaLine = (
    kind === "direct"
      ? [roleLabel(dmPartner?.role)]
      : [
          members && members.length > 0
            ? t("mobile.ui.chat.memberCount", { n: members.length })
            : null,
          channel?.description ?? null,
        ]
  )
    .filter(Boolean)
    .join(" · ");

  // Read cursors of everyone but me — only when the roster loaded.
  const otherReadAt = useMemo(
    () =>
      (members ?? [])
        .filter((m) => m.user_id !== profile?.id && m.last_read_at)
        .map((m) => parseISO(m.last_read_at!).getTime()),
    [members, profile?.id],
  );
  const readLabelFor = (createdAt: string): string | null => {
    if (!members || members.length === 0) return null;
    const at = parseISO(createdAt).getTime();
    const n = otherReadAt.filter((r) => r >= at).length;
    if (n === 0) return null;
    return kind === "direct" ? t("mobile.ui.chat.read") : t("mobile.ui.chat.readBy", { n });
  };

  const canSend = !sending && !!draft.trim();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <RoundButton
          icon="chevron-left"
          variant="plain"
          onPress={() => router.back()}
          accessibilityLabel={t("chat.back")}
        />
        {kind === "channel" ? (
          <IconChip
            icon={channel?.is_private ? "lock" : "hash"}
            tone={care ? "error" : channel?.is_private ? "info" : "brand"}
            size={40}
            iconSize={20}
          />
        ) : (
          <Avatar name={title} size={40} />
        )}
        <View style={styles.topText}>
          <Txt v="headline" numberOfLines={1}>
            {title}
          </Txt>
          {metaLine ? (
            <Txt v="caption" color={colors.neutral[500]} numberOfLines={1}>
              {metaLine}
            </Txt>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.body}
      >
        {isLoading ? (
          <CenterSpinner />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            extraData={members}
            keyExtractor={(m) => m.id}
            contentContainerStyle={[styles.msgList, messages.length === 0 && styles.msgListEmpty]}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <EmptyState
                icon="chat"
                title={t("chat.thread.emptyTitle")}
                subtitle={t("chat.thread.emptyBody")}
              />
            }
            renderItem={({ item, index }) => {
              const prev = index > 0 ? messages[index - 1] : undefined;
              const next = messages[index + 1];
              const d = parseISO(item.created_at);
              const newDay = !prev || !isSameDay(parseISO(prev.created_at), d);
              const groupedWithPrev = !!prev && !newDay && sameGroup(prev, item);
              const groupedWithNext = !!next && sameGroup(item, next);
              const mine = item.user_id === profile?.id;
              const time = format(d, "HH:mm");

              const separator = newDay ? (
                <View style={styles.dayWrap}>
                  <View style={styles.dayPill}>
                    <Txt v="caption" color={colors.neutral[600]}>
                      {dayLabel(d)}
                    </Txt>
                  </View>
                </View>
              ) : null;

              if (mine) {
                const read = groupedWithNext ? null : readLabelFor(item.created_at);
                return (
                  <View>
                    {separator}
                    <View style={[styles.ownRow, { marginTop: groupedWithPrev ? 4 : 14 }]}>
                      <View style={styles.bubbleMine}>
                        <Txt v="body" color={colors.white}>
                          {item.body}
                        </Txt>
                      </View>
                      {!groupedWithNext ? (
                        <View style={styles.ownMeta}>
                          <Txt v="mono" color={colors.neutral[400]} style={styles.metaMono}>
                            {time}
                          </Txt>
                          {read ? (
                            <Txt v="caption" color={colors.neutral[500]}>
                              {`· ${read}`}
                            </Txt>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              }

              const member = memberById.get(item.user_id);
              // CDC-inserted rows carry "…" until the next refetch — fall
              // back to the roster for the name.
              const name =
                item.author_name === "…" ? member?.full_name ?? item.author_name : item.author_name;
              const role = roleLabel(item.author_role ?? member?.role);
              return (
                <View>
                  {separator}
                  <View style={[styles.otherRow, { marginTop: groupedWithPrev ? 4 : 14 }]}>
                    <View style={styles.avatarCol}>
                      {!groupedWithPrev ? <Avatar name={name} size={32} /> : null}
                    </View>
                    <View style={styles.otherCol}>
                      {!groupedWithPrev ? (
                        <View style={styles.authorRow}>
                          <Txt v="subheadStrong" numberOfLines={1} style={styles.authorName}>
                            {name}
                          </Txt>
                          {role ? <Badge label={role} tone="neutral" dot={false} /> : null}
                          <Txt v="mono" color={colors.neutral[400]} style={styles.metaMono}>
                            {time}
                          </Txt>
                        </View>
                      ) : null}
                      <View style={styles.bubbleTheirs}>
                        <Txt v="body" color={colors.neutral[800]}>
                          {item.body}
                        </Txt>
                      </View>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}

        {activeTypers.length > 0 && (
          <View style={styles.typing}>
            <View style={styles.typingDots}>
              <View style={styles.typingDot} />
              <View style={styles.typingDot} />
              <View style={styles.typingDot} />
            </View>
            <Txt v="caption" color={colors.neutral[500]} style={styles.typingText} numberOfLines={1}>
              {activeTypers.slice(0, 2).join(", ")}
              {activeTypers.length > 2 ? ` +${activeTypers.length - 2}` : ""}{" "}
              {t("chat.typing")}
            </Txt>
          </View>
        )}

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={(txt) => {
              setDraft(txt);
              if (profile && typingBroadcastRef.current) {
                typingBroadcastRef.current(profile.id, profile.fullName);
              }
            }}
            placeholder={
              channel
                ? t("mobile.ui.chat.placeholderTo", {
                    name: kind === "channel" ? `#${title}` : title,
                  })
                : t("chat.messagePlaceholder")
            }
            placeholderTextColor={colors.neutral[400]}
            style={styles.input}
            multiline
          />
          <View style={!canSend && styles.sendDisabled}>
            <RoundButton
              icon="send"
              variant="primary"
              size={44}
              onPress={canSend ? onSubmit : undefined}
              accessibilityLabel={t("chat.send")}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
      {/* Outside the KeyboardAvoidingView so the keyboard covers it
       *  instead of adding its height on top of the keyboard. */}
      <View style={{ height: insets.bottom, backgroundColor: colors.white }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingLeft: spacing[2],
    paddingRight: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  topText: { flex: 1, minWidth: 0, marginLeft: 4 },
  body: { flex: 1, backgroundColor: colors.neutral[50] },
  msgList: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[4],
  },
  msgListEmpty: { flexGrow: 1, justifyContent: "center" },
  dayWrap: { alignItems: "center", marginTop: spacing[4] },
  dayPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.neutral[100],
  },
  otherRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  avatarCol: { width: 32 },
  otherCol: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 6 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "100%" },
  authorName: { flexShrink: 1 },
  metaMono: { fontSize: 12 },
  bubbleTheirs: {
    maxWidth: "100%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.xl,
    borderTopLeftRadius: 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.neutral[100],
  },
  ownRow: { alignItems: "flex-end", gap: 4 },
  bubbleMine: {
    maxWidth: "82%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.xl,
    borderBottomRightRadius: 4,
    backgroundColor: colors.primary[500],
  },
  ownMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing[4] + 42,
    paddingVertical: 6,
  },
  typingDots: { flexDirection: "row", gap: 3 },
  typingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.neutral[400] },
  typingText: { flexShrink: 1, fontFamily: fonts.italic },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
    backgroundColor: colors.white,
  },
  input: {
    ...text.body,
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.neutral[50],
    color: colors.neutral[900],
  },
  sendDisabled: { opacity: 0.5 },
});

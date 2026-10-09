/**
 * Chat tab — Figma "08 · Team-Chat".
 *
 * Every channel I'm a member of, grouped by kind (Kanäle · Direkt-
 * nachrichten · Gruppen) into white cards. Search + filter chips narrow
 * the list client-side; each row shows the latest message preview, its
 * time and an unread counter. Tap → thread route.
 *
 * The `["chat-channels"]` query is shared with the tab bar's unread badge
 * and the thread screen — keep the key and loader unchanged.
 */

import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { differenceInCalendarDays, format, isToday, isYesterday, parseISO } from "date-fns";
import { de, enUS, ta } from "date-fns/locale";
import {
  Avatar,
  Card,
  CenterSpinner,
  ChipRow,
  CountPill,
  Divider,
  EmptyState,
  FilterChip,
  GroupLabel,
  IconChip,
  LargeHeader,
  Screen,
  SearchField,
  Txt,
  type Tone,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  channelDisplayName,
  channelKind,
  loadMyChannels,
  type ChatChannelKind,
  type ChatChannelRow,
} from "@/lib/chat";
import { colors, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

type Kind = ChatChannelKind;
type Filter = "all" | "unread" | "channel" | "direct";

const FILTERS: Filter[] = ["all", "unread", "channel", "direct"];
const SECTIONS: { kind: Kind; titleKey: string }[] = [
  { kind: "channel", titleKey: "chat.channels.sectionChannels" },
  { kind: "direct", titleKey: "chat.channels.sectionDirects" },
  { kind: "group", titleKey: "chat.channels.sectionGroups" },
];

/** Alltagshilfe / care channels carry the red brand ramp. */
const CARE_RE = /alltagshilfe|pflege/i;

function channelTitle(c: ChatChannelRow, myName?: string | null): string {
  return channelDisplayName(c, myName) ?? (channelKind(c) === "direct" ? t("chat.dm") : t("chat.channel"));
}

function dfLocale() {
  return i18n.locale === "en" ? enUS : i18n.locale === "ta" ? ta : de;
}

/** "10:02" today · "Gestern" · "Mo" this week · "2. Okt." older. */
function shortTime(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return t("mobile.ui.chat.yesterday");
  const locale = dfLocale();
  if (differenceInCalendarDays(new Date(), d) < 7) return format(d, "EEEEEE", { locale });
  return format(d, locale === de ? "d. MMM" : "d MMM", { locale });
}

export default function ChatTab() {
  const router = useRouter();
  const { profile } = useAuth();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const { data, isLoading, refetch, isRefetching } = useQuery<ChatChannelRow[]>({
    queryKey: ["chat-channels"],
    queryFn: loadMyChannels,
    refetchInterval: 30_000,
  });

  const channels = data ?? [];
  const myName = profile?.fullName ?? null;
  const unreadConversations = channels.filter((c) => c.unread_count > 0).length;

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return channels.filter((c) => {
      if (filter === "unread" && c.unread_count === 0) return false;
      if (filter === "channel" && channelKind(c) !== "channel") return false;
      if (filter === "direct" && channelKind(c) !== "direct") return false;
      if (!needle) return true;
      return (
        channelTitle(c, myName).toLowerCase().includes(needle) ||
        (c.last_message_body ?? "").toLowerCase().includes(needle) ||
        (c.description ?? "").toLowerCase().includes(needle)
      );
    });
  }, [channels, filter, q, myName]);

  const sections = useMemo(
    () =>
      SECTIONS.map((s) => ({ ...s, rows: visible.filter((c) => channelKind(c) === s.kind) })).filter(
        (s) => s.rows.length > 0,
      ),
    [visible],
  );

  const onPress = useCallback(
    (id: string) => router.push({ pathname: "/chat/[channelId]", params: { channelId: id } }),
    [router],
  );

  const filterLabel = (f: Filter) =>
    f === "all"
      ? t("notifications.filter.all")
      : f === "unread"
        ? t("notifications.filter.unread")
        : f === "channel"
          ? t("chat.channels.sectionChannels")
          : t("mobile.ui.chat.filterDirect");

  return (
    <Screen
      header={<LargeHeader title={t("chat.title")} subtitle={t("mobile.ui.chat.subtitle")} />}
      refreshing={isRefetching}
      onRefresh={() => refetch()}
    >
      <SearchField value={q} onChangeText={setQ} placeholder={t("mobile.ui.chat.searchPlaceholder")} />

      <ChipRow>
        {FILTERS.map((f) => (
          <FilterChip
            key={f}
            label={filterLabel(f)}
            count={f === "unread" && unreadConversations > 0 ? unreadConversations : undefined}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ChipRow>

      {isLoading ? (
        <CenterSpinner />
      ) : channels.length === 0 ? (
        <EmptyState icon="chat" title={t("chat.emptyTitle")} subtitle={t("chat.emptyBody")} />
      ) : sections.length === 0 ? (
        <EmptyState icon="search" title={t("chat.channels.emptyFilter")} />
      ) : (
        sections.map((s) => (
          <View key={s.kind} style={styles.section}>
            <View style={styles.groupHead}>
              <GroupLabel>{t(s.titleKey)}</GroupLabel>
              <Txt v="caption" color={colors.neutral[400]}>
                {String(s.rows.length)}
              </Txt>
            </View>
            <Card padded={false} style={styles.card}>
              {s.rows.map((c, i) => (
                <View key={c.id}>
                  {i > 0 ? <Divider /> : null}
                  <ChannelRowItem channel={c} title={channelTitle(c, myName)} onPress={onPress} />
                </View>
              ))}
            </Card>
          </View>
        ))
      )}
    </Screen>
  );
}

const ChannelRowItem = memo(function ChannelRowItem({
  channel: c,
  title,
  onPress,
}: {
  channel: ChatChannelRow;
  title: string;
  onPress: (id: string) => void;
}) {
  const kind = channelKind(c);
  const unread = c.unread_count > 0;
  const care = kind === "channel" && CARE_RE.test(c.name ?? "");
  const chipTone: Tone = care ? "error" : c.is_private ? "info" : unread ? "brand" : "neutral";

  return (
    <Pressable
      onPress={() => onPress(c.id)}
      accessibilityRole="button"
      android_ripple={{ color: colors.neutral[100] }}
      style={({ pressed }) => [
        styles.row,
        unread && styles.rowUnread,
        pressed && { backgroundColor: colors.neutral[50] },
      ]}
    >
      {kind === "channel" ? (
        <IconChip icon={c.is_private ? "lock" : "hash"} tone={chipTone} size={40} iconSize={18} />
      ) : (
        <Avatar name={title} size={40} />
      )}
      <View style={styles.body}>
        <Txt
          v={unread ? "bodyStrong" : "body"}
          color={care ? colors.error[700] : colors.neutral[900]}
          numberOfLines={1}
        >
          {title}
        </Txt>
        <Txt v="subhead" color={colors.neutral[500]} numberOfLines={1}>
          {c.last_message_body ?? c.description ?? t("chat.noMessages")}
        </Txt>
      </View>
      <View style={styles.trailing}>
        {c.last_message_at ? (
          <Txt v="caption" color={unread ? colors.primary[600] : colors.neutral[400]}>
            {shortTime(c.last_message_at)}
          </Txt>
        ) : null}
        {unread ? <CountPill count={c.unread_count > 99 ? "99+" : c.unread_count} /> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  section: { gap: spacing[2] },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 4,
  },
  card: { overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: 14,
  },
  rowUnread: { backgroundColor: "rgba(238,245,232,0.6)" },
  body: { flex: 1, minWidth: 0, gap: 2 },
  trailing: { alignItems: "flex-end", gap: 4, minWidth: 36 },
});

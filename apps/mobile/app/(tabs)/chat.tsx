/**
 * Chat tab — list of my channels.
 *
 * Ordered newest-activity first. Each row shows channel name, latest
 * message preview, and an unread badge. Tap → thread route.
 */

import React, { useCallback } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { formatDistanceToNow, parseISO } from "date-fns";
import { CenterSpinner, EmptyState } from "@/components/ui";
import { loadMyChannels, type ChatChannelRow } from "@/lib/chat";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function ChatTab() {
  const router = useRouter();

  const { data, isLoading, refetch, isRefetching } = useQuery<ChatChannelRow[]>({
    queryKey: ["chat-channels"],
    queryFn: loadMyChannels,
    refetchInterval: 30_000,
  });

  const channels = data ?? [];

  const onPress = useCallback(
    (id: string) =>
      router.push({ pathname: "/chat/[channelId]", params: { channelId: id } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatChannelRow }) => (
      <ChannelRowItem channel={item} onPress={onPress} />
    ),
    [onPress],
  );

  const keyExtractor = useCallback((item: ChatChannelRow) => item.id, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.tertiary[200] }} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("chat.title")}</Text>
        <Text style={styles.sub}>{t("chat.subtitle")}</Text>
      </View>
      {isLoading ? (
        <CenterSpinner />
      ) : (
        <FlatList
          data={channels}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={ListSeparator}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor={colors.primary[500]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={t("chat.emptyTitle")}
              subtitle={t("chat.emptyBody")}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const ListSeparator = () => <View style={styles.sep} />;

const ChannelRowItem = React.memo(function ChannelRowItem({
  channel: c,
  onPress,
}: {
  channel: ChatChannelRow;
  onPress: (id: string) => void;
}) {
  const displayName =
    c.name || (c.is_direct ? t("chat.dm") : t("chat.channel"));
  return (
    <Pressable
      onPress={() => onPress(c.id)}
      android_ripple={{ color: colors.neutral[100] }}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.neutral[50] },
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: c.is_direct
              ? colors.secondary[500]
              : colors.primary[500],
          },
        ]}
      >
        <Text style={styles.avatarText}>
          {(displayName[0] ?? "?").toUpperCase()}
        </Text>
      </View>
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>
            {c.is_direct ? "" : "#"}
            {displayName}
          </Text>
          {c.last_message_at ? (
            <Text style={styles.time}>
              {formatDistanceToNow(parseISO(c.last_message_at), {
                addSuffix: false,
              })}
            </Text>
          ) : null}
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.preview} numberOfLines={1}>
            {c.last_message_body ?? t("chat.noMessages")}
          </Text>
          {c.unread_count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {c.unread_count > 99 ? "99+" : c.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  title: {
    fontSize: typography.size["2xl"],
    fontWeight: "800",
    color: colors.secondary[500],
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: typography.size.md,
    color: colors.neutral[500],
    marginTop: 2,
  },
  list: {
    paddingBottom: spacing[6],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.white,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 16,
  },
  body: { flex: 1 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  name: {
    flex: 1,
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  time: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    fontFamily: "Menlo",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 3,
    gap: spacing[2],
  },
  preview: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.neutral[600],
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.primary[500],
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 11,
  },
  sep: { height: 1, backgroundColor: colors.neutral[100] },
});

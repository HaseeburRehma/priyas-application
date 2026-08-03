/**
 * Notifications tab — inbox view.
 *
 * Filter pills at the top: All / Unread / Shifts / Invoices / System.
 * Tapping a row marks it read (optimistic) and, if the row carries a
 * `link`, navigates the user there. "Mark all read" wipes unread badges
 * in one round-trip.
 */

import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Card, CenterSpinner, Chip, EmptyState } from "@/components/ui";
import {
  loadMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationCategory,
  type NotificationRow,
} from "@/lib/notifications";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

type Filter = "all" | "unread" | NotificationCategory;

const FILTER_ORDER: Filter[] = [
  "all",
  "unread",
  "shift",
  "invoice",
  "vacation",
  "training",
  "system",
];

export default function NotificationsTab() {
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  const { data, isLoading, refetch, isRefetching } = useQuery<NotificationRow[]>({
    queryKey: ["notifications"],
    queryFn: loadMyNotifications,
  });

  const rows = data ?? [];
  const unreadCount = rows.filter((r) => !r.read_at).length;

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "unread") return rows.filter((r) => !r.read_at);
    return rows.filter((r) => r.category === filter);
  }, [rows, filter]);

  async function onTap(row: NotificationRow) {
    if (!row.read_at) {
      // Optimistic — flip the cached row so the UI updates instantly.
      qc.setQueryData<NotificationRow[]>(["notifications"], (prev) =>
        (prev ?? []).map((r) =>
          r.id === row.id ? { ...r, read_at: new Date().toISOString() } : r,
        ),
      );
      void markNotificationRead(row.id).catch(() => {
        // Reconcile on error — the loader is the source of truth.
        void qc.invalidateQueries({ queryKey: ["notifications"] });
      });
    }
    // Deep links: the DB stores `/schedule/<id>` etc.; we resolve
    // them against the tab router. Unknown links are ignored so a
    // malformed link never crashes navigation.
    if (row.link) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push(row.link as any);
      } catch {
        /* invalid href — swallow */
      }
    }
  }

  async function onMarkAll() {
    qc.setQueryData<NotificationRow[]>(["notifications"], (prev) =>
      (prev ?? []).map((r) =>
        r.read_at ? r : { ...r, read_at: new Date().toISOString() },
      ),
    );
    await markAllNotificationsRead();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.tertiary[200] }} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t("notifications.title")}</Text>
            <Text style={styles.sub}>
              {unreadCount > 0
                ? t("notifications.unreadCount", { n: unreadCount })
                : t("notifications.allCaughtUp")}
            </Text>
          </View>
          {unreadCount > 0 && (
            <Pressable onPress={onMarkAll} style={styles.markAllBtn}>
              <Text style={styles.markAllText}>
                {t("notifications.markAll")}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Filter pills — horizontal scroll so more pills can fit on
            small screens without wrapping. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
        >
          {FILTER_ORDER.map((f) => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[
                  styles.pill,
                  active && {
                    backgroundColor: colors.primary[500],
                    borderColor: colors.primary[500],
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pillLabel,
                    active && { color: colors.white },
                  ]}
                >
                  {t(`notifications.filter.${f}` as never)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
        }
      >
        {isLoading && <CenterSpinner />}
        {!isLoading && filtered.length === 0 && (
          <EmptyState
            title={t("notifications.emptyTitle")}
            subtitle={t("notifications.emptyBody")}
          />
        )}
        {filtered.map((row) => {
          const unread = !row.read_at;
          const tone = categoryTone(row.category);
          return (
            <Pressable key={row.id} onPress={() => onTap(row)}>
              <Card
                padded={false}
                style={[
                  styles.itemCard,
                  unread && styles.itemCardUnread,
                ]}
              >
                <View style={styles.itemRow}>
                  <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.iconText, { color: tone.fg }]}>
                      {categoryEmoji(row.category)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text
                        style={[styles.itemTitle, unread && styles.unreadText]}
                        numberOfLines={2}
                      >
                        {row.title}
                      </Text>
                      {unread && <View style={styles.unreadDot} />}
                    </View>
                    {row.body ? (
                      <Text style={styles.itemBody} numberOfLines={2}>
                        {row.body}
                      </Text>
                    ) : null}
                    <View style={styles.metaRow}>
                      <Chip
                        label={t(`notifications.filter.${row.category}` as never)}
                        tone={tone.chip}
                      />
                      <Text style={styles.time}>
                        {formatDistanceToNow(parseISO(row.created_at), {
                          addSuffix: true,
                        })}
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function categoryTone(c: NotificationCategory): {
  bg: string;
  fg: string;
  chip: "primary" | "secondary" | "warning" | "success" | "error" | "neutral";
} {
  switch (c) {
    case "shift":
      return { bg: colors.secondary[50], fg: colors.secondary[500], chip: "secondary" };
    case "invoice":
      return { bg: colors.success[50], fg: colors.success[700], chip: "success" };
    case "vacation":
      return { bg: colors.warning[50], fg: colors.warning[700], chip: "warning" };
    case "training":
      return { bg: colors.primary[50], fg: colors.primary[700], chip: "primary" };
    case "damage":
      return { bg: colors.error[50], fg: colors.error[700], chip: "error" };
    case "chat":
      return { bg: colors.secondary[50], fg: colors.secondary[500], chip: "secondary" };
    default:
      return { bg: colors.neutral[100], fg: colors.neutral[600], chip: "neutral" };
  }
}

function categoryEmoji(c: NotificationCategory): string {
  switch (c) {
    case "shift": return "📅";
    case "invoice": return "€";
    case "vacation": return "✈";
    case "training": return "🎓";
    case "damage": return "!";
    case "chat": return "💬";
    case "system": return "⚙";
    default: return "•";
  }
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    gap: spacing[3],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
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
  markAllBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.white,
  },
  markAllText: {
    fontSize: typography.size.sm,
    fontWeight: "600",
    color: colors.primary[700],
  },
  pillRow: {
    gap: spacing[2],
    paddingRight: spacing[2],
  },
  pill: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  pillLabel: {
    fontSize: typography.size.sm,
    fontWeight: "600",
    color: colors.neutral[700],
  },
  list: {
    padding: spacing[4],
    paddingTop: spacing[2],
    gap: spacing[3],
  },
  itemCard: {
    padding: spacing[4],
  },
  itemCardUnread: {
    borderColor: colors.primary[200],
    backgroundColor: colors.primary[50],
  },
  itemRow: {
    flexDirection: "row",
    gap: spacing[3],
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 18,
    fontWeight: "800",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  itemTitle: {
    flex: 1,
    fontSize: typography.size.md,
    fontWeight: "600",
    color: colors.neutral[800],
    lineHeight: 20,
  },
  unreadText: {
    fontWeight: "800",
    color: colors.secondary[500],
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary[500],
    marginTop: 6,
  },
  itemBody: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
    marginTop: 4,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing[2],
  },
  time: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    fontFamily: "Menlo",
  },
});

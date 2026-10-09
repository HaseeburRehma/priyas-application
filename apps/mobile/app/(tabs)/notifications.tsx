/**
 * Notifications ("Alarme") — Figma "17 · Alarme".
 *
 * Filter chips at the top: All / Unread / Shifts / Invoices / Vacation /
 * Training / System. Cards are grouped into Heute · Gestern · Früher.
 * Tapping a card marks it read (optimistic) and, if the row carries a
 * `link`, navigates the user there. The header check button marks all
 * read in one round-trip.
 */

import { memo, useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from "date-fns";
import { de, enUS, ta } from "date-fns/locale";
import {
  Badge,
  Card,
  CenterSpinner,
  ChipRow,
  EmptyState,
  FilterChip,
  GroupLabel,
  IconChip,
  LargeHeader,
  RoundButton,
  Screen,
  Txt,
  type IconName,
  type Tone,
} from "@/components/ui";
import {
  loadMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationCategory,
  type NotificationRow,
} from "@/lib/notifications";
import { colors, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

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

function dfLocale() {
  return i18n.locale === "en" ? enUS : i18n.locale === "ta" ? ta : de;
}

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

  const groups = useMemo(() => {
    const today: NotificationRow[] = [];
    const yesterday: NotificationRow[] = [];
    const earlier: NotificationRow[] = [];
    for (const r of filtered) {
      const d = parseISO(r.created_at);
      if (isToday(d)) today.push(r);
      else if (isYesterday(d)) yesterday.push(r);
      else earlier.push(r);
    }
    return [
      { key: "today", labelKey: "mobile.ui.alerts.today", rows: today },
      { key: "yesterday", labelKey: "mobile.ui.alerts.yesterday", rows: yesterday },
      { key: "earlier", labelKey: "mobile.ui.alerts.earlier", rows: earlier },
    ].filter((g) => g.rows.length > 0);
  }, [filtered]);

  const onTap = useCallback(async function onTap(row: NotificationRow) {
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
  }, [qc, router]);

  async function onMarkAll() {
    qc.setQueryData<NotificationRow[]>(["notifications"], (prev) =>
      (prev ?? []).map((r) =>
        r.read_at ? r : { ...r, read_at: new Date().toISOString() },
      ),
    );
    await markAllNotificationsRead();
  }

  return (
    <Screen
      header={
        <LargeHeader
          // Hidden tab reached from "Mehr": the tab bar treats "Mehr" as
          // already active here, so give an explicit way back.
          leading={
            <RoundButton
              icon="chevron-left"
              variant="plain"
              onPress={() => router.navigate("/more" as never)}
              accessibilityLabel={t("chat.back")}
            />
          }
          title={t("mobile.more.notifications")}
          subtitle={t("notifications.subtitle")}
          right={
            unreadCount > 0 ? (
              <RoundButton
                icon="check"
                onPress={onMarkAll}
                accessibilityLabel={t("notifications.markAll")}
              />
            ) : undefined
          }
        />
      }
      refreshing={isRefetching}
      onRefresh={() => refetch()}
    >
      <ChipRow>
        {FILTER_ORDER.map((f) => (
          <FilterChip
            key={f}
            label={t(`notifications.filter.${f}`)}
            count={f === "unread" && unreadCount > 0 ? unreadCount : undefined}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ChipRow>

      {isLoading ? (
        <CenterSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="bell"
          title={t("notifications.emptyTitle")}
          subtitle={t("notifications.emptyBody")}
        />
      ) : (
        groups.map((g) => (
          <View key={g.key} style={styles.group}>
            <GroupLabel>{t(g.labelKey)}</GroupLabel>
            {g.rows.map((row) => (
              <NotificationCard key={row.id} row={row} onTap={onTap} />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

const NotificationCard = memo(function NotificationCard({
  row,
  onTap,
}: {
  row: NotificationRow;
  onTap: (row: NotificationRow) => void;
}) {
  const unread = !row.read_at;
  const look = categoryLook(row);
  const meta = `${whenLabel(row.created_at)} · ${t(`notifications.filter.${row.category}`)}`;
  return (
    <Card onPress={() => onTap(row)} style={[styles.card, unread && styles.cardUnread]}>
      <IconChip icon={look.icon} tone={look.tone} size={40} iconSize={20} />
      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          <Txt v={unread ? "bodyStrong" : "body"} style={styles.title} numberOfLines={2}>
            {row.title}
          </Txt>
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>
        {row.body ? (
          <Txt v="subhead" color={colors.neutral[600]} numberOfLines={3}>
            {row.body}
          </Txt>
        ) : null}
        <View style={styles.metaRow}>
          {row.urgent ? <Badge label={t("notifications.urgent")} tone="error" /> : null}
          <Txt v="caption" color={colors.neutral[400]} numberOfLines={1} style={styles.meta}>
            {meta}
          </Txt>
        </View>
      </View>
    </Card>
  );
});

/** "vor 8 Minuten" today · "Gestern · 16:20" · "Mo., 6. Okt. · 14:00". */
function whenLabel(iso: string): string {
  const d = parseISO(iso);
  const locale = dfLocale();
  if (isToday(d)) return formatDistanceToNow(d, { addSuffix: true, locale });
  if (isYesterday(d)) return `${t("mobile.ui.alerts.yesterday")} · ${format(d, "HH:mm")}`;
  return format(d, locale === de ? "EEE, d. MMM · HH:mm" : "EEE, d MMM · HH:mm", { locale });
}

function categoryLook(row: NotificationRow): { icon: IconName; tone: Tone } {
  if (row.urgent) return { icon: "alert", tone: "error" };
  switch (row.category) {
    case "shift":
      return { icon: "calendar", tone: "brand" };
    case "invoice":
      return { icon: "receipt", tone: "brand" };
    case "vacation":
      return { icon: "sun", tone: "warning" };
    case "training":
      return { icon: "graduation", tone: "warning" };
    case "damage":
      return { icon: "camera", tone: "error" };
    case "chat":
      return { icon: "chat", tone: "info" };
    case "system":
      return { icon: "settings", tone: "neutral" };
    default:
      return { icon: "bell", tone: "neutral" };
  }
}

const styles = StyleSheet.create({
  group: { gap: 10 },
  card: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3], padding: 14 },
  cardUnread: { borderColor: colors.primary[300] },
  cardBody: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[2] },
  title: { flex: 1 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: colors.primary[500],
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginTop: 2 },
  meta: { flexShrink: 1 },
});

/**
 * Properties list — admin + dispatcher. Figma "Objekte" (frame 11).
 *
 * Search across name/address/city, kind chips with counts, a stat strip
 * (active / new / attention, derived from realised shifts like the web
 * list) and the list in one white card. Tap a row to see the property
 * detail.
 */

import { useMemo, useState } from "react";
import { FlatList, RefreshControl, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  inferPropertyKind,
  loadMobileProperties,
  type PropertyKind,
  type PropertyRow,
  type PropertyStatus,
} from "@/lib/properties";
import {
  Avatar,
  Badge,
  CenterSpinner,
  ChipRow,
  Divider,
  EmptyState,
  FilterChip,
  Icon,
  LargeHeader,
  RoundButton,
  Screen,
  SearchField,
  Txt,
  type IconName,
  type Tone,
} from "@/components/ui";
import { colors, radius, shadow, spacing } from "@/lib/theme";
import { t } from "@/lib/i18n";

type KindFilter = PropertyKind | "all";

const KIND_ORDER: PropertyKind[] = ["office", "residential", "retail", "medical", "industrial", "other"];

const STATUS_TONE: Record<PropertyStatus, Tone> = {
  active: "success",
  onboarding: "info",
  attention: "warning",
};

/** Leading tile per kind — Alltagshilfe clients use the red brand ramp. */
function kindVisual(kind: PropertyKind, alltags: boolean): { icon: IconName; bg: string; fg: string } {
  if (alltags) return { icon: "home", bg: colors.error[50], fg: colors.error[500] };
  switch (kind) {
    case "residential":
      return { icon: "home", bg: colors.accent[100], fg: colors.primary[600] };
    case "retail":
      return { icon: "building", bg: colors.warning[50], fg: colors.warning[700] };
    case "medical":
      return { icon: "building", bg: colors.error[50], fg: colors.error[700] };
    case "industrial":
      return { icon: "briefcase", bg: colors.neutral[100], fg: colors.neutral[600] };
    default:
      return { icon: "building", bg: colors.secondary[50], fg: colors.secondary[500] };
  }
}

export default function PropertiesScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const query = useQuery({
    queryKey: ["properties", { q: q.trim() }],
    queryFn: () => loadMobileProperties({ q }),
    staleTime: 60_000,
  });

  const all = useMemo(
    () =>
      (query.data ?? []).map((r) => ({
        ...r,
        _kind: inferPropertyKind(r.name, r.client_customer_type, r.kind),
      })),
    [query.data],
  );
  const counts = useMemo(() => {
    const m = new Map<PropertyKind, number>();
    for (const r of all) m.set(r._kind, (m.get(r._kind) ?? 0) + 1);
    return m;
  }, [all]);
  const rows = kind === "all" ? all : all.filter((r) => r._kind === kind);

  const total = all.length;
  const active = all.filter((r) => r.status === "active").length;
  const fresh = all.filter(
    (r) => !!r.created_at && Date.now() - new Date(r.created_at).getTime() < 30 * 86_400_000,
  ).length;
  const attention = all.filter((r) => r.status === "attention").length;

  const header = (
    <View style={styles.stats}>
      <StatCard
        label={t("mobile.ui.properties.stats.active")}
        value={String(active)}
        sub={
          total > 0
            ? `${((active / total) * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`
            : "—"
        }
        subColor={colors.neutral[500]}
      />
      <StatCard
        label={t("mobile.ui.properties.stats.new30")}
        value={String(fresh)}
        sub={t("mobile.ui.properties.stats.new30Sub")}
        subColor={colors.success[500]}
      />
      <StatCard
        label={t("mobile.ui.properties.stats.attention")}
        value={String(attention)}
        sub={t("mobile.ui.properties.stats.attentionSub")}
        subColor={colors.error[700]}
      />
    </View>
  );

  return (
    <Screen
      scroll={false}
      header={
        <LargeHeader
          leading={
            <RoundButton
              icon="chevron-left"
              accessibilityLabel={t("clients.form.back")}
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/more"))}
            />
          }
          title={t("mobile.properties.title")}
          subtitle={
            query.data
              ? t("mobile.ui.properties.headerSummary", { total, active })
              : undefined
          }
        />
      }
      contentStyle={styles.content}
    >
      <SearchField
        value={q}
        onChangeText={setQ}
        placeholder={t("mobile.properties.searchPlaceholder")}
        autoCapitalize="none"
      />

      <ChipRow>
        <FilterChip
          label={t("mobile.clients.filter.all")}
          count={query.data ? total : undefined}
          selected={kind === "all"}
          onPress={() => setKind("all")}
        />
        {KIND_ORDER.filter((k) => (counts.get(k) ?? 0) > 0 || kind === k).map((k) => (
          <FilterChip
            key={k}
            label={t(`properties.kind.${k}`)}
            count={counts.get(k) ?? 0}
            selected={kind === k}
            onPress={() => setKind(k)}
          />
        ))}
      </ChipRow>

      {query.isLoading ? (
        <CenterSpinner />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={query.data && total > 0 ? header : null}
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.segment,
                index === 0 && styles.segmentFirst,
                index === rows.length - 1 && styles.segmentLast,
              ]}
            >
              {index > 0 ? <Divider /> : null}
              <PropertyItem
                row={item}
                kind={item._kind}
                onPress={() =>
                  router.push({
                    pathname: "/properties/[id]",
                    params: { id: item.id },
                  })
                }
              />
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
              tintColor={colors.primary[500]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="building"
              title={t("mobile.properties.emptyTitle")}
              subtitle={t("mobile.properties.emptyBody")}
            />
          }
        />
      )}
    </Screen>
  );
}

function StatCard({
  label,
  value,
  sub,
  subColor,
}: {
  label: string;
  value: string;
  sub: string;
  subColor: string;
}) {
  return (
    <View style={styles.statCard}>
      <Txt v="overline" color={colors.neutral[500]} numberOfLines={1}>
        {label}
      </Txt>
      <Txt v="title" color={colors.secondary[500]} numberOfLines={1}>
        {value}
      </Txt>
      <Txt v="caption" color={subColor} numberOfLines={1}>
        {sub}
      </Txt>
    </View>
  );
}

function PropertyItem({
  row,
  kind,
  onPress,
}: {
  row: PropertyRow;
  kind: PropertyKind;
  onPress: () => void;
}) {
  const alltags = row.client_customer_type === "alltagshilfe";
  const vis = kindVisual(kind, alltags);
  const address = [row.address_line1, [row.postal_code, row.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.neutral[50] }]}
    >
      <View style={[styles.tile, { backgroundColor: vis.bg }]}>
        <Icon name={vis.icon} size={20} color={vis.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={styles.titleLine}>
          <Txt v="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
            {row.name}
          </Txt>
          {row.status ? (
            <Badge
              label={t(`mobile.ui.properties.status.${row.status}`)}
              tone={STATUS_TONE[row.status]}
              dot={false}
            />
          ) : null}
        </View>
        <View style={styles.metaLine}>
          <Icon name="map-pin" size={14} color={colors.neutral[400]} />
          <Txt v="subhead" color={colors.neutral[500]} numberOfLines={1} style={{ flex: 1 }}>
            {address || "—"}
          </Txt>
        </View>
        <View style={styles.footLine}>
          <Txt v="subhead" color={colors.secondary[500]} numberOfLines={1} style={{ flexShrink: 1 }}>
            {row.client_name}
          </Txt>
          {row.shifts_last_7d != null ? (
            <>
              <Txt v="subhead" color={colors.neutral[300]}>
                ·
              </Txt>
              <Icon name="calendar" size={14} color={colors.neutral[400]} />
              <Txt v="subhead" color={colors.neutral[500]} numberOfLines={1}>
                {t("mobile.ui.properties.perWeek", { n: row.shifts_last_7d })}
              </Txt>
            </>
          ) : null}
          <View style={{ flex: 1 }} />
          {row.team_lead_name ? (
            <Avatar name={row.team_lead_name} size={30} />
          ) : (
            <View style={styles.unassigned} accessibilityLabel={t("properties.table.unassigned")}>
              <Icon name="user" size={14} color={colors.error[500]} />
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing[4], gap: spacing[3], paddingTop: spacing[1] },
  list: { flex: 1, marginHorizontal: -spacing[4] },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[1],
    paddingBottom: spacing[8],
  },
  stats: { flexDirection: "row", gap: spacing[2], paddingBottom: spacing[4] },
  statCard: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    padding: spacing[3],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    backgroundColor: colors.white,
    ...shadow.sm,
  },
  segment: {
    backgroundColor: colors.white,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.neutral[100],
  },
  segmentFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: "hidden",
  },
  segmentLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  titleLine: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  metaLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  footLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  unassigned: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.error[500],
    backgroundColor: colors.error[50],
    alignItems: "center",
    justifyContent: "center",
  },
});

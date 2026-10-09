/**
 * Clients tab — admin + dispatcher only. Figma "Kunden" (frame 06).
 *
 * Search + type filter (chips with counts) over the org roster, a small
 * stat strip, a client-side sort, and the list in one white card. Tap a
 * row to drill into the client detail screen. Field-staff never reach
 * this tab: it's hidden at the nav layer AND RLS would reject the
 * underlying query if they somehow did.
 */

import React, { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  loadClientTypeCounts,
  loadMobileClients,
  loadMobileClientsSummary,
  type ClientCustomerType,
  type ClientRow,
  type ClientStatus,
} from "@/lib/clients";
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
  ListRow,
  Screen,
  SearchField,
  Txt,
  toneFor,
  type Tone,
} from "@/components/ui";
import { colors, radius, shadow, spacing } from "@/lib/theme";
import { t } from "@/lib/i18n";

type TypeFilter = ClientCustomerType | "all";
type SortKey = "nameAsc" | "nameDesc" | "newest" | "properties";

const TYPE_ORDER: TypeFilter[] = ["all", "commercial", "residential", "alltagshilfe"];
const SORTS: SortKey[] = ["nameAsc", "nameDesc", "newest", "properties"];

const STATUS_TONE: Record<ClientStatus, Tone> = {
  active: "success",
  review: "warning",
  onboarding: "info",
  ended: "neutral",
};

function sortRows(rows: ClientRow[], sort: SortKey): ClientRow[] {
  const out = [...rows];
  const byName = (a: ClientRow, b: ClientRow) =>
    a.display_name.localeCompare(b.display_name, "de", { sensitivity: "base" });
  if (sort === "nameAsc") out.sort(byName);
  else if (sort === "nameDesc") out.sort((a, b) => byName(b, a));
  else if (sort === "newest")
    out.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  else out.sort((a, b) => b.property_count - a.property_count || byName(a, b));
  return out;
}

export default function ClientsTab() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortKey>("nameAsc");
  const [sortOpen, setSortOpen] = useState(false);

  const clientsQuery = useQuery({
    queryKey: ["clients", { q: q.trim(), type }],
    queryFn: () => loadMobileClients({ q, type }),
    // Cache aggressively — the roster changes rarely from the mobile
    // caller's perspective. Pull-to-refresh forces a refetch.
    staleTime: 60_000,
  });

  const countsQuery = useQuery({
    queryKey: ["client-type-counts", { q: q.trim() }],
    queryFn: () => loadClientTypeCounts({ q }),
    staleTime: 60_000,
  });

  const summaryQuery = useQuery({
    queryKey: ["clients-summary"],
    queryFn: loadMobileClientsSummary,
    staleTime: 60_000,
  });

  const rows = useMemo(
    () => sortRows(clientsQuery.data ?? [], sort),
    [clientsQuery.data, sort],
  );

  const summary = summaryQuery.data;
  const counts = countsQuery.data;

  // Fallback header line (the original roster split) if the contract
  // summary can't be loaded.
  const grouped = useMemo(() => {
    const all = clientsQuery.data ?? [];
    return {
      total: all.length,
      alltags: all.filter((r) => r.customer_type === "alltagshilfe").length,
      priya: all.filter((r) => r.customer_type !== "alltagshilfe").length,
    };
  }, [clientsQuery.data]);

  const refresh = () => {
    void clientsQuery.refetch();
    void countsQuery.refetch();
    void summaryQuery.refetch();
  };

  const header = (
    <View style={{ gap: spacing[4], paddingBottom: spacing[3] }}>
      {summary ? (
        <View style={styles.stats}>
          <StatCard
            label={t("mobile.ui.clients.stats.contracts")}
            value={String(summary.activeContracts)}
            sub={
              summary.total > 0
                ? `${((summary.activeContracts / summary.total) * 100).toLocaleString("de-DE", {
                    maximumFractionDigits: 1,
                  })} %`
                : "—"
            }
            subColor={colors.neutral[500]}
          />
          <StatCard
            label={t("mobile.ui.clients.stats.new30")}
            value={String(summary.newLast30Days)}
            sub={t("mobile.ui.clients.stats.new30Sub")}
            subColor={colors.success[500]}
          />
          <StatCard
            label={t("mobile.ui.clients.stats.ending")}
            value={String(summary.endingSoon)}
            sub={t("mobile.ui.clients.stats.endingSub")}
            subColor={colors.warning[700]}
          />
        </View>
      ) : null}

      <View style={{ gap: spacing[2] }}>
        <View style={styles.sortRow}>
          <Txt v="subheadStrong" color={colors.neutral[700]}>
            {t("mobile.ui.clients.count", { n: rows.length })}
          </Txt>
          <Pressable
            onPress={() => setSortOpen((o) => !o)}
            hitSlop={8}
            accessibilityRole="button"
            style={styles.sortBtn}
          >
            <Txt v="subheadStrong" color={colors.primary[600]}>
              {t(`mobile.ui.clients.sort.${sort}`)}
            </Txt>
            <Icon name="chevron-down" size={16} color={colors.primary[600]} />
          </Pressable>
        </View>
        {sortOpen ? (
          <View style={styles.sortMenu}>
            {SORTS.map((s, i) => (
              <View key={s}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  onPress={() => {
                    setSort(s);
                    setSortOpen(false);
                  }}
                  style={({ pressed }) => [styles.sortOption, pressed && { backgroundColor: colors.neutral[50] }]}
                >
                  <Txt v={s === sort ? "subheadStrong" : "subhead"} color={colors.neutral[800]}>
                    {t(`mobile.ui.clients.sort.${s}`)}
                  </Txt>
                  {s === sort ? <Icon name="check" size={16} color={colors.primary[600]} /> : null}
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <Screen
      scroll={false}
      header={
        <LargeHeader
          title={t("nav.clients")}
          subtitle={
            summary
              ? t("mobile.ui.clients.headerSummary", {
                  total: summary.total,
                  active: summary.activeContracts,
                })
              : summaryQuery.isError && clientsQuery.data
                ? t("mobile.clients.headerSummary", grouped)
                : undefined
          }
        />
      }
      contentStyle={styles.content}
    >
      <SearchField
        value={q}
        onChangeText={setQ}
        placeholder={t("mobile.clients.searchPlaceholder")}
        autoCapitalize="none"
        returnKeyType="search"
      />

      <ChipRow>
        {TYPE_ORDER.map((v) => (
          <FilterChip
            key={v}
            label={t(`mobile.clients.filter.${v}`)}
            count={counts ? counts[v] : undefined}
            selected={type === v}
            onPress={() => setType(v)}
          />
        ))}
      </ChipRow>

      {clientsQuery.isLoading ? (
        <CenterSpinner />
      ) : clientsQuery.error ? (
        <EmptyState
          icon="alert"
          title={t("mobile.clients.errorTitle")}
          subtitle={t("mobile.clients.errorBody")}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={header}
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.segment,
                index === 0 && styles.segmentFirst,
                index === rows.length - 1 && styles.segmentLast,
              ]}
            >
              {index > 0 ? <Divider /> : null}
              <ClientRowItem
                row={item}
                onPress={() =>
                  router.push({
                    pathname: "/clients/[id]",
                    params: { id: item.id },
                  })
                }
              />
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={clientsQuery.isFetching}
              onRefresh={refresh}
              tintColor={colors.primary[500]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="users"
              title={t("mobile.clients.emptyTitle")}
              subtitle={t("mobile.clients.emptyBody")}
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

const ClientRowItem = React.memo(function ClientRowItem({
  row,
  onPress,
}: {
  row: ClientRow;
  onPress: () => void;
}) {
  const isAlltags = row.customer_type === "alltagshilfe";
  const parts: string[] = [t(`mobile.clients.filter.${row.customer_type}`)];
  if (isAlltags && row.care_level) {
    parts.push(t("clients.detail.careLevelN", { level: row.care_level }));
  } else if (isAlltags && row.payer_type) {
    parts.push(t(`mobile.clients.payer.${row.payer_type}`));
  } else {
    parts.push(t("mobile.clients.rowProperties", { count: row.property_count }));
  }
  if (row.city) parts.push(row.city);

  const badge = row.is_new
    ? { label: t("mobile.ui.clients.status.new"), tone: "brand" as Tone }
    : row.status
      ? { label: t(`mobile.ui.clients.status.${row.status}`), tone: STATUS_TONE[row.status] }
      : null;

  return (
    <ListRow
      title={row.display_name}
      subtitle={parts.join(" · ")}
      onPress={onPress}
      leading={
        <Avatar
          name={row.display_name}
          size={40}
          tone={isAlltags ? "red" : toneFor(row.display_name)}
        />
      }
      badge={badge ? <Badge label={badge.label} tone={badge.tone} dot={false} /> : undefined}
    />
  );
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing[4], gap: spacing[3], paddingTop: spacing[1] },
  list: { flex: 1, marginHorizontal: -spacing[4] },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[1],
    paddingBottom: spacing[6],
  },
  stats: { flexDirection: "row", gap: spacing[2] },
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
  sortRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sortBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  sortMenu: {
    alignSelf: "flex-end",
    minWidth: 200,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    backgroundColor: colors.white,
    overflow: "hidden",
    ...shadow.md,
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingVertical: 12,
    paddingHorizontal: 14,
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
});

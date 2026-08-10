/**
 * Invoices list — read-only. Status filter (all/draft/sent/paid/overdue).
 * Tap for detail with line items.
 */

import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Svg, { Path } from "react-native-svg";
import {
  loadMobileInvoices,
  type InvoiceRow,
  type InvoiceStatus,
} from "@/lib/invoices";
import { Chip, EmptyState } from "@/components/ui";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

type StatusFilter = InvoiceStatus | "all";

export default function InvoicesScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("all");
  const query = useQuery({
    queryKey: ["invoices", { status }],
    queryFn: () => loadMobileInvoices({ status }),
    staleTime: 60_000,
  });

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBack}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.neutral[700]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M19 12H5M12 19l-7-7 7-7" />
          </Svg>
        </Pressable>
        <Text style={styles.headerTitle}>{t("mobile.invoices.title")}</Text>
      </View>
      <View style={styles.filterRow}>
        {(["all", "draft", "sent", "paid", "overdue"] as const).map((v) => (
          <Pressable
            key={v}
            onPress={() => setStatus(v)}
            style={[styles.pill, status === v && styles.pillActive]}
          >
            <Text style={[styles.pillText, status === v && styles.pillTextOn]}>
              {t(`mobile.invoices.filter.${v}` as never)}
            </Text>
          </Pressable>
        ))}
      </View>

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary[500]} />
        </View>
      ) : (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <Row
              row={item}
              onPress={() =>
                router.push({
                  pathname: "/invoices/[id]",
                  params: { id: item.id },
                })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: spacing[6] }}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching}
              onRefresh={() => query.refetch()}
              tintColor={colors.primary[500]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={t("mobile.invoices.emptyTitle")}
              subtitle={t("mobile.invoices.emptyBody")}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function Row({ row, onPress }: { row: InvoiceRow; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.neutral[50] },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.number} numberOfLines={1}>
          {row.invoice_number ?? "—"}
        </Text>
        <Text style={styles.client} numberOfLines={1}>
          {row.client_name}
        </Text>
        <Text style={styles.sub}>
          {row.issue_date ?? "—"}
          {row.due_date ? ` · ${t("mobile.invoices.due")} ${row.due_date}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={styles.total}>{formatEUR(row.total_cents)}</Text>
        <StatusChip status={row.status} />
      </View>
    </Pressable>
  );
}

export function StatusChip({ status }: { status: InvoiceStatus }) {
  const map: Record<
    InvoiceStatus,
    { tone: "warning" | "primary" | "error" | "neutral"; key: string }
  > = {
    draft: { tone: "neutral", key: "mobile.invoices.status.draft" },
    sent: { tone: "warning", key: "mobile.invoices.status.sent" },
    paid: { tone: "primary", key: "mobile.invoices.status.paid" },
    overdue: { tone: "error", key: "mobile.invoices.status.overdue" },
    cancelled: { tone: "neutral", key: "mobile.invoices.status.cancelled" },
  };
  const cfg = map[status];
  return <Chip label={t(cfg.key as never)} tone={cfg.tone} />;
}

export function formatEUR(cents: number): string {
  return `€ ${(cents / 100).toFixed(2)}`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  headerBack: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: typography.size.lg,
    fontWeight: "800",
    color: colors.secondary[500],
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    flexWrap: "wrap",
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  pillActive: {
    backgroundColor: colors.secondary[500],
    borderColor: colors.secondary[500],
  },
  pillText: {
    color: colors.neutral[700],
    fontSize: 12,
    fontWeight: "600",
  },
  pillTextOn: { color: colors.white },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.white,
  },
  number: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  client: {
    marginTop: 2,
    fontSize: typography.size.sm,
    color: colors.neutral[700],
  },
  sub: {
    marginTop: 2,
    fontSize: 11,
    color: colors.neutral[500],
  },
  total: {
    fontSize: typography.size.lg,
    fontWeight: "800",
    color: colors.secondary[500],
  },
  sep: { height: 1, backgroundColor: colors.neutral[100] },
});

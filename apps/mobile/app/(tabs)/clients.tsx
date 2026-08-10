/**
 * Clients tab — admin + dispatcher only.
 *
 * Search + type filter over the org roster. Tap a row to drill into
 * the client detail screen (address, insurance, properties list).
 * Field-staff never reach this tab: it's hidden at the nav layer AND
 * RLS would reject the underlying query if they somehow did.
 */

import { useMemo, useState } from "react";
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
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  loadMobileClients,
  type ClientCustomerType,
  type ClientRow,
  type ClientPayerType,
} from "@/lib/clients";
import { Chip, EmptyState, Input } from "@/components/ui";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

type TypeFilter = ClientCustomerType | "all";

export default function ClientsTab() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [type, setType] = useState<TypeFilter>("all");

  const clientsQuery = useQuery({
    queryKey: ["clients", { q: q.trim(), type }],
    queryFn: () => loadMobileClients({ q, type }),
    // Cache aggressively — the roster changes rarely from the mobile
    // caller's perspective. Pull-to-refresh forces a refetch.
    staleTime: 60_000,
  });

  const grouped = useMemo(() => {
    const rows = clientsQuery.data ?? [];
    return {
      total: rows.length,
      alltags: rows.filter((r) => r.customer_type === "alltagshilfe").length,
      priya: rows.filter((r) => r.customer_type !== "alltagshilfe").length,
    };
  }, [clientsQuery.data]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t("nav.clients")}</Text>
        <Text style={styles.sub}>
          {t("mobile.clients.headerSummary", {
            total: grouped.total,
            priya: grouped.priya,
            alltags: grouped.alltags,
          })}
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <Input
          value={q}
          onChangeText={setQ}
          placeholder={t("mobile.clients.searchPlaceholder")}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      <View style={styles.filterRow}>
        {(["all", "residential", "commercial", "alltagshilfe"] as const).map(
          (v) => (
            <Pressable
              key={v}
              onPress={() => setType(v)}
              style={[
                styles.filterPill,
                type === v && styles.filterPillActive,
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  type === v && styles.filterPillTextActive,
                ]}
              >
                {t(`mobile.clients.filter.${v}` as never)}
              </Text>
            </Pressable>
          ),
        )}
      </View>

      {clientsQuery.isLoading ? (
        <View style={styles.centerLoad}>
          <ActivityIndicator color={colors.primary[500]} />
        </View>
      ) : clientsQuery.error ? (
        <EmptyState
          title={t("mobile.clients.errorTitle")}
          subtitle={t("mobile.clients.errorBody")}
        />
      ) : (
        <FlatList
          data={clientsQuery.data ?? []}
          keyExtractor={(row) => row.id}
          renderItem={({ item }) => (
            <ClientRowItem
              row={item}
              onPress={() =>
                router.push({
                  pathname: "/clients/[id]",
                  params: { id: item.id },
                })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={{ paddingBottom: spacing[6] }}
          refreshControl={
            <RefreshControl
              refreshing={clientsQuery.isFetching}
              onRefresh={() => clientsQuery.refetch()}
              tintColor={colors.primary[500]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={t("mobile.clients.emptyTitle")}
              subtitle={t("mobile.clients.emptyBody")}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function ClientRowItem({
  row,
  onPress,
}: {
  row: ClientRow;
  onPress: () => void;
}) {
  const initials = computeInitials(row.display_name);
  const isAlltags = row.customer_type === "alltagshilfe";
  return (
    <Pressable
      onPress={onPress}
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
            backgroundColor: isAlltags
              ? colors.error[500]
              : colors.primary[500],
          },
        ]}
      >
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>
            {row.display_name}
          </Text>
          <Chip
            label={
              isAlltags
                ? t("mobile.clients.tagAlltagshilfe")
                : t("mobile.clients.tagPriya")
            }
            tone={isAlltags ? "error" : "primary"}
          />
        </View>
        <Text style={styles.rowSub} numberOfLines={1}>
          {[row.city, row.email, row.phone].filter(Boolean).join(" · ") || "—"}
        </Text>
        <View style={styles.rowMeta}>
          <PayerBadge payer={row.payer_type} />
          <Text style={styles.metaText}>
            {t("mobile.clients.rowProperties", { n: row.property_count })}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function PayerBadge({ payer }: { payer: ClientPayerType | null }) {
  if (!payer) return null;
  const map: Record<
    ClientPayerType,
    { tone: "primary" | "secondary" | "warning" | "neutral"; key: string }
  > = {
    care_fund: { tone: "primary", key: "mobile.clients.payer.care_fund" },
    insurance: { tone: "secondary", key: "mobile.clients.payer.insurance" },
    private_pay: { tone: "warning", key: "mobile.clients.payer.private_pay" },
    commercial: { tone: "neutral", key: "mobile.clients.payer.commercial" },
  };
  const cfg = map[payer];
  return <Chip label={t(cfg.key as never)} tone={cfg.tone} />;
}

function computeInitials(name: string): string {
  const parts = name.split(/\s+/).filter((p) => /^[\p{L}]/u.test(p));
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing[4], paddingTop: spacing[3] },
  title: {
    fontSize: typography.size["2xl"],
    fontWeight: "800",
    color: colors.secondary[500],
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  searchWrap: { paddingHorizontal: spacing[4], paddingTop: spacing[3] },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    flexWrap: "wrap",
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  filterPillActive: {
    backgroundColor: colors.secondary[500],
    borderColor: colors.secondary[500],
  },
  filterPillText: {
    color: colors.neutral[700],
    fontSize: 12,
    fontWeight: "600",
  },
  filterPillTextActive: { color: colors.white },
  centerLoad: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.white,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "space-between",
  },
  rowName: {
    flex: 1,
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  rowSub: {
    marginTop: 2,
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
  rowMeta: {
    marginTop: 6,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  metaText: { fontSize: 11, color: colors.neutral[500] },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.white, fontWeight: "800", fontSize: 12 },
  sep: { height: 1, backgroundColor: colors.neutral[100] },
});

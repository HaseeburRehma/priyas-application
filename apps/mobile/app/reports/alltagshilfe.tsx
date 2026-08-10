/**
 * Alltagshilfe monthly report viewer — read-only mobile version of
 * the web /reports/alltagshilfe page. Shows the same hours + visits
 * grouped by client / care fund, with month-picker (previous / next).
 *
 * The web app still runs the auto-generated report + delivery.
 * Mobile is for eyeballing the month in the field.
 */

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Svg, { Path } from "react-native-svg";
import { loadAlltagshilfeReportForMonth } from "@/lib/reports";
import { EmptyState } from "@/components/ui";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function AlltagshilfeReport() {
  const router = useRouter();
  // Default: current month
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const query = useQuery({
    queryKey: [
      "alltagshilfeReport",
      monthAnchor.toISOString().slice(0, 7),
    ],
    queryFn: () => loadAlltagshilfeReportForMonth(monthAnchor),
    staleTime: 5 * 60_000,
  });

  const prev = () =>
    setMonthAnchor(
      (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
    );
  const next = () =>
    setMonthAnchor(
      (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
    );

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
        <Text style={styles.headerTitle}>
          {t("mobile.reports.alltagshilfeTitle")}
        </Text>
      </View>

      <View style={styles.monthBar}>
        <Pressable onPress={prev} hitSlop={12} style={styles.monthNav}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.neutral[700]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </Pressable>
        <Text style={styles.monthLabel}>
          {query.data?.period_label ??
            monthAnchor.toLocaleString(undefined, {
              month: "long",
              year: "numeric",
            })}
        </Text>
        <Pressable onPress={next} hitSlop={12} style={styles.monthNav}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.neutral[700]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M9 18l6-6-6-6" />
          </Svg>
        </Pressable>
      </View>

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary[500]} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing[4], gap: 12 }}>
          <View style={styles.kpiRow}>
            <Kpi
              label={t("mobile.reports.totalHours")}
              value={
                (query.data?.total_hours ?? 0).toFixed(1) + " h"
              }
            />
            <Kpi
              label={t("mobile.reports.totalVisits")}
              value={String(query.data?.total_visits ?? 0)}
            />
            <Kpi
              label={t("mobile.reports.clientsCount")}
              value={String(query.data?.rows.length ?? 0)}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {t("mobile.reports.byClient")}
            </Text>
            {(query.data?.rows ?? []).length === 0 ? (
              <EmptyState
                title={t("mobile.reports.emptyTitle")}
                subtitle={t("mobile.reports.emptyBody")}
              />
            ) : (
              (query.data?.rows ?? []).map((r) => (
                <View key={r.client_id} style={styles.reportRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clientName} numberOfLines={1}>
                      {r.client_name}
                    </Text>
                    <Text style={styles.careFund} numberOfLines={1}>
                      {r.care_fund ?? "—"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.hours}>{r.hours.toFixed(1)} h</Text>
                    <Text style={styles.visits}>
                      {t("mobile.reports.visitsCount", { n: r.visits })}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
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
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing[3],
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  monthNav: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  kpiRow: { flexDirection: "row", gap: 8 },
  kpi: {
    flex: 1,
    backgroundColor: colors.white,
    padding: spacing[3],
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    alignItems: "flex-start",
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.secondary[500],
  },
  kpiLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: colors.neutral[500],
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    padding: spacing[4],
    gap: 6,
  },
  cardTitle: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.secondary[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  reportRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral[100],
  },
  clientName: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  careFund: {
    marginTop: 2,
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
  hours: {
    fontSize: typography.size.md,
    fontWeight: "800",
    color: colors.secondary[500],
  },
  visits: {
    marginTop: 2,
    fontSize: 11,
    color: colors.neutral[500],
  },
});

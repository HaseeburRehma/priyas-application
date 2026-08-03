/**
 * Admin/dispatcher dashboard tab — org KPIs + team utilization.
 *
 * Only rendered when the caller has `time.read_all` (managers). Tab
 * layout hides the entry for field-staff. If a field-staff user
 * navigates here directly, we redirect back to /home.
 */

import { useEffect } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Card, CenterSpinner } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { can } from "@/lib/rbac";
import {
  loadOrgKpis,
  loadTeamUtilization,
  type OrgKpis,
  type TeamMemberLoad,
} from "@/lib/dashboard";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function DashboardTab() {
  const router = useRouter();
  const { profile } = useAuth();
  const allowed = can(profile?.role ?? null, "time.read_all");

  useEffect(() => {
    if (profile && !allowed) router.replace("/(tabs)");
  }, [profile, allowed, router]);

  const { data: kpis, isLoading: kLoading, refetch: refetchKpis, isRefetching } =
    useQuery<OrgKpis>({
      queryKey: ["org-kpis"],
      queryFn: loadOrgKpis,
      enabled: allowed,
    });

  const { data: team, isLoading: tLoading, refetch: refetchTeam } =
    useQuery<TeamMemberLoad[]>({
      queryKey: ["team-util"],
      queryFn: loadTeamUtilization,
      enabled: allowed,
    });

  if (!allowed) return <CenterSpinner />;

  const eur = (cents: number) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(cents / 100);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              void refetchKpis();
              void refetchTeam();
            }}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t("dashboardTab.title")}</Text>
          <Text style={styles.sub}>{t("dashboardTab.subtitle")}</Text>
        </View>

        {kLoading && <CenterSpinner />}

        {kpis && (
          <View style={styles.kpiGrid}>
            <Kpi
              label={t("dashboardTab.activeClients")}
              value={String(kpis.activeClients)}
              tone="primary"
            />
            <Kpi
              label={t("dashboardTab.managedProperties")}
              value={String(kpis.properties)}
              tone="secondary"
            />
            <Kpi
              label={t("dashboardTab.todayShifts")}
              value={String(kpis.todayShifts)}
              sub={
                kpis.todayPendingCheckins > 0
                  ? t("dashboardTab.pendingCheckins", {
                      n: kpis.todayPendingCheckins,
                    })
                  : t("dashboardTab.allCheckedIn")
              }
              tone={kpis.todayPendingCheckins > 0 ? "warning" : "primary"}
            />
            <Kpi
              label={t("dashboardTab.openInvoices")}
              value={eur(kpis.openInvoiceCents)}
              sub={
                kpis.overdueCount > 0
                  ? t("dashboardTab.overdueCount", { n: kpis.overdueCount })
                  : t("dashboardTab.noneOverdue")
              }
              tone={kpis.overdueCount > 0 ? "error" : "primary"}
            />
          </View>
        )}

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t("dashboardTab.teamUtilTitle")}</Text>
          <Text style={styles.cardSub}>{t("dashboardTab.teamUtilSubtitle")}</Text>

          {tLoading && <CenterSpinner />}
          {!tLoading && (team ?? []).length === 0 && (
            <Text style={styles.emptyLine}>
              {t("dashboardTab.teamUtilEmpty")}
            </Text>
          )}
          {(team ?? []).map((m) => {
            const pct = Math.min(
              100,
              Math.round((m.hours_this_week / Math.max(1, m.weekly_target)) * 100),
            );
            const bar =
              pct >= 100
                ? colors.error[500]
                : pct >= 80
                  ? colors.warning[500]
                  : colors.primary[500];
            return (
              <View key={m.employee_id} style={styles.teamRow}>
                <View style={styles.teamHead}>
                  <Text style={styles.teamName} numberOfLines={1}>
                    {m.full_name}
                  </Text>
                  <Text style={styles.teamHours}>
                    {m.hours_this_week.toFixed(1)} / {m.weekly_target} h
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${pct}%`, backgroundColor: bar },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "primary" | "secondary" | "warning" | "error";
}) {
  const stripe = {
    primary: colors.primary[500],
    secondary: colors.secondary[500],
    warning: colors.warning[500],
    error: colors.error[500],
  }[tone];
  return (
    <View style={[styles.kpi, { borderTopColor: stripe }]}>
      <Text style={styles.kpiLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[4],
    gap: spacing[3],
    paddingBottom: spacing[6],
  },
  header: { gap: spacing[1] },
  title: {
    fontSize: typography.size["2xl"],
    fontWeight: "800",
    color: colors.secondary[500],
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: typography.size.md,
    color: colors.neutral[500],
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  kpi: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    borderTopWidth: 3,
    padding: spacing[4],
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.neutral[500],
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: typography.size.xl,
    fontWeight: "800",
    color: colors.secondary[500],
    letterSpacing: -0.5,
  },
  kpiSub: {
    fontSize: 11,
    color: colors.neutral[500],
    marginTop: 2,
  },
  card: { gap: spacing[2] },
  cardTitle: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  cardSub: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginBottom: spacing[2],
  },
  emptyLine: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    textAlign: "center",
    padding: spacing[4],
  },
  teamRow: {
    paddingVertical: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  teamHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  teamName: {
    flex: 1,
    fontSize: typography.size.md,
    fontWeight: "600",
    color: colors.neutral[800],
  },
  teamHours: {
    fontFamily: "Menlo",
    fontSize: typography.size.sm,
    color: colors.neutral[700],
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neutral[100],
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
});

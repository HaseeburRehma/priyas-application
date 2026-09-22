/**
 * Feature-update #15 · Weekly work-report PDF screen.
 *
 * Employees pick a week (defaults to the current one, ± buttons to
 * step through history) and tap "PDF erstellen". The report is
 * rendered to a local HTML → PDF via `expo-print`, then handed to
 * `expo-sharing` so the user can email / AirDrop / save to Files.
 *
 * The list preview above the button shows exactly what will end up
 * in the PDF, so nothing surprises the user after they share it.
 */

import { useState, useMemo } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import Svg, { Path } from "react-native-svg";
import { Button, Card, CenterSpinner, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  loadWorkReport,
  renderWeeklyReportHtml,
  weekBounds,
} from "@/lib/work-report";
import { colors, radius, spacing, typography } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

export default function WorkReportScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [exporting, setExporting] = useState(false);

  const { start, end } = useMemo(() => weekBounds(weekAnchor), [weekAnchor]);

  const employeeId = profile?.employeeId ?? null;
  const employeeName = profile?.fullName ?? "—";

  const { data, isLoading } = useQuery({
    queryKey: [
      "work-report",
      employeeId,
      start.toISOString().slice(0, 10),
    ],
    queryFn: () =>
      employeeId
        ? loadWorkReport({
            employeeId,
            employeeName,
            weekOf: weekAnchor,
          })
        : Promise.resolve(null),
    enabled: !!employeeId,
  });

  function stepWeek(delta: number) {
    const next = new Date(weekAnchor);
    next.setDate(next.getDate() + delta * 7);
    setWeekAnchor(next);
  }

  async function onExport() {
    if (!data) return;
    if (data.rows.length === 0) {
      Alert.alert(t("mobile.workReport.emptyTitle"), t("mobile.workReport.emptyBody"));
      return;
    }
    setExporting(true);
    try {
      const html = renderWeeklyReportHtml(
        data,
        {
          title: t("mobile.workReport.pdfTitle"),
          weekOf: t("mobile.workReport.weekOf"),
          employee: t("mobile.workReport.employee"),
          date: t("mobile.workReport.date"),
          time: t("mobile.workReport.time"),
          customer: t("mobile.workReport.customer"),
          property: t("mobile.workReport.property"),
          hours: t("mobile.workReport.hours"),
          total: t("mobile.workReport.total"),
          empty: t("mobile.workReport.emptyList"),
          footer: t("mobile.workReport.footer"),
        },
        i18n.locale,
      );
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: t("mobile.workReport.shareTitle"),
        });
      } else {
        Alert.alert(t("mobile.workReport.savedTitle"), uri);
      }
    } catch (err) {
      Alert.alert(
        t("mobile.workReport.errorTitle"),
        err instanceof Error ? err.message : "unknown",
      );
    } finally {
      setExporting(false);
    }
  }

  const dateFmt: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
  };
  const rangeLabel = `${start.toLocaleDateString(
    i18n.locale,
    dateFmt,
  )} – ${end.toLocaleDateString(i18n.locale, dateFmt)}`;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
      edges={["top"]}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← {t("schedule.back")}</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>{t("mobile.workReport.title")}</Text>
          <Text style={styles.sub}>{t("mobile.workReport.subtitle")}</Text>
        </View>

        {/* Week stepper */}
        <Card style={styles.card}>
          <View style={styles.stepperRow}>
            <Pressable
              onPress={() => stepWeek(-1)}
              hitSlop={8}
              style={styles.stepBtn}
              accessibilityLabel={t("mobile.workReport.prevWeek")}
            >
              <Svg
                width={20}
                height={20}
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.secondary[500]}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M15 18l-6-6 6-6" />
              </Svg>
            </Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={styles.stepLabel}>
                {t("mobile.workReport.weekOf")}
              </Text>
              <Text style={styles.stepRange}>{rangeLabel}</Text>
            </View>
            <Pressable
              onPress={() => stepWeek(1)}
              hitSlop={8}
              style={styles.stepBtn}
              accessibilityLabel={t("mobile.workReport.nextWeek")}
            >
              <Svg
                width={20}
                height={20}
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.secondary[500]}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M9 18l6-6-6-6" />
              </Svg>
            </Pressable>
          </View>
        </Card>

        {/* Preview */}
        {isLoading && <CenterSpinner />}
        {!isLoading && data && data.rows.length === 0 && (
          <EmptyState
            title={t("mobile.workReport.emptyTitle")}
            subtitle={t("mobile.workReport.emptyBody")}
          />
        )}
        {!isLoading && data && data.rows.length > 0 && (
          <Card style={styles.card}>
            {data.rows.map((r) => (
              <View key={r.shift_id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowClient}>{r.client_name}</Text>
                  <Text style={styles.rowMeta}>
                    {new Date(r.date + "T00:00:00").toLocaleDateString(
                      i18n.locale,
                      { weekday: "short", day: "2-digit", month: "short" },
                    )}
                    {" · "}
                    {r.property_name}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.rowHours,
                    r.source === "scheduled" && styles.rowHoursScheduled,
                  ]}
                >
                  {fmtHours(r.minutes_worked)}
                  {r.source === "scheduled" ? " *" : ""}
                </Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {t("mobile.workReport.total")}
              </Text>
              <Text style={styles.totalValue}>
                {fmtHours(data.total_minutes)}
              </Text>
            </View>
            <Text style={styles.footnote}>
              * {t("mobile.workReport.scheduledNote")}
            </Text>
          </Card>
        )}

        <Button
          label={t("mobile.workReport.exportPdf")}
          onPress={onExport}
          loading={exporting}
          disabled={!data || data.rows.length === 0}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[4],
    gap: spacing[3],
  },
  back: { marginBottom: spacing[1] },
  backText: {
    fontSize: typography.size.md,
    color: colors.primary[600],
    fontWeight: "600",
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
  card: { gap: spacing[1] },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  stepLabel: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  stepRange: {
    fontSize: typography.size.lg,
    fontWeight: "700",
    color: colors.secondary[500],
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
    gap: spacing[3],
  },
  rowClient: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  rowMeta: {
    marginTop: 2,
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
  rowHours: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.secondary[500],
    fontVariant: ["tabular-nums"],
  },
  rowHoursScheduled: {
    color: colors.neutral[500],
    fontStyle: "italic",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing[3],
  },
  totalLabel: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.neutral[600],
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  totalValue: {
    fontSize: typography.size.xl,
    fontWeight: "800",
    color: colors.secondary[500],
  },
  footnote: {
    marginTop: spacing[2],
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    fontStyle: "italic",
  },
});

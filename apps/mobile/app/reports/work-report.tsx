/**
 * Feature-update #15 · Weekly work-report PDF screen (Figma 25-work-report).
 *
 * Employees pick a week (defaults to the current one, ± buttons to
 * step through history). The report is rendered to HTML by
 * `renderWeeklyReportHtml`; "PDF erstellen" opens the system print /
 * save-as-PDF preview via `expo-print`, "Teilen" renders the PDF file
 * with `expo-print` and hands it to `expo-sharing` so the user can
 * email / AirDrop / save to Files.
 *
 * The list preview above the buttons shows exactly what will end up
 * in the PDF, so nothing surprises the user after they share it.
 */

import { useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { format, getISOWeek } from "date-fns";
import {
  BottomBar,
  Button,
  Card,
  CenterSpinner,
  Divider,
  EmptyState,
  NavHeader,
  Notice,
  RoundButton,
  Screen,
  Txt,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  loadWorkReport,
  renderWeeklyReportHtml,
  weekBounds,
  type WorkReportRow,
  type WorkReportSummary,
} from "@/lib/work-report";
import { colors, radius, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

export default function WorkReportScreen() {
  const { profile } = useAuth();
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);

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

  function buildHtml(summary: WorkReportSummary): string {
    return renderWeeklyReportHtml(
      summary,
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
  }

  /** "Teilen" — render the PDF file and open the share sheet. */
  async function onExport() {
    if (!data) return;
    if (data.rows.length === 0) {
      Alert.alert(t("mobile.workReport.emptyTitle"), t("mobile.workReport.emptyBody"));
      return;
    }
    setExporting(true);
    try {
      const html = buildHtml(data);
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

  /** "PDF erstellen" — same HTML, opened in the system print / PDF preview. */
  async function onPrint() {
    if (!data) return;
    if (data.rows.length === 0) {
      Alert.alert(t("mobile.workReport.emptyTitle"), t("mobile.workReport.emptyBody"));
      return;
    }
    setPrinting(true);
    try {
      await Print.printAsync({ html: buildHtml(data) });
    } catch (err) {
      Alert.alert(
        t("mobile.workReport.errorTitle"),
        err instanceof Error ? err.message : "unknown",
      );
    } finally {
      setPrinting(false);
    }
  }

  const locale = i18n.locale;
  const weekNo = getISOWeek(start);
  const rangeLabel =
    start.getMonth() === end.getMonth()
      ? `${start.toLocaleDateString(locale, { day: "numeric" })} – ${end.toLocaleDateString(locale, {
          day: "numeric",
        })} ${end.toLocaleDateString(locale, { month: "long", year: "numeric" })}`
      : `${start.toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${end.toLocaleDateString(
          locale,
          { day: "numeric", month: "short", year: "numeric" },
        )}`;

  const rows = data?.rows ?? [];
  const clientCount = useMemo(
    () => new Set(rows.map((r) => r.client_name)).size,
    [rows],
  );
  const hasRows = !!data && rows.length > 0;

  return (
    <Screen
      header={<NavHeader title={t("mobile.workReport.title")} />}
      gap={12}
      footer={
        <BottomBar>
          <View style={styles.actions}>
            <Button
              label={t("mobile.workReport.exportPdf")}
              icon="file-text"
              onPress={onPrint}
              loading={printing}
              disabled={!hasRows || exporting}
              style={{ flex: 1 }}
            />
            <Button
              label={t("mobile.ui.workReport.share")}
              icon="upload"
              variant="outline"
              onPress={onExport}
              loading={exporting}
              disabled={!hasRows || printing}
            />
          </View>
        </BottomBar>
      }
    >
      <Txt v="subhead" color={colors.neutral[500]}>
        {t("mobile.workReport.subtitle")}
      </Txt>

      {/* Week switcher */}
      <Card style={styles.weekCard}>
        <RoundButton
          icon="chevron-left"
          variant="subtle"
          size={36}
          onPress={() => stepWeek(-1)}
          accessibilityLabel={t("mobile.workReport.prevWeek")}
        />
        <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
          <Txt v="headline">{t("mobile.ui.workReport.week", { n: weekNo })}</Txt>
          <Txt v="subhead" color={colors.neutral[500]}>
            {rangeLabel}
          </Txt>
        </View>
        <RoundButton
          icon="chevron-right"
          variant="subtle"
          size={36}
          onPress={() => stepWeek(1)}
          accessibilityLabel={t("mobile.workReport.nextWeek")}
        />
      </Card>

      {/* Stats */}
      {hasRows ? (
        <View style={styles.stats}>
          <Stat label={t("mobile.workReport.total")} value={fmtHours(data.total_minutes)} />
          <Stat label={t("mobile.ui.workReport.shifts")} value={String(rows.length)} />
          <Stat label={t("mobile.reports.clientsCount")} value={String(clientCount)} />
        </View>
      ) : null}

      {/* Preview */}
      {isLoading && <CenterSpinner />}
      {!isLoading && data && rows.length === 0 && (
        <EmptyState
          icon="calendar"
          title={t("mobile.workReport.emptyTitle")}
          subtitle={t("mobile.workReport.emptyBody")}
        />
      )}
      {!isLoading && hasRows && (
        <>
          <Card padded={false}>
            {rows.map((r, i) => (
              <View key={r.shift_id}>
                {i > 0 ? <Divider /> : null}
                <DayRow row={r} />
              </View>
            ))}
          </Card>

          <View style={styles.totalBar}>
            <Txt v="overline" color={colors.white}>
              {t("mobile.ui.workReport.totalWeek", { n: weekNo })}
            </Txt>
            <Txt v="monoStrong" color={colors.white}>
              {fmtHours(data.total_minutes)}
            </Txt>
          </View>
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.stat}>
      <Txt v="overline" color={colors.neutral[500]} numberOfLines={1}>
        {label}
      </Txt>
      <Txt v="kpi" color={colors.secondary[500]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
    </Card>
  );
}

function DayRow({ row: r }: { row: WorkReportRow }) {
  const locale = i18n.locale;
  const day = new Date(r.date + "T00:00:00");
  const scheduled = r.source === "scheduled";
  const time = `${format(new Date(r.starts_at), "HH:mm")}–${format(new Date(r.ends_at), "HH:mm")}`;
  return (
    <View style={styles.dayRow}>
      <View style={styles.dayLine}>
        <View style={styles.dayCol}>
          <Txt v="subheadStrong" color={colors.secondary[500]}>
            {day.toLocaleDateString(locale, { weekday: "short" }).replace(/\.$/, "")}
          </Txt>
          <Txt v="caption" color={colors.neutral[500]}>
            {day.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}
          </Txt>
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Txt v="bodyStrong" numberOfLines={1}>
            {r.client_name}
          </Txt>
          <Txt v="subhead" color={colors.neutral[500]} numberOfLines={1}>
            {r.property_name} · {time}
          </Txt>
        </View>
        <Txt v="monoStrong" color={scheduled ? colors.warning[700] : colors.secondary[500]}>
          {fmtHours(r.minutes_worked)}
        </Txt>
      </View>
      {scheduled ? (
        <Notice tone="warning" icon="alert">
          {t("mobile.workReport.scheduledNote")}
        </Notice>
      ) : null}
    </View>
  );
}

/** Decimal hours in the app locale, e.g. de "2,0 h" / "1,25 h". */
function fmtHours(minutes: number): string {
  const h = (minutes / 60).toLocaleString(i18n.locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
  return t("mobile.ui.workReport.hoursShort", { h });
}

const styles = StyleSheet.create({
  weekCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  stats: { flexDirection: "row", gap: spacing[2] },
  stat: { flex: 1, minWidth: 0, gap: 6, paddingVertical: 12, paddingHorizontal: 12 },
  dayRow: { gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  dayLine: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  dayCol: { width: 44, alignItems: "center", gap: 1 },
  totalBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingVertical: 14,
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: colors.secondary[900],
  },
  actions: { flexDirection: "row", gap: spacing[3] },
});

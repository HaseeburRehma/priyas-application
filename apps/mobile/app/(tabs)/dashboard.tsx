/**
 * Admin/dispatcher dashboard — Figma "Start · Management" (frame 03).
 *
 * Greeting header, quick actions, 4 KPI cards with trend badges, the
 * shift chart (Tag / Woche / Monat), today's schedule, team workload and
 * recent activity. Every number comes from `src/lib/dashboard.ts`.
 *
 * Only rendered when the caller has `time.read_all` (managers). The
 * default export is self-contained: it is used both as its own route and
 * as the Start tab for admin/dispatcher users. If a field-staff user
 * navigates here directly, we redirect back to the Start tab.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  format,
  formatDistanceToNowStrict,
  getISOWeek,
  parseISO,
} from "date-fns";
import { de, enUS, ta } from "date-fns/locale";
import {
  Avatar,
  AvatarStack,
  Button,
  Card,
  CenterSpinner,
  Divider,
  Grid,
  HALF,
  Icon,
  IconChip,
  KpiCard,
  ProgressBar,
  RoundButton,
  Screen,
  SectionHeader,
  Segmented,
  Txt,
  type IconName,
  type Tone,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { can } from "@/lib/rbac";
import {
  loadOrgKpis,
  loadRecentActivity,
  loadShiftChart,
  loadTeamUtilization,
  loadTodaySchedule,
  type ActivityRow,
  type ChartPeriod,
  type OrgKpis,
  type ShiftChart,
  type TeamMemberLoad,
  type TodayShiftRow,
} from "@/lib/dashboard";
import { loadMyNotifications, type NotificationRow } from "@/lib/notifications";
import { colors, radius, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

const TODAY_ROWS = 5;
const TEAM_ROWS = 5;

function dfLocale() {
  return i18n.locale === "en" ? enUS : i18n.locale === "ta" ? ta : de;
}

const eur = (cents: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const pct1 = (n: number) =>
  `${n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

const hoursFmt = (h: number) =>
  `${h.toLocaleString("de-DE", { maximumFractionDigits: 1 })} h`;

/** "▲ 12,5 %" trend vs. a previous value; hidden when there's no baseline. */
function trendOf(curr: number, prev: number | undefined) {
  if (prev == null || prev <= 0) return undefined;
  const delta = ((curr - prev) / prev) * 100;
  const up = delta >= 0;
  return {
    label: `${up ? "▲" : "▼"} ${pct1(Math.abs(delta))}`,
    tone: (up ? "success" : "error") as Tone,
  };
}

export default function DashboardTab() {
  const router = useRouter();
  const { profile } = useAuth();
  const role = profile?.role ?? null;
  const allowed = can(role, "time.read_all");
  const [period, setPeriod] = useState<ChartPeriod>("week");

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

  const chartQuery = useQuery<ShiftChart>({
    queryKey: ["shift-chart", period],
    queryFn: () => loadShiftChart(period),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });

  const todayQuery = useQuery<TodayShiftRow[]>({
    queryKey: ["today-schedule"],
    queryFn: loadTodaySchedule,
    enabled: allowed,
  });

  const activityQuery = useQuery<ActivityRow[]>({
    queryKey: ["recent-activity"],
    queryFn: () => loadRecentActivity(5),
    enabled: allowed,
  });

  // Shares the cache with the Notifications screen (same key + loader).
  const { data: notifications } = useQuery<NotificationRow[]>({
    queryKey: ["notifications"],
    queryFn: loadMyNotifications,
    enabled: !!profile,
  });
  const hasUnread = (notifications ?? []).some((n) => !n.read_at);

  if (!allowed) return <CenterSpinner />;

  const canCreateClient = can(role, "client.create");
  const canPlanShift = can(role, "shift.create");
  const canReadInvoices = can(role, "invoice.read");

  const hour = new Date().getHours();
  const greetKey = hour < 11 ? "goodMorning" : hour < 17 ? "goodAfternoon" : "goodEvening";
  const firstName = profile?.fullName?.split(" ")[0] ?? "—";
  const todayLabel = format(
    new Date(),
    i18n.locale === "en" ? "EEE, MMMM d" : "EEE, d. MMMM",
    { locale: dfLocale() },
  );

  const onRefresh = () => {
    void refetchKpis();
    void refetchTeam();
    void chartQuery.refetch();
    void todayQuery.refetch();
    void activityQuery.refetch();
  };

  return (
    <Screen
      refreshing={isRefetching}
      onRefresh={onRefresh}
      header={
        <View style={styles.header}>
          <Avatar name={profile?.fullName} tone="navy" size={44} />
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Txt v="title" color={colors.secondary[500]} numberOfLines={1} adjustsFontSizeToFit>
              {t(`dashboard.${greetKey}`)}, {firstName} 👋
            </Txt>
            <Txt v="subhead" color={colors.neutral[500]} numberOfLines={1}>
              {t("mobile.ui.dashboard.subtitle", { date: todayLabel })}
            </Txt>
          </View>
          <RoundButton
            icon="bell"
            dot={hasUnread}
            accessibilityLabel={t("nav.notifications")}
            onPress={() => router.push("/(tabs)/notifications")}
          />
        </View>
      }
    >
      {canCreateClient || canPlanShift ? (
        <View style={styles.actions}>
          {canCreateClient ? (
            <Button
              label={t("dashboard.newCustomer")}
              icon="plus"
              size="md"
              style={{ flex: 1 }}
              onPress={() => router.push("/(tabs)/clients")}
            />
          ) : null}
          {canPlanShift ? (
            <Button
              label={t("mobile.ui.dashboard.planShift")}
              icon="calendar"
              variant="outline"
              size="md"
              style={{ flex: 1 }}
              onPress={() => router.push("/(tabs)/schedule/new")}
            />
          ) : null}
        </View>
      ) : null}

      {kLoading && <CenterSpinner />}

      {kpis && (
        <Grid>
          <KpiCard
            style={HALF}
            icon="users"
            tone="brand"
            label={t("dashboardTab.activeClients")}
            value={String(kpis.activeClients)}
            trend={trendOf(kpis.activeClients, kpis.activeClientsLastMonth)}
            sub={
              kpis.clientsAddedThisMonth != null
                ? t("mobile.ui.dashboard.kpi.addedThisMonth", { n: kpis.clientsAddedThisMonth })
                : undefined
            }
            onPress={() => router.push("/(tabs)/clients")}
          />
          <KpiCard
            style={HALF}
            icon="building"
            tone="info"
            label={t("dashboardTab.managedProperties")}
            value={String(kpis.properties)}
            trend={trendOf(kpis.properties, kpis.propertiesLastMonth)}
            sub={
              kpis.propertiesAddedThisMonth != null
                ? t("mobile.ui.dashboard.kpi.propertiesAdded", { n: kpis.propertiesAddedThisMonth })
                : undefined
            }
            onPress={() => router.push("/properties")}
          />
          <KpiCard
            style={HALF}
            icon="clock"
            tone="warning"
            label={t("dashboardTab.todayShifts")}
            value={String(kpis.todayShifts)}
            trend={{ label: t("dashboard.today"), tone: "neutral", dot: true }}
            sub={
              kpis.todayPendingCheckins > 0
                ? t("mobile.ui.dashboard.kpi.pendingCheckins", { n: kpis.todayPendingCheckins })
                : t("dashboardTab.allCheckedIn")
            }
            onPress={() => router.push("/(tabs)/schedule")}
          />
          <KpiCard
            style={HALF}
            icon="receipt"
            tone="error"
            label={t("dashboardTab.openInvoices")}
            value={eur(kpis.openInvoiceCents)}
            trend={
              kpis.overdueCount > 0
                ? {
                    label: t("dashboardTab.overdueCount", { n: kpis.overdueCount }),
                    tone: "error",
                    dot: true,
                  }
                : undefined
            }
            sub={
              kpis.openInvoiceCount != null
                ? t("mobile.ui.dashboard.kpi.awaitingPayment", { n: kpis.openInvoiceCount })
                : kpis.overdueCount > 0
                  ? t("dashboardTab.overdueCount", { n: kpis.overdueCount })
                  : t("dashboardTab.noneOverdue")
            }
            onPress={canReadInvoices ? () => router.push("/invoices") : undefined}
          />
        </Grid>
      )}

      <ChartCard
        period={period}
        onPeriod={setPeriod}
        chart={chartQuery.data}
        loading={chartQuery.isLoading}
      />

      <TodayCard
        rows={todayQuery.data}
        loading={todayQuery.isLoading}
        total={kpis?.todayShifts}
        pending={kpis?.todayPendingCheckins}
        onAll={() => router.push("/(tabs)/schedule")}
        onRow={(r) =>
          r.property_id
            ? router.push({ pathname: "/properties/[id]", params: { id: r.property_id } })
            : undefined
        }
      />

      <Card style={{ gap: spacing[4] }}>
        <SectionHeader
          title={t("dashboard.team.title")}
          subtitle={t("mobile.ui.dashboard.team.subtitle", { n: (team ?? []).length })}
          actionLabel={t("mobile.ui.dashboard.team.action")}
          onAction={() => router.push("/employees")}
        />
        {tLoading && <CenterSpinner />}
        {!tLoading && (team ?? []).length === 0 && (
          <Txt v="subhead" color={colors.neutral[500]} style={styles.emptyLine}>
            {t("dashboardTab.teamUtilEmpty")}
          </Txt>
        )}
        {[...(team ?? [])]
          .map((m) => ({
            ...m,
            pct: Math.round((m.hours_this_week / Math.max(1, m.weekly_target)) * 100),
          }))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, TEAM_ROWS)
          .map((m) => {
            const tone: Tone = m.pct >= 100 ? "error" : m.pct >= 80 ? "warning" : "brand";
            return (
              <View key={m.employee_id} style={styles.teamRow}>
                <Avatar name={m.full_name} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="subheadStrong" numberOfLines={1}>
                    {m.full_name}
                  </Txt>
                  <Txt v="caption" color={colors.neutral[500]} numberOfLines={1}>
                    {t("mobile.ui.dashboard.team.hours", {
                      h: m.hours_this_week.toLocaleString("de-DE", { maximumFractionDigits: 1 }),
                      target: m.weekly_target,
                    })}
                  </Txt>
                </View>
                <View style={styles.teamBar}>
                  <ProgressBar value={m.pct / 100} tone={tone} />
                </View>
                <Txt
                  v="mono"
                  color={m.pct >= 100 ? colors.error[700] : colors.neutral[700]}
                  style={styles.teamPct}
                >
                  {m.pct} %
                </Txt>
              </View>
            );
          })}
      </Card>

      <ActivityCard
        rows={activityQuery.data}
        loading={activityQuery.isLoading}
        onRow={(r) => {
          if (!r.record_id) return;
          const id = r.record_id;
          if (r.table === "clients") router.push({ pathname: "/clients/[id]", params: { id } });
          else if (r.table === "properties") router.push({ pathname: "/properties/[id]", params: { id } });
          else if (r.table === "employees") router.push({ pathname: "/employees/[id]", params: { id } });
          else if (r.table === "invoices" && canReadInvoices)
            router.push({ pathname: "/invoices/[id]", params: { id } });
        }}
      />
    </Screen>
  );
}

/* ------------------------------ Chart card ------------------------------ */

const CHART_HEIGHT = 128;

function ChartCard({
  period,
  onPeriod,
  chart,
  loading,
}: {
  period: ChartPeriod;
  onPeriod: (p: ChartPeriod) => void;
  chart: ShiftChart | undefined;
  loading: boolean;
}) {
  const locale = dfLocale();
  const title =
    period === "day"
      ? t("mobile.ui.dashboard.chart.titleDay")
      : period === "month"
        ? t("mobile.ui.dashboard.chart.titleMonth")
        : t("mobile.ui.dashboard.chart.titleWeek");
  const start = chart ? parseISO(chart.start) : new Date();
  const range =
    period === "day"
      ? format(start, i18n.locale === "en" ? "EEE, MMM d" : "EEE, d. MMM", { locale })
      : period === "month"
        ? format(start, "LLLL yyyy", { locale })
        : t("mobile.ui.dashboard.chart.weekShort", { n: getISOWeek(start) });

  const completedTrend = chart ? trendOf(chart.completed, chart.prevCompleted) : undefined;
  const hoursTrend = chart ? trendOf(chart.hours, chart.prevHours) : undefined;
  const rate = chart && chart.scheduled > 0 ? (chart.completed / chart.scheduled) * 100 : null;
  const max = Math.max(1, ...(chart?.buckets ?? []).map((b) => b.scheduled));

  const label = (iso: string) => {
    const d = parseISO(iso);
    if (period === "day") return format(d, "HH");
    if (period === "month") return t("mobile.ui.dashboard.chart.weekShort", { n: getISOWeek(d) });
    return format(d, "EEEEEE", { locale });
  };

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 2 }}>
        <Txt v="headline">{title}</Txt>
        <Txt v="subhead" color={colors.neutral[500]}>
          {t("dashboard.chart.subtitle", { week: range })}
        </Txt>
      </View>
      <Segmented<ChartPeriod>
        value={period}
        onChange={onPeriod}
        options={[
          { value: "day", label: t("dashboard.chart.tabDay") },
          { value: "week", label: t("dashboard.chart.tabWeek") },
          { value: "month", label: t("dashboard.chart.tabMonth") },
        ]}
      />
      {loading && !chart ? (
        <CenterSpinner />
      ) : chart ? (
        <>
          <View style={styles.chartStats}>
            <ChartStat
              label={t("dashboard.chart.completed")}
              value={String(chart.completed)}
              sub={completedTrend?.label}
              subColor={completedTrend?.tone === "error" ? colors.error[700] : colors.success[500]}
            />
            <ChartStat
              label={t("dashboard.chart.scheduled")}
              value={String(chart.scheduled)}
              sub={rate != null ? t("mobile.ui.dashboard.chart.rate", { rate: pct1(rate) }) : undefined}
              subColor={colors.neutral[500]}
            />
            <ChartStat
              label={t("mobile.ui.dashboard.chart.hours")}
              value={hoursFmt(chart.hours)}
              sub={hoursTrend?.label}
              subColor={hoursTrend?.tone === "error" ? colors.error[700] : colors.success[500]}
            />
          </View>
          <View>
            <View style={[styles.bars, { height: CHART_HEIGHT }]}>
              {chart.buckets.map((b) => {
                const h = (b.scheduled / max) * CHART_HEIGHT;
                const done = (b.completed / max) * CHART_HEIGHT;
                const body =
                  b.weekend || (b.future && b.completed === 0)
                    ? colors.accent[400]
                    : colors.primary[500];
                return (
                  <View key={b.start} style={styles.barCol}>
                    {b.scheduled > 0 ? (
                      <View style={[styles.bar, { height: Math.max(4, h) }]}>
                        <View
                          style={{
                            height: Math.min(Math.max(4, h), done),
                            backgroundColor: body,
                          }}
                        />
                      </View>
                    ) : (
                      <View style={[styles.bar, styles.barEmpty]} />
                    )}
                  </View>
                );
              })}
            </View>
            <View style={styles.barLabels}>
              {chart.buckets.map((b) => (
                <Txt
                  key={b.start}
                  v="caption"
                  color={colors.neutral[500]}
                  style={styles.barLabel}
                  numberOfLines={1}
                >
                  {label(b.start)}
                </Txt>
              ))}
            </View>
            {chart.scheduled === 0 ? (
              <Txt v="caption" color={colors.neutral[500]} style={styles.chartEmpty}>
                {t("mobile.ui.dashboard.chart.empty")}
              </Txt>
            ) : null}
          </View>
        </>
      ) : null}
    </Card>
  );
}

function ChartStat({
  label,
  value,
  sub,
  subColor,
}: {
  label: string;
  value: string;
  sub?: string;
  subColor: string;
}) {
  return (
    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
      <Txt v="overline" color={colors.neutral[500]} numberOfLines={1}>
        {label}
      </Txt>
      <Txt v="kpi" color={colors.secondary[500]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
      {sub ? (
        <Txt v="caption" color={subColor} numberOfLines={1}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}

/* ---------------------------- Today's schedule --------------------------- */

function TodayCard({
  rows,
  loading,
  total,
  pending,
  onAll,
  onRow,
}: {
  rows: TodayShiftRow[] | undefined;
  loading: boolean;
  total: number | undefined;
  pending: number | undefined;
  onAll: () => void;
  onRow: (r: TodayShiftRow) => void;
}) {
  const list = rows ?? [];
  const count = total ?? list.length;
  const open = pending ?? list.filter((r) => r.status === "scheduled").length;
  const now = Date.now();
  return (
    <Card>
      <SectionHeader
        title={t("dashboard.todaySchedule.title")}
        subtitle={t("mobile.ui.dashboard.today.subtitle", { count, pending: open })}
        actionLabel={t("mobile.ui.dashboard.all")}
        onAction={onAll}
        style={{ marginBottom: spacing[1] }}
      />
      {loading ? <CenterSpinner /> : null}
      {!loading && list.length === 0 ? (
        <Txt v="subhead" color={colors.neutral[500]} style={styles.emptyLine}>
          {t("dashboard.todaySchedule.empty")}
        </Txt>
      ) : null}
      {list.slice(0, TODAY_ROWS).map((r, i) => {
        const startMs = new Date(r.starts_at).getTime();
        const late = r.status === "scheduled" && now > startMs;
        const lateMin = Math.round((now - startMs) / 60_000);
        const durH = Math.max(0, (new Date(r.ends_at).getTime() - startMs) / 3_600_000);
        const dot =
          r.status === "completed"
            ? colors.success[500]
            : r.status === "in_progress"
              ? colors.primary[500]
              : late
                ? colors.warning[500]
                : r.status === "scheduled"
                  ? colors.secondary[500]
                  : colors.neutral[400];
        const sub = late
          ? t("mobile.ui.dashboard.today.late", { min: lateMin })
          : r.status === "in_progress"
            ? t("dashboard.todaySchedule.checkinPending")
            : [r.client_name, hoursFmt(Math.round(durH * 10) / 10)].filter(Boolean).join(" · ");
        return (
          <View key={r.id}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              onPress={() => onRow(r)}
              style={({ pressed }) => [styles.todayRow, pressed && { opacity: 0.7 }]}
            >
              <Txt v="mono" color={colors.neutral[700]} style={styles.todayTime}>
                {format(new Date(r.starts_at), "HH:mm")}
              </Txt>
              <View style={[styles.todayDot, { backgroundColor: dot }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="subheadStrong" numberOfLines={1}>
                  {r.property_name}
                </Txt>
                <Txt
                  v="caption"
                  color={late ? colors.warning[700] : colors.neutral[500]}
                  numberOfLines={1}
                >
                  {sub}
                </Txt>
              </View>
              {r.employee_name ? (
                <AvatarStack names={[r.employee_name]} size={30} />
              ) : (
                <View
                  style={styles.unassigned}
                  accessibilityLabel={t("properties.table.unassigned")}
                >
                  <Icon name="user" size={14} color={colors.error[500]} />
                </View>
              )}
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}

/* ----------------------------- Activity card ----------------------------- */

const ACTIVITY_ICON: Record<ActivityRow["kind"], { icon: IconName; tone: Tone }> = {
  create: { icon: "plus", tone: "brand" },
  checkin: { icon: "check", tone: "success" },
  invoice: { icon: "file-text", tone: "info" },
  alert: { icon: "alert", tone: "warning" },
};

/** Render `**bold**` segments from audit messages without the markers. */
function RichLine({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <Txt v="subhead" color={colors.neutral[800]}>
      {parts.map((p, i): ReactNode =>
        i % 2 === 1 ? (
          <Txt key={i} v="subheadStrong" color={colors.neutral[900]}>
            {p}
          </Txt>
        ) : (
          p
        ),
      )}
    </Txt>
  );
}

function ActivityCard({
  rows,
  loading,
  onRow,
}: {
  rows: ActivityRow[] | undefined;
  loading: boolean;
  onRow: (r: ActivityRow) => void;
}) {
  const list = rows ?? [];
  const actionLabel = (a: string) => {
    const k = a.toLowerCase();
    if (k === "create" || k === "insert") return t("mobile.ui.dashboard.activity.created");
    if (k === "update") return t("mobile.ui.dashboard.activity.updated");
    if (k === "delete") return t("mobile.ui.dashboard.activity.deleted");
    return a;
  };
  return (
    <Card style={{ gap: spacing[3] }}>
      <SectionHeader title={t("dashboard.activity.title")} />
      {loading ? <CenterSpinner /> : null}
      {!loading && list.length === 0 ? (
        <Txt v="subhead" color={colors.neutral[500]} style={styles.emptyLine}>
          {t("dashboard.activity.empty")}
        </Txt>
      ) : null}
      {list.map((r) => {
        const cfg = ACTIVITY_ICON[r.kind];
        const tableLabel = t(`dashboard.activity.table.${r.table}`, { defaultValue: r.table });
        const when = formatDistanceToNowStrict(new Date(r.created_at), {
          addSuffix: true,
          locale: dfLocale(),
        });
        const who = r.actor_name ?? r.meta;
        return (
          <Pressable
            key={r.id}
            onPress={() => onRow(r)}
            style={({ pressed }) => [styles.activityRow, pressed && { opacity: 0.7 }]}
          >
            <IconChip icon={cfg.icon} tone={cfg.tone} size={32} iconSize={16} />
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <RichLine text={r.message ?? `${tableLabel} · ${actionLabel(r.action)}`} />
              <Txt v="caption" color={colors.neutral[400]} numberOfLines={1}>
                {[when, who].filter(Boolean).join(" · ")}
              </Txt>
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  actions: { flexDirection: "row", gap: spacing[3] },
  emptyLine: { textAlign: "center", paddingVertical: spacing[3] },
  chartStats: { flexDirection: "row", gap: spacing[3] },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: {
    width: "62%",
    maxWidth: 28,
    borderTopLeftRadius: radius.xs,
    borderTopRightRadius: radius.xs,
    backgroundColor: colors.primary[100],
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barEmpty: { height: 3, backgroundColor: colors.neutral[100] },
  barLabels: { flexDirection: "row", gap: 6, marginTop: 6 },
  barLabel: { flex: 1, textAlign: "center" },
  chartEmpty: { textAlign: "center", marginTop: spacing[2] },
  todayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: spacing[3],
  },
  todayTime: { width: 44 },
  todayDot: { width: 8, height: 8, borderRadius: 4 },
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
  teamRow: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  teamBar: { width: 84 },
  teamPct: { width: 48, textAlign: "right" },
  activityRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
});

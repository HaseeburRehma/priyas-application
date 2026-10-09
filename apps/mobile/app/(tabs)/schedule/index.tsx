/**
 * Schedule tab ("Plan") — my shifts as a week strip + day agenda
 * (Figma frame 04 Plan). Tapping a shift opens the detail screen with
 * clock-in / clock-out / break controls. Management additionally gets
 * the "+" button to plan a new shift.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import {
  addDays,
  addWeeks,
  format,
  getISOWeek,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { de, enUS, ta } from "date-fns/locale";
import {
  Badge,
  Card,
  CenterSpinner,
  ChipRow,
  EmptyState,
  FilterChip,
  Icon,
  LargeHeader,
  RoundButton,
  Screen,
  type Tone,
  Txt,
  tone as toneOf,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { can } from "@/lib/rbac";
import { loadMyShifts, type ShiftRow } from "@/lib/schedule";
import { colors, radius, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

type Service = "all" | "priya" | "alltagshilfe";

export default function ScheduleTab() {
  const router = useRouter();
  const { profile } = useAuth();
  const canPlan = can(profile?.role ?? null, "shift.create");
  const { data, isLoading, refetch, isRefetching } = useQuery<ShiftRow[]>({
    queryKey: ["my-shifts", profile?.employeeId],
    queryFn: () =>
      profile?.employeeId ? loadMyShifts(profile.employeeId) : Promise.resolve([]),
    enabled: !!profile?.employeeId,
  });

  const today = startOfDay(new Date());
  const thisWeek = startOfWeek(today, { weekStartsOn: 1 });
  const [selected, setSelected] = useState<Date>(today);
  const [service, setService] = useState<Service>("all");
  const weekStart = startOfWeek(selected, { weekStartsOn: 1 });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart.getTime()]);
  const locale = dfLocale();

  // Shifts of the visible week, filtered by service line.
  const rows = data ?? [];
  const weekRows = useMemo(
    () =>
      rows.filter((s) => {
        const d = parseISO(s.starts_at);
        return d >= weekStart && d < addDays(weekStart, 7);
      }),
    [rows, weekStart.getTime()],
  );
  const counts = useMemo(
    () => ({
      all: weekRows.length,
      priya: weekRows.filter((s) => serviceOf(s) === "priya").length,
      alltagshilfe: weekRows.filter((s) => serviceOf(s) === "alltagshilfe").length,
    }),
    [weekRows],
  );
  const visible = service === "all" ? weekRows : weekRows.filter((s) => serviceOf(s) === service);
  const dayRows = visible.filter((s) => isSameDay(parseISO(s.starts_at), selected));
  const dayHours = dayRows.reduce((h, s) => h + hoursOf(s), 0);

  // The loader starts at this week's Monday — earlier weeks have no data.
  const canGoBack = weekStart > thisWeek;
  const moveWeek = (delta: number) => {
    const target = addWeeks(selected, delta);
    const ws = startOfWeek(target, { weekStartsOn: 1 });
    // Land on today when we're back in the current week.
    setSelected(ws.getTime() === thisWeek.getTime() ? today : target);
  };

  const weekEnd = addDays(weekStart, 6);
  const range = isSameMonth(weekStart, weekEnd)
    ? `${format(weekStart, i18n.locale === "de" ? "d." : "d", { locale })} – ${format(weekEnd, i18n.locale === "de" ? "d. MMMM yyyy" : "d MMMM yyyy", { locale })}`
    : `${format(weekStart, i18n.locale === "de" ? "d. MMM" : "d MMM", { locale })} – ${format(weekEnd, i18n.locale === "de" ? "d. MMM yyyy" : "d MMM yyyy", { locale })}`;

  const header = (
    <LargeHeader
      title={t("schedule.title")}
      subtitle={t("mobile.ui.plan.weekSubtitle", { week: getISOWeek(weekStart), range })}
      right={
        canPlan ? (
          <RoundButton
            icon="plus"
            variant="primary"
            size={44}
            accessibilityLabel={t("mobile.planShift.buttonLabel")}
            onPress={() => router.push("/(tabs)/schedule/new")}
          />
        ) : undefined
      }
    />
  );

  return (
    <Screen header={header} refreshing={isRefetching} onRefresh={() => refetch()}>
      {/* Week strip */}
      <Card style={styles.weekCard}>
        <View style={styles.monthRow}>
          <RoundButton
            icon="chevron-left"
            variant="subtle"
            size={32}
            accessibilityLabel={t("schedule.prevWeek")}
            onPress={canGoBack ? () => moveWeek(-1) : undefined}
            color={canGoBack ? colors.neutral[800] : colors.neutral[300]}
          />
          <Txt v="headline" style={{ flex: 1, textAlign: "center" }}>
            {format(selected, "LLLL yyyy", { locale })}
          </Txt>
          <RoundButton
            icon="chevron-right"
            variant="subtle"
            size={32}
            accessibilityLabel={t("schedule.nextWeek")}
            onPress={() => moveWeek(1)}
          />
        </View>
        <View style={styles.daysRow}>
          {days.map((d) => {
            const on = isSameDay(d, selected);
            const dot = dayDot(rows.filter((s) => isSameDay(parseISO(s.starts_at), d)), d < today);
            return (
              <Pressable
                key={d.toISOString()}
                onPress={() => setSelected(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={format(d, "PPPP", { locale })}
                style={[styles.day, on && styles.dayOn]}
              >
                <Txt v="caption" color={on ? colors.white : colors.neutral[500]}>
                  {format(d, "EEEEEE", { locale })}
                </Txt>
                <Txt v="headline" color={on ? colors.white : isToday(d) ? colors.primary[600] : colors.neutral[900]}>
                  {format(d, "d")}
                </Txt>
                <View style={[styles.dayDot, { backgroundColor: dot ? (on ? colors.white : dot) : "transparent" }]} />
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Service filter */}
      <ChipRow>
        <FilterChip
          label={t("mobile.employees.filter.all")}
          count={counts.all}
          selected={service === "all"}
          onPress={() => setService("all")}
        />
        <FilterChip
          label={t("schedule.servicePriya")}
          count={counts.priya}
          selected={service === "priya"}
          onPress={() => setService("priya")}
        />
        <FilterChip
          label={t("schedule.serviceAlltagshilfe")}
          count={counts.alltagshilfe}
          selected={service === "alltagshilfe"}
          onPress={() => setService("alltagshilfe")}
        />
      </ChipRow>

      {/* Day agenda */}
      <View style={styles.dayHead}>
        <Txt v="headline" style={{ flex: 1 }} numberOfLines={1}>
          {format(selected, i18n.locale === "de" ? "EEEE, d. MMMM" : "EEEE, d MMMM", { locale })}
        </Txt>
        {dayRows.length > 0 ? (
          <Txt v="subhead" color={colors.neutral[500]}>
            {t(dayRows.length === 1 ? "mobile.ui.plan.dayCountOne" : "mobile.ui.plan.dayCountOther", {
              count: dayRows.length,
              hours: fmtNumber(dayHours),
            })}
          </Txt>
        ) : null}
      </View>

      {isLoading ? (
        <CenterSpinner />
      ) : dayRows.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={t("schedule.emptyTitle")}
          subtitle={
            rows.length === 0
              ? t("schedule.emptyBody")
              : t("schedule.day.empty", { date: format(selected, i18n.locale === "de" ? "d. MMMM" : "d MMMM", { locale }) })
          }
        />
      ) : (
        <View style={{ gap: spacing[3] }}>
          {dayRows.map((s) => (
            <AgendaItem
              key={s.id}
              shift={s}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/schedule/[id]",
                  params: { id: s.id },
                })
              }
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function AgendaItem({ shift: s, onPress }: { shift: ShiftRow; onPress: () => void }) {
  const st = statusMeta(s.status);
  const svc = serviceOf(s);
  return (
    <View style={styles.agendaRow}>
      <View style={styles.timeCol}>
        <Txt v="monoStrong" color={colors.neutral[900]}>
          {format(parseISO(s.starts_at), "HH:mm")}
        </Txt>
        <Txt v="mono" color={colors.neutral[400]}>
          {format(parseISO(s.ends_at), "HH:mm")}
        </Txt>
      </View>
      <Card onPress={onPress} style={styles.agendaCard}>
        <View style={[styles.statusBar, { backgroundColor: toneOf(st.tone).accent }]} />
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <View style={styles.titleRow}>
            <Txt v="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
              {s.property.name}
            </Txt>
            <Badge label={st.label} tone={st.tone} />
          </View>
          <Txt v="subhead" color={colors.neutral[500]} numberOfLines={1}>
            {[s.client.name, s.property.address_line1].filter(Boolean).join(" · ")}
          </Txt>
          <View style={styles.metaRow}>
            <View style={styles.meta}>
              <Icon name="clock" size={14} color={colors.neutral[500]} />
              <Txt v="caption" color={colors.neutral[600]}>
                {fmtNumber(hoursOf(s))} h
              </Txt>
            </View>
            <View style={styles.meta}>
              <View
                style={[
                  styles.svcDot,
                  { backgroundColor: svc === "alltagshilfe" ? colors.error[500] : colors.primary[500] },
                ]}
              />
              <Txt v="caption" color={colors.neutral[600]}>
                {svc === "alltagshilfe" ? t("schedule.serviceAlltagshilfe") : t("schedule.servicePriya")}
              </Txt>
            </View>
          </View>
        </View>
      </Card>
    </View>
  );
}

/* ------------------------------- Helpers ------------------------------ */

function serviceOf(s: ShiftRow): Exclude<Service, "all"> {
  return s.client.customer_type === "alltagshilfe" ? "alltagshilfe" : "priya";
}

function hoursOf(s: ShiftRow): number {
  return Math.max(0, (parseISO(s.ends_at).getTime() - parseISO(s.starts_at).getTime()) / 3_600_000);
}

function statusMeta(s: string): { tone: Tone; label: string } {
  switch (s) {
    case "completed":
      return { tone: "success", label: t("schedule.sidebar.completed") };
    case "in_progress":
      return { tone: "warning", label: t("schedule.sidebar.running") };
    case "no_show":
      return { tone: "error", label: t("mobile.ui.shift.statusNoShow") };
    case "cancelled":
      return { tone: "neutral", label: t("schedule.list.statusCancelled") };
    case "scheduled":
      return { tone: "info", label: t("schedule.sidebar.scheduled") };
    default:
      return { tone: "neutral", label: s };
  }
}

/** Dot under a day in the week strip — null when the day has no shifts. */
function dayDot(shifts: ShiftRow[], past: boolean): string | null {
  const live = shifts.filter((s) => s.status !== "cancelled");
  if (live.length === 0) return null;
  if (live.some((s) => s.status === "no_show")) return colors.error[500];
  if (live.some((s) => s.status === "in_progress")) return colors.warning[500];
  return past || live.some((s) => s.status === "completed") ? colors.primary[500] : colors.primary[300];
}

function dfLocale() {
  return i18n.locale === "de" ? de : i18n.locale === "ta" ? ta : enUS;
}

function fmtNumber(n: number): string {
  const locale = i18n.locale === "de" ? "de-DE" : i18n.locale === "ta" ? "ta-IN" : "en-GB";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
}

const styles = StyleSheet.create({
  weekCard: { gap: spacing[3], paddingHorizontal: spacing[3] },
  monthRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  daysRow: { flexDirection: "row", justifyContent: "space-between" },
  day: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: radius.lg,
  },
  dayOn: { backgroundColor: colors.primary[500] },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  dayHead: { flexDirection: "row", alignItems: "center", gap: spacing[3], marginTop: 4 },
  agendaRow: { flexDirection: "row", gap: spacing[3] },
  timeCol: { width: 48, paddingTop: 14, gap: 2 },
  agendaCard: { flex: 1, flexDirection: "row", gap: spacing[3], padding: 14 },
  statusBar: { width: 4, borderRadius: 2, alignSelf: "stretch" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing[4], marginTop: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 5 },
  svcDot: { width: 6, height: 6, borderRadius: 3 },
});

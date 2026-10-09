/**
 * Employee detail — read-only.
 * Hero (status, role, service line, contact), week workload, shifts in
 * progress / upcoming, skills, vacation balance, notes. Every section
 * renders only when the loader returned real data for it.
 */

import { Linking, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle } from "react-native-svg";
import { differenceInMonths, format, parseISO } from "date-fns";
import { de, enUS, ta } from "date-fns/locale";
import {
  loadMobileEmployeeDetail,
  type EmployeeDetail as EmployeeDetailData,
  type EmployeeShiftBrief,
} from "@/lib/employees";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CenterSpinner,
  DateBlock,
  Divider,
  EmptyState,
  Grid,
  HALF,
  Icon,
  type IconName,
  KeyValue,
  NavHeader,
  ProgressBar,
  RoundButton,
  Screen,
  SectionHeader,
  StatTile,
  Txt,
} from "@/components/ui";
import { colors, radius, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { can } from "@/lib/rbac";
import { displayStatusBadge, displayStatusOf } from "@/components/employee-status";

const hoursFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const dayFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

function dfLocale() {
  return i18n.locale === "en" ? enUS : i18n.locale === "ta" ? ta : de;
}

export default function EmployeeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const query = useQuery({
    queryKey: ["employeeDetail", id],
    queryFn: () => loadMobileEmployeeDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  const header = (
    <NavHeader title={t("mobile.ui.employees.detailTitle")} onBack={() => router.back()} />
  );

  if (query.isLoading) {
    return (
      <Screen edges={["top", "bottom"]} header={header} scroll={false}>
        <CenterSpinner />
      </Screen>
    );
  }
  const d = query.data;
  if (!d) {
    return (
      <Screen edges={["top", "bottom"]} header={header} scroll={false}>
        <EmptyState
          icon="user"
          title={t("mobile.employees.notFoundTitle")}
          subtitle={t("mobile.employees.notFoundBody")}
        />
      </Screen>
    );
  }

  const canPlan = can(profile?.role ?? null, "shift.create");

  return (
    <Screen
      edges={["top", "bottom"]}
      header={header}
      refreshing={query.isFetching && !query.isLoading}
      onRefresh={() => query.refetch()}
    >
      <HeroCard d={d} canPlan={canPlan} onPlan={() => router.push("/(tabs)/schedule/new")} />
      {d.current_shift ? <LiveShiftCard shift={d.current_shift} /> : null}
      {d.upcoming_shifts && d.upcoming_shifts.length > 0 ? (
        <UpcomingCard shifts={d.upcoming_shifts} weekCount={d.upcoming_this_week ?? 0} />
      ) : null}
      {d.skills.length > 0 ? (
        <Card style={{ gap: spacing[3] }}>
          <SectionHeader
            title={t("employees.detail.skills.title")}
            subtitle={t("mobile.ui.employees.skillsCount", { n: d.skills.length })}
          />
          <View style={{ gap: spacing[2] }}>
            {d.skills.map((s) => (
              <View key={s} style={styles.skill}>
                <Txt v="subhead" color={colors.neutral[800]}>
                  {s}
                </Txt>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
      <VacationCard d={d} />
      {d.notes ? (
        <Card style={{ gap: spacing[2] }}>
          <SectionHeader title={t("mobile.employees.detail.notesSection")} />
          <Txt v="body" color={colors.neutral[700]}>
            {d.notes}
          </Txt>
        </Card>
      ) : null}
    </Screen>
  );
}

/* --------------------------------- Hero --------------------------------- */

function HeroCard({
  d,
  canPlan,
  onPlan,
}: {
  d: EmployeeDetailData;
  canPlan: boolean;
  onPlan: () => void;
}) {
  const onShift = !!d.current_shift;
  const status = displayStatusBadge(displayStatusOf(d));
  const since = d.hire_date ?? d.contract_start;
  const meta: Array<{ icon: IconName; text: string; onPress?: () => void }> = [];
  if (d.city) meta.push({ icon: "map-pin", text: d.city });
  if (since) {
    const date = parseISO(since);
    const months = Math.max(0, differenceInMonths(new Date(), date));
    meta.push({
      icon: "calendar",
      text: t("mobile.ui.employees.since", {
        date: format(date, "LLLL yyyy", { locale: dfLocale() }),
        years: Math.floor(months / 12),
        months: months % 12,
      }),
    });
  }
  if (d.email) meta.push({ icon: "mail", text: d.email });
  if (d.phone) meta.push({ icon: "phone", text: d.phone });

  const target = d.weekly_hours_target;
  const hours = d.hours_this_week;
  const tiles: Array<{ label: string; value: string; sub?: string; color?: string }> = [];
  if (hours != null) {
    const left = target ? target - hours : null;
    tiles.push({
      label: t("mobile.ui.employees.thisWeek"),
      value: target
        ? `${hoursFmt.format(hours)} / ${hoursFmt.format(target)} h`
        : `${hoursFmt.format(hours)} h`,
      sub:
        left == null
          ? undefined
          : left >= 0
            ? t("mobile.ui.employees.hoursLeft", { n: hoursFmt.format(left) })
            : t("mobile.ui.employees.hoursOver", { n: hoursFmt.format(-left) }),
      color: left != null && left < 0 ? colors.error[700] : undefined,
    });
  }
  if (d.shifts_last_90_days != null) {
    tiles.push({
      label: t("mobile.ui.employees.shifts"),
      value: String(d.shifts_last_90_days),
      sub: t("mobile.ui.employees.last90Days"),
    });
  }
  const vac = vacationBalance(d);
  if (vac) {
    tiles.push({
      label: t("mobile.ui.employees.vacation"),
      value: t("mobile.ui.employees.daysOf", {
        n: dayFmt.format(vac.available),
        total: dayFmt.format(vac.entitlement),
      }),
      sub: t("mobile.ui.employees.daysUsed", { n: dayFmt.format(vac.used) }),
      color: colors.warning[700],
    });
  }
  if (d.training) {
    tiles.push({
      label: t("mobile.ui.employees.training"),
      value: `${d.training.completed} / ${d.training.total}`,
      sub: d.training.next_title
        ? t("mobile.ui.employees.trainingOpen", { title: d.training.next_title })
        : t("mobile.ui.employees.trainingDone"),
      color: colors.primary[700],
    });
  }

  const phone = d.phone ? d.phone.replace(/[^\d+]/g, "") : null;

  return (
    <Card style={{ gap: spacing[4] }}>
      <View style={styles.heroTop}>
        <View>
          <Avatar name={d.full_name} size={64} rounded="lg" />
          {onShift ? <View style={styles.onlineDot} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Txt v="title" color={colors.secondary[500]} numberOfLines={2}>
            {d.full_name}
          </Txt>
          <View style={styles.badges}>
            {d.role ? (
              <Badge label={t(`mobile.employees.role.${d.role}`)} tone="info" dot={false} />
            ) : null}
            {d.service_line ? (
              <Badge
                label={t(`mobile.employees.service.${d.service_line}`)}
                tone={d.service_line === "alltagshilfe" ? "error" : "brand"}
                dot={false}
              />
            ) : null}
            {onShift ? (
              <Badge label={t("mobile.ui.employees.onShift")} tone="success" />
            ) : (
              <Badge label={status.label} tone={status.tone} />
            )}
          </View>
        </View>
      </View>

      {meta.length > 0 ? (
        <View style={{ gap: 6 }}>
          {meta.map((m) => (
            <View key={m.icon} style={styles.metaRow}>
              <Icon name={m.icon} size={16} color={colors.neutral[400]} />
              <Txt v="subhead" color={colors.neutral[600]} numberOfLines={1} style={{ flex: 1 }}>
                {m.text}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      {tiles.length > 0 ? (
        <Grid gap={spacing[2]}>
          {tiles.map((tile) => (
            <StatTile
              key={tile.label}
              label={tile.label}
              value={tile.value}
              sub={tile.sub}
              valueColor={tile.color}
              style={HALF}
            />
          ))}
        </Grid>
      ) : null}

      {phone || d.email || canPlan ? (
        <View style={styles.actions}>
          {phone ? (
            <RoundButton
              icon="phone"
              size={44}
              variant="subtle"
              accessibilityLabel={t("mobile.employees.detail.phone")}
              onPress={() => Linking.openURL(`tel:${phone}`)}
            />
          ) : null}
          {d.email ? (
            <RoundButton
              icon="mail"
              size={44}
              variant="subtle"
              accessibilityLabel={t("mobile.employees.detail.email")}
              onPress={() => Linking.openURL(`mailto:${d.email}`)}
            />
          ) : null}
          {canPlan ? (
            <Button
              label={t("mobile.ui.employees.assignShift")}
              icon="calendar"
              size="md"
              onPress={onPlan}
              style={{ flex: 1, minHeight: 44 }}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/* ----------------------------- Live shift card ---------------------------- */

function LiveShiftCard({ shift }: { shift: EmployeeShiftBrief }) {
  const start = parseISO(shift.starts_at);
  const end = parseISO(shift.ends_at);
  const total = end.getTime() - start.getTime();
  const pct = total > 0 ? Math.max(0, Math.min(1, (Date.now() - start.getTime()) / total)) : 0;
  const subline = [shift.client_name, shift.address].filter(Boolean).join(" · ");
  return (
    <View style={styles.liveCard}>
      <Badge label={t("mobile.ui.employees.onShiftNow")} tone="success" />
      <View style={{ gap: 2 }}>
        <Txt v="headline" numberOfLines={1}>
          {shift.property_name ?? shift.client_name ?? "—"}
        </Txt>
        {subline ? (
          <Txt v="subhead" color={colors.neutral[600]} numberOfLines={1}>
            {subline}
          </Txt>
        ) : null}
      </View>
      <ProgressBar value={pct} height={6} />
      <View style={styles.liveFoot}>
        <Txt v="caption" color={colors.neutral[600]}>
          {t("mobile.ui.employees.planned", {
            start: format(start, "HH:mm"),
            end: format(end, "HH:mm"),
          })}
        </Txt>
        <Txt v="caption" color={colors.neutral[600]}>
          {`${Math.round(pct * 100)} %`}
        </Txt>
      </View>
    </View>
  );
}

/* ------------------------------ Upcoming card ----------------------------- */

function UpcomingCard({ shifts, weekCount }: { shifts: EmployeeShiftBrief[]; weekCount: number }) {
  const today = new Date();
  return (
    <Card style={{ gap: spacing[2] }}>
      <SectionHeader
        title={t("employees.detail.upcomingTitle")}
        subtitle={t("mobile.ui.employees.thisWeekCount", { n: weekCount })}
      />
      <View>
        {shifts.map((s) => {
          const start = parseISO(s.starts_at);
          const end = parseISO(s.ends_at);
          const isToday = start.toDateString() === today.toDateString();
          return (
            <View key={s.id}>
              <Divider />
              <View style={styles.upRow}>
                <DateBlock
                  day={format(start, "d")}
                  month={format(start, "MMM", { locale: dfLocale() }).replace(".", "")}
                  highlight={isToday}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt v="subheadStrong" numberOfLines={1}>
                    {s.property_name ?? "—"}
                  </Txt>
                  {s.client_name ? (
                    <Txt v="caption" color={colors.neutral[500]} numberOfLines={1}>
                      {s.client_name}
                    </Txt>
                  ) : null}
                </View>
                <View style={styles.timePill}>
                  <Txt v="mono" color={colors.neutral[700]}>
                    {`${format(start, "HH:mm")}–${format(end, "HH:mm")}`}
                  </Txt>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

/* ------------------------------ Vacation card ----------------------------- */

function vacationBalance(d: EmployeeDetailData) {
  const entitlement = d.vacation_days_per_year;
  if (entitlement == null || !d.leave) return null;
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const yearStart = `${now.getFullYear()}-01-01`;
  const vac = d.leave.filter((l) => l.kind === "vacation");
  const sum = (xs: typeof vac) => xs.reduce((s, l) => s + l.days, 0);
  const thisYear = vac.filter((l) => l.start_date >= yearStart);
  const used = sum(thisYear.filter((l) => l.status === "approved" && l.start_date <= todayStr));
  const planned = sum(thisYear.filter((l) => l.status === "approved" && l.start_date > todayStr));
  const pending = sum(thisYear.filter((l) => l.status === "pending"));
  const next =
    vac
      .filter((l) => l.status === "approved" && l.end_date >= todayStr)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;
  return {
    entitlement,
    used,
    planned,
    pending,
    available: entitlement - used - planned,
    next,
    year: now.getFullYear(),
  };
}

function VacationCard({ d }: { d: EmployeeDetailData }) {
  const v = vacationBalance(d);
  if (!v) return null;
  const size = 96;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const share = v.entitlement > 0 ? Math.max(0, Math.min(1, v.available / v.entitlement)) : 0;
  const days = (n: number) => t("mobile.ui.employees.daysValue", { n: dayFmt.format(n) });
  const loc = dfLocale();
  return (
    <Card style={{ gap: spacing[3] }}>
      <SectionHeader title={t("mobile.ui.employees.vacationTitle")} />
      <View style={styles.vacRow}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={colors.neutral[100]}
              strokeWidth={stroke}
              fill={colors.tertiary[300]}
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={colors.primary[500]}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circ * share} ${circ}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </Svg>
          <View style={styles.ringCenter}>
            <Txt v="title" color={colors.secondary[500]}>
              {dayFmt.format(v.available)}
            </Txt>
            <Txt v="caption" color={colors.neutral[500]}>
              {t("mobile.ui.employees.ofTotal", { n: dayFmt.format(v.entitlement) })}
            </Txt>
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <KeyValue label={t("mobile.ui.employees.entitlement", { year: v.year })} value={days(v.entitlement)} />
          <KeyValue label={t("mobile.ui.employees.used")} value={days(v.used)} />
          <KeyValue label={t("mobile.ui.employees.plannedLeave")} value={days(v.planned)} />
          {v.pending > 0 ? (
            <KeyValue label={t("vacation.status.pending")} value={days(v.pending)} />
          ) : null}
          <KeyValue
            label={t("mobile.ui.employees.available")}
            value={days(v.available)}
            valueColor={v.available < 0 ? colors.error[700] : colors.success[700]}
          />
        </View>
      </View>
      {v.next ? (
        <View style={styles.nextLeave}>
          <Txt v="subhead" color={colors.neutral[500]}>
            {t("mobile.ui.employees.nextLeave")}
          </Txt>
          <Txt v="subheadStrong" style={{ flexShrink: 1, textAlign: "right" }}>
            {v.next.start_date === v.next.end_date
              ? format(parseISO(v.next.start_date), "d. MMM yyyy", { locale: loc })
              : `${format(parseISO(v.next.start_date), "d. MMM", { locale: loc })} – ${format(
                  parseISO(v.next.end_date),
                  "d. MMM yyyy",
                  { locale: loc },
                )}`}
          </Txt>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  onlineDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.success[500],
    borderWidth: 2,
    borderColor: colors.white,
  },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  liveCard: {
    gap: spacing[2],
    padding: spacing[4],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primary[200],
    backgroundColor: colors.primary[50],
  },
  liveFoot: { flexDirection: "row", justifyContent: "space-between" },
  upRow: { flexDirection: "row", alignItems: "center", gap: spacing[3], paddingVertical: spacing[3] },
  timePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.neutral[50],
  },
  skill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[100],
  },
  vacRow: { flexDirection: "row", alignItems: "center", gap: spacing[4] },
  ringCenter: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  nextLeave: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[50],
  },
});

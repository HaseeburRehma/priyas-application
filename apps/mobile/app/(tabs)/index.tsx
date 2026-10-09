/**
 * Home tab ("Start").
 *
 *   - admin / dispatcher → the team dashboard (org KPIs + utilisation),
 *     rendered from ./dashboard so management lands on "the business".
 *   - field staff → the personal "you" view (Figma frame 02 Start):
 *       greeting, green "Nächster Einsatz" hero, 4 KPI tiles, upcoming
 *       shifts, outstanding mandatory training, quick actions.
 *
 * Sign-out lives in the Mehr tab.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  differenceInCalendarDays,
  endOfWeek,
  format,
  isToday,
  isTomorrow,
  parseISO,
} from "date-fns";
import { de, enUS, ta } from "date-fns/locale";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CenterSpinner,
  Divider,
  EmptyState,
  Grid,
  HALF,
  Icon,
  type IconName,
  IconChip,
  KpiCard,
  RoundButton,
  Screen,
  SectionHeader,
  type Tone,
  Txt,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { loadMySelf, UPCOMING_LIMIT, type MySelfData } from "@/lib/my-self";
import { loadMyNotifications, type NotificationRow } from "@/lib/notifications";
import { colors, radius, shadow, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";
import TeamDashboard from "./dashboard";

export default function HomeTab() {
  const { profile } = useAuth();
  if (profile?.role === "admin" || profile?.role === "dispatcher") {
    return <TeamDashboard />;
  }
  return <StaffHome />;
}

type Upcoming = MySelfData["upcoming_shifts"][number];

function StaffHome() {
  const router = useRouter();
  const { profile } = useAuth();
  const now = useNow(30_000);
  const { data, isLoading, refetch, isRefetching } = useQuery<MySelfData | null>({
    queryKey: ["my-self", profile?.id],
    queryFn: loadMySelf,
    enabled: !!profile?.id,
  });
  // Shares the cache with the notifications screen — only drives the bell dot.
  const { data: notifications, refetch: refetchNotifications } = useQuery<NotificationRow[]>({
    queryKey: ["notifications"],
    queryFn: loadMyNotifications,
    enabled: !!profile?.id,
  });
  const hasUnread = (notifications ?? []).some((n) => !n.read_at);

  const hour = now.getHours();
  const greetKey = hour < 11 ? "goodMorning" : hour < 17 ? "goodAfternoon" : "goodEvening";
  const firstName = profile?.fullName?.split(" ")[0] ?? "—";

  const header = (
    <View style={styles.header}>
      <Avatar name={profile?.fullName} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="title" color={colors.secondary[500]} numberOfLines={1}>
          {t(`dashboard.${greetKey}`)}, {firstName} 👋
        </Txt>
        <Txt v="subhead" color={colors.neutral[500]} numberOfLines={1}>
          {format(now, "PPPP", { locale: dfLocale() })}
        </Txt>
      </View>
      <RoundButton
        icon="bell"
        dot={hasUnread}
        accessibilityLabel={t("nav.notifications")}
        onPress={() => router.push("/(tabs)/notifications")}
      />
    </View>
  );

  const upcoming = data?.upcoming_shifts ?? [];
  const next = upcoming[0];
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const thisWeek = upcoming.filter((s) => parseISO(s.starts_at) <= weekEnd).length;
  const thisWeekLabel =
    thisWeek >= UPCOMING_LIMIT && upcoming.length >= UPCOMING_LIMIT ? `${thisWeek}+` : String(thisWeek);
  const openTraining = data?.outstanding_mandatory ?? [];
  const vacationLeft = data ? data.vacation_total - data.vacation_used : 0;

  const openShift = (id: string) =>
    router.push({ pathname: "/(tabs)/schedule/[id]", params: { id } });

  return (
    <Screen
      header={header}
      refreshing={isRefetching}
      onRefresh={() => {
        void refetch();
        void refetchNotifications();
      }}
    >
      {isLoading && <CenterSpinner />}

      {!isLoading && !data && (
        <EmptyState
          icon="user"
          title={t("dashboard.mySelf.notLinkedTitle")}
          subtitle={t("dashboard.mySelf.notLinkedBody")}
        />
      )}

      {data && (
        <>
          {next ? <NextShiftHero shift={next} now={now} onOpen={() => openShift(next.id)} /> : null}

          <Grid>
            <KpiCard
              style={HALF}
              icon="clock"
              tone="brand"
              label={t("dashboard.mySelf.hoursWeek")}
              value={`${fmtNumber(data.hours_this_week)} h`}
              sub={t("dashboard.mySelf.hoursWeekTarget", { target: fmtNumber(data.weekly_target) })}
            />
            <KpiCard
              style={HALF}
              icon="chart"
              tone="info"
              label={t("dashboard.mySelf.hoursMonth")}
              value={`${fmtNumber(data.hours_this_month)} h`}
              sub={format(now, "LLLL yyyy", { locale: dfLocale() })}
            />
            <KpiCard
              style={HALF}
              icon="sun"
              tone="warning"
              label={t("dashboard.mySelf.vacation")}
              value={String(vacationLeft)}
              sub={t("dashboard.mySelf.vacationRemaining")}
              onPress={() => router.push("/vacation")}
            />
            <KpiCard
              style={HALF}
              icon="graduation"
              tone="error"
              label={t("dashboard.mySelf.training")}
              value={String(openTraining.length)}
              sub={
                openTraining.length === 0
                  ? t("dashboard.mySelf.trainingAllDone")
                  : t("dashboard.mySelf.mandatory")
              }
              onPress={() => router.push("/training")}
            />
          </Grid>

          {/* Upcoming shifts */}
          <View style={styles.section}>
            <SectionHeader
              title={t("dashboard.mySelf.upcomingShifts")}
              subtitle={t("mobile.ui.home.thisWeek", { count: thisWeekLabel })}
              actionLabel={`${t("dashboard.mySelf.openSchedule")} →`}
              onAction={() => router.push("/(tabs)/schedule")}
            />
            <Card padded={false}>
              {upcoming.length === 0 ? (
                <Txt v="subhead" color={colors.neutral[500]} style={styles.emptyLine}>
                  {t("dashboard.mySelf.noUpcoming")}
                </Txt>
              ) : (
                upcoming.map((s, i) => (
                  <View key={s.id}>
                    {i > 0 ? <Divider /> : null}
                    <UpcomingRow shift={s} now={now} onPress={() => openShift(s.id)} />
                  </View>
                ))
              )}
            </Card>
          </View>

          {/* Outstanding mandatory training */}
          {openTraining.length > 0 && (
            <View style={styles.section}>
              <SectionHeader
                title={t("dashboard.mySelf.trainingTitle")}
                subtitle={`${openTraining.length} ${t("dashboard.mySelf.trainingOutstanding")}`}
              />
              <Card padded={false}>
                {openTraining.map((m, i) => (
                  <View key={m.id}>
                    {i > 0 ? <Divider /> : null}
                    <View style={styles.trainingRow}>
                      <IconChip icon="graduation" tone="warning" size={44} iconSize={22} />
                      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                        <Txt v="bodyStrong" numberOfLines={2}>
                          {m.title}
                        </Txt>
                        <Txt v="caption" color={colors.neutral[500]}>
                          {t("dashboard.mySelf.mandatory")}
                        </Txt>
                      </View>
                      <Button
                        label={t("mobile.ui.home.startTraining")}
                        icon="play"
                        size="md"
                        onPress={() => router.push("/training")}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          )}

          {/* Quick actions — reach the deep flows without hunting. */}
          <View style={styles.section}>
            <SectionHeader title={t("dashboard.mySelf.quickActionsTitle")} />
            <Grid>
              <QuickTile
                icon="camera"
                tone="error"
                title={t("dashboard.mySelf.reportDamage")}
                sub={t("mobile.ui.home.damageSub")}
                onPress={() => router.push("/damage/new")}
              />
              <QuickTile
                icon="sun"
                tone="warning"
                title={t("dashboard.mySelf.requestTimeOff")}
                sub={t(
                  vacationLeft === 1
                    ? "mobile.ui.home.vacationDaysFreeOne"
                    : "mobile.ui.home.vacationDaysFreeOther",
                  { count: vacationLeft },
                )}
                onPress={() => router.push("/vacation/new")}
              />
              <QuickTile
                icon="droplet"
                tone="info"
                title={t("mobile.ui.home.supplies")}
                sub={t("mobile.ui.home.suppliesSub")}
                onPress={() => router.push("/supplies/new")}
              />
              <QuickTile
                icon="file-text"
                tone="sage"
                title={t("mobile.workReport.title")}
                sub={t("mobile.ui.home.workReportSub")}
                onPress={() => router.push("/reports/work-report")}
              />
            </Grid>
          </View>
        </>
      )}
    </Screen>
  );
}

/* ------------------------------ Hero card ----------------------------- */

function NextShiftHero({ shift: s, now, onOpen }: { shift: Upcoming; now: Date; onOpen: () => void }) {
  const start = parseISO(s.starts_at);
  const end = parseISO(s.ends_at);
  const countdown = countdownLabel(start, end, now);
  const running = s.status === "in_progress";
  const address = s.address ?? null;

  return (
    <View style={styles.hero}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="homeHero" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.primary[500]} />
            <Stop offset="1" stopColor={colors.primary[700]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#homeHero)" />
      </Svg>

      <View style={styles.heroTop}>
        <Txt v="overline" color="rgba(255,255,255,0.85)">
          {t("mobile.ui.home.nextShift")}
        </Txt>
        {countdown ? (
          <View style={styles.heroPill}>
            <Txt v="caption" color={colors.white}>
              {countdown}
            </Txt>
          </View>
        ) : null}
      </View>

      <Txt v="headline" color={colors.white} numberOfLines={2}>
        {s.client_name} · {s.property_name}
      </Txt>

      <View style={{ gap: 6 }}>
        <View style={styles.heroLine}>
          <Icon name="clock" size={16} color={colors.white} />
          <Txt v="callout" color={colors.white} numberOfLines={1} style={{ flex: 1 }}>
            {dayLabel(start, now, "long")} · {format(start, "HH:mm")} – {format(end, "HH:mm")} ·{" "}
            {fmtNumber(hoursBetween(start, end))} h
          </Txt>
        </View>
        {address ? (
          <View style={styles.heroLine}>
            <Icon name="map-pin" size={16} color={colors.white} />
            <Txt v="callout" color={colors.white} numberOfLines={1} style={{ flex: 1 }}>
              {address}
            </Txt>
          </View>
        ) : null}
      </View>

      <View style={styles.heroActions}>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          style={({ pressed }) => [styles.heroBtn, pressed && { opacity: 0.9 }]}
        >
          <Icon name={running ? "arrow-right" : "login"} size={20} color={colors.primary[700]} />
          <Txt v="bodyStrong" color={colors.primary[700]}>
            {running ? t("mobile.ui.home.openShift") : t("schedule.checkIn")}
          </Txt>
        </Pressable>
        {address ? (
          <RoundButton
            icon="navigation"
            size={50}
            color={colors.primary[600]}
            accessibilityLabel={t("mobile.ui.shift.route")}
            onPress={() => openInMaps(address)}
          />
        ) : null}
      </View>
    </View>
  );
}

/* ---------------------------- Upcoming row ---------------------------- */

function UpcomingRow({ shift: s, now, onPress }: { shift: Upcoming; now: Date; onPress: () => void }) {
  const start = parseISO(s.starts_at);
  const end = parseISO(s.ends_at);
  const alltagshilfe = s.customer_type === "alltagshilfe";
  const sub = [s.address_line1, `${fmtNumber(hoursBetween(start, end))} h`].filter(Boolean).join(" · ");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.upRow, pressed && { backgroundColor: colors.neutral[50] }]}
    >
      <View style={styles.timeCol}>
        <Txt v="monoStrong" color={colors.neutral[900]}>
          {format(start, "HH:mm")}
        </Txt>
        <Txt v="mono" color={colors.neutral[400]}>
          {format(end, "HH:mm")}
        </Txt>
      </View>
      <View
        style={[
          styles.bar,
          { backgroundColor: alltagshilfe ? colors.error[500] : colors.primary[500] },
        ]}
      />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Txt v="bodyStrong" numberOfLines={1}>
          {s.client_name} · {s.property_name}
        </Txt>
        <Txt v="subhead" color={colors.neutral[500]} numberOfLines={1}>
          {sub}
        </Txt>
      </View>
      <Badge label={dayLabel(start, now, "short")} tone="neutral" dot={false} />
    </Pressable>
  );
}

/* ----------------------------- Quick tile ----------------------------- */

function QuickTile({
  icon,
  tone,
  title,
  sub,
  onPress,
}: {
  icon: IconName;
  tone: Tone;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Card style={[HALF, styles.tile]} onPress={onPress}>
      <IconChip icon={icon} tone={tone} size={36} iconSize={18} />
      <View style={{ gap: 2 }}>
        <Txt v="subheadStrong" numberOfLines={1}>
          {title}
        </Txt>
        <Txt v="caption" color={colors.neutral[500]} numberOfLines={1}>
          {sub}
        </Txt>
      </View>
    </Card>
  );
}

/* ------------------------------- Helpers ------------------------------ */

/** Re-render every `ms` so countdowns and the greeting stay current. */
function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function dfLocale() {
  return i18n.locale === "de" ? de : i18n.locale === "ta" ? ta : enUS;
}

function fmtNumber(n: number): string {
  const locale = i18n.locale === "de" ? "de-DE" : i18n.locale === "ta" ? "ta-IN" : "en-GB";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
}

function hoursBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 3_600_000);
}

/** "in 25 min" / "in 3 h 10 min" when the shift starts within ~12 h. */
function countdownLabel(start: Date, end: Date, now: Date): string | null {
  const diffMin = Math.ceil((start.getTime() - now.getTime()) / 60_000);
  if (diffMin <= 0) return now < end ? t("mobile.ui.home.now") : null;
  if (diffMin > 12 * 60) return null;
  if (diffMin < 60) return t("mobile.ui.home.inMinutes", { n: diffMin });
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m === 0
    ? t("mobile.ui.home.inHours", { h })
    : t("mobile.ui.home.inHoursMinutes", { h, m });
}

/** Heute / Morgen / weekday — "long" adds the date for later days. */
function dayLabel(d: Date, now: Date, style: "long" | "short"): string {
  if (isToday(d)) return t("schedule.today");
  if (isTomorrow(d)) return t("mobile.ui.home.tomorrow");
  const locale = dfLocale();
  const days = differenceInCalendarDays(d, now);
  if (style === "short") {
    return days < 7 ? format(d, "EEEEEE", { locale }) : format(d, i18n.locale === "de" ? "d.M." : "d MMM", { locale });
  }
  return format(d, i18n.locale === "de" ? "EEE, d. MMM" : "EEE, d MMM", { locale });
}

function openInMaps(address: string) {
  const q = encodeURIComponent(address);
  const url = Platform.OS === "ios" ? `maps:0,0?q=${q}` : `geo:0,0?q=${q}`;
  Linking.openURL(url).catch(() => {
    void Linking.openURL(`https://maps.google.com/?q=${q}`);
  });
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
  section: { gap: spacing[3] },
  emptyLine: { textAlign: "center", paddingVertical: spacing[6], paddingHorizontal: spacing[4] },

  hero: {
    gap: spacing[3],
    padding: 18,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: colors.primary[600],
    ...shadow.md,
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing[2] },
  heroPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  heroLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroActions: { flexDirection: "row", alignItems: "center", gap: spacing[3], marginTop: 4 },
  heroBtn: {
    flex: 1,
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },

  upRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: 14,
  },
  timeCol: { width: 50, gap: 2 },
  bar: { width: 3, alignSelf: "stretch", borderRadius: 2 },

  trainingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[4],
  },
  tile: { gap: spacing[3], padding: 14 },
});

/**
 * New vacation request form — pick a kind, a date range on the month
 * calendar, optional reason (Figma 20-vacation-new). Days-count is
 * computed live with the same inclusive `dayCount` as before; the server
 * re-computes on insert so a client tampering with `days` doesn't win.
 */

import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  type Locale as DateFnsLocale,
} from "date-fns";
import { de as deLocale } from "date-fns/locale/de";
import { ta as taLocale } from "date-fns/locale/ta";
import {
  BottomBar,
  Button,
  Card,
  IconChip,
  InputField,
  NavHeader,
  Notice,
  RoundButton,
  Screen,
  Segmented,
  Txt,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  dayCount,
  formatLeavePeriod,
  loadMyVacationBalance,
  loadMyVacationRequests,
  parseLocalDate,
  submitVacationRequest,
  type LeaveKind,
  type VacationBalance,
  type VacationRow,
} from "@/lib/vacation";
import { colors, radius, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

const KINDS: LeaveKind[] = ["vacation", "sick", "unpaid"];

/** ISO-date guard (YYYY-MM-DD). The calendar always produces valid
 *  dates, but the submit-time validation is kept as before. */
function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

function dateLocale(): DateFnsLocale | undefined {
  if (i18n.locale === "de") return deLocale;
  if (i18n.locale === "ta") return taLocale;
  return undefined; // date-fns default = en-US
}

export default function NewVacationRequest() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const today = format(new Date(), "yyyy-MM-dd");
  const [kind, setKind] = useState<LeaveKind>("vacation");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [reasonFocused, setReasonFocused] = useState(false);

  // Calendar UI state — which month is shown and whether the next tap
  // sets the range start or its end.
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [picking, setPicking] = useState<"start" | "end">("start");

  const days = useMemo(
    () =>
      isValidIsoDate(startDate) && isValidIsoDate(endDate)
        ? dayCount(startDate, endDate)
        : 0,
    [startDate, endDate],
  );

  // Same cache entry as the list screen — used to grey out days that
  // already have an open/approved request.
  const { data: existing } = useQuery<VacationRow[]>({
    queryKey: ["my-vacation", profile?.employeeId],
    queryFn: () =>
      profile?.employeeId
        ? loadMyVacationRequests(profile.employeeId)
        : Promise.resolve([]),
    enabled: !!profile?.employeeId,
  });

  const { data: balance } = useQuery<VacationBalance | null>({
    queryKey: ["vacation-balance", profile?.employeeId],
    queryFn: () =>
      profile?.employeeId
        ? loadMyVacationBalance(profile.employeeId)
        : Promise.resolve(null),
    enabled: !!profile?.employeeId,
  });

  const requestedDays = useMemo(() => {
    const set = new Set<string>();
    for (const r of existing ?? []) {
      if (r.status !== "pending" && r.status !== "approved" && r.status !== "suggested") continue;
      let d = parseLocalDate(r.start_date);
      const end = parseLocalDate(r.end_date);
      for (let i = 0; i < 400 && d <= end; i++) {
        set.add(format(d, "yyyy-MM-dd"));
        d = addDays(d, 1);
      }
    }
    return set;
  }, [existing]);

  function onPickDay(iso: string) {
    if (picking === "start" || iso < startDate) {
      setStartDate(iso);
      setEndDate(iso);
      setPicking("end");
    } else {
      setEndDate(iso);
      setPicking("start");
    }
  }

  async function onSubmit() {
    if (!profile?.employeeId || !profile.orgId) {
      Alert.alert(t("vacation.notLinkedTitle"), t("vacation.notLinkedBody"));
      return;
    }
    if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
      Alert.alert(t("vacation.invalidDateTitle"), t("vacation.invalidDateBody"));
      return;
    }
    if (days <= 0) {
      Alert.alert(t("vacation.invalidRangeTitle"), t("vacation.invalidRangeBody"));
      return;
    }

    setPending(true);
    const r = await submitVacationRequest({
      employeeId: profile.employeeId,
      orgId: profile.orgId,
      kind,
      startDate,
      endDate,
      reason: reason.trim() || null,
    });
    setPending(false);

    if (!r.ok) {
      Alert.alert(t("vacation.submitFailed"), r.error);
      return;
    }
    // Invalidate the list query so it refetches with the new row.
    await qc.invalidateQueries({ queryKey: ["my-vacation"] });
    router.back();
  }

  const daysText = `${days} ${days === 1 ? t("vacation.day") : t("vacation.days")}`;
  const remaining =
    kind === "vacation" && balance ? Math.max(0, balance.free - days) : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.tertiary[200] }}
    >
      <Screen
        header={<NavHeader title={t("vacation.form.title")} />}
        footer={
          <BottomBar>
            <Button
              label={t("vacation.form.submit")}
              icon="send"
              onPress={onSubmit}
              loading={pending}
              disabled={days <= 0}
            />
          </BottomBar>
        }
      >
        <Segmented
          options={KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
          value={kind}
          onChange={setKind}
        />

        <MonthCalendar
          month={month}
          onMonth={setMonth}
          startDate={startDate}
          endDate={endDate}
          requested={requestedDays}
          onPick={onPickDay}
        />

        {/* Summary */}
        <View style={styles.summary}>
          <IconChip icon="calendar" tone="brand" size={40} iconSize={20} bg={colors.white} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="headline">
              {isValidIsoDate(startDate) && isValidIsoDate(endDate)
                ? formatLeavePeriod(startDate, endDate, i18n.locale, true)
                : "—"}
            </Txt>
            <Txt v="caption" color={colors.primary[700]}>
              {daysText}
              {remaining !== null
                ? ` · ${t("mobile.ui.vacation.remainingAfter", { n: remaining })}`
                : ""}
            </Txt>
          </View>
        </View>

        <InputField
          label={t("vacation.reasonLabel")}
          icon="edit"
          value={reason}
          onChangeText={setReason}
          placeholder={t("vacation.reasonPlaceholder")}
          focused={reasonFocused}
          onFocus={() => setReasonFocused(true)}
          onBlur={() => setReasonFocused(false)}
          returnKeyType="done"
        />

        <Notice tone="info" icon="bell">
          {t("mobile.ui.vacation.notice")}
        </Notice>
      </Screen>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------ Calendar ------------------------------- */

function MonthCalendar({
  month,
  onMonth,
  startDate,
  endDate,
  requested,
  onPick,
}: {
  month: Date;
  onMonth: (d: Date) => void;
  startDate: string;
  endDate: string;
  requested: Set<string>;
  onPick: (iso: string) => void;
}) {
  const locale = dateLocale();
  const weeks = useMemo(() => {
    const all = eachDayOfInterval({
      start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
    });
    const out: Date[][] = [];
    for (let i = 0; i < all.length; i += 7) out.push(all.slice(i, i + 7));
    return out;
  }, [month]);
  const weekdayHeads = weeks[0] ?? [];
  const hasRange = startDate !== endDate;

  return (
    <Card style={{ gap: 6, paddingHorizontal: 12, paddingVertical: 14 }}>
      <View style={styles.calHead}>
        <RoundButton
          icon="chevron-left"
          variant="subtle"
          size={32}
          onPress={() => onMonth(addMonths(month, -1))}
          accessibilityLabel={t("mobile.ui.vacation.prevMonth")}
        />
        <Txt v="headline" style={{ flex: 1, textAlign: "center" }}>
          {format(month, "LLLL yyyy", { locale })}
        </Txt>
        <RoundButton
          icon="chevron-right"
          variant="subtle"
          size={32}
          onPress={() => onMonth(addMonths(month, 1))}
          accessibilityLabel={t("mobile.ui.vacation.nextMonth")}
        />
      </View>

      <View style={styles.weekRow}>
        {weekdayHeads.map((d) => (
          <View key={d.toISOString()} style={styles.headCell}>
            <Txt v="caption" color={colors.neutral[500]}>
              {format(d, "EEEEEE", { locale })}
            </Txt>
          </View>
        ))}
      </View>

      {weeks.map((week) => (
        <View key={week[0]?.toISOString()} style={styles.weekRow}>
          {week.map((day) => {
            if (!isSameMonth(day, month)) {
              return <View key={day.toISOString()} style={styles.cell} />;
            }
            const iso = format(day, "yyyy-MM-dd");
            const isStart = iso === startDate;
            const isEnd = iso === endDate;
            const isEdge = isStart || isEnd;
            const inRange = iso > startDate && iso < endDate;
            const weekend = day.getDay() === 0 || day.getDay() === 6;
            const taken = requested.has(iso) && !isEdge && !inRange;
            const fg = isEdge
              ? colors.white
              : inRange
                ? colors.primary[700]
                : taken
                  ? colors.neutral[300]
                  : weekend
                    ? colors.neutral[400]
                    : colors.neutral[900];
            return (
              <Pressable
                key={iso}
                onPress={() => onPick(iso)}
                style={styles.cell}
                accessibilityRole="button"
                accessibilityLabel={format(day, "PPPP", { locale })}
                accessibilityState={{ selected: isEdge || inRange }}
              >
                {inRange ? <View style={[styles.band, { left: 0, right: 0 }]} /> : null}
                {hasRange && isStart ? <View style={[styles.band, { left: "50%", right: 0 }]} /> : null}
                {hasRange && isEnd ? <View style={[styles.band, { left: 0, right: "50%" }]} /> : null}
                <View style={[styles.dayDot, isEdge && styles.dayDotOn]}>
                  <Txt
                    v={isEdge || inRange ? "bodyStrong" : "body"}
                    color={fg}
                    style={taken ? { textDecorationLine: "line-through" } : undefined}
                  >
                    {format(day, "d")}
                  </Txt>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.calLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary[500] }]} />
          <Txt v="caption" color={colors.neutral[500]}>
            {t("mobile.ui.vacation.calendarSelected")}
          </Txt>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.neutral[300] }]} />
          <Txt v="caption" color={colors.neutral[500]}>
            {t("mobile.ui.vacation.calendarRequested")}
          </Txt>
        </View>
      </View>
    </Card>
  );
}

function kindLabel(k: LeaveKind): string {
  if (k === "vacation") return t("vacation.table.kindVacation");
  if (k === "sick") return t("vacation.table.kindSick");
  return t("vacation.kind.unpaid");
}

const CELL = 40;

const styles = StyleSheet.create({
  calHead: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginBottom: 4 },
  weekRow: { flexDirection: "row" },
  headCell: { flex: 1, alignItems: "center", paddingVertical: 4 },
  cell: { flex: 1, height: CELL + 4, alignItems: "center", justifyContent: "center" },
  band: {
    position: "absolute",
    top: 2,
    bottom: 2,
    backgroundColor: colors.primary[50],
  },
  dayDot: {
    width: CELL,
    height: CELL,
    borderRadius: CELL / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dayDotOn: { backgroundColor: colors.primary[500] },
  calLegend: { flexDirection: "row", gap: spacing[4], paddingTop: 6, paddingHorizontal: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary[100],
    backgroundColor: colors.primary[50],
  },
});

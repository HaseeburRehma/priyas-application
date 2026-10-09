/**
 * Shift detail — clock-in / clock-out / break controls with GPS
 * verification. This is the single most important field-staff flow.
 *
 * State machine (matches the web app's server actions):
 *   [scheduled] → check_in → [in_progress]
 *              → break_start → break_end (repeatable)
 *              → check_out → [completed]
 *
 * GPS: at check-in and check-out we sample expo-location and compare
 * to the property's lat/lng. Distance > 500m surfaces a warning but
 * doesn't block — the row is stamped with the observed coordinates
 * so managers can audit later.
 *
 * Layout follows Figma frame 05 (Einsatz): status + title, address card
 * with a "Route" hand-off to the native maps app (no map SDK), the
 * "Zeiterfassung" card, details, notes.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { format, parseISO } from "date-fns";
import { de, enUS, ta } from "date-fns/locale";
import {
  Badge,
  Button,
  Card,
  CenterSpinner,
  Divider,
  GroupLabel,
  Icon,
  KeyValue,
  NavHeader,
  Notice,
  Screen,
  type Tone,
  Txt,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  distanceMeters,
  insertTimeEntry,
  loadMyShifts,
  loadShiftEntries,
  type TimeEntry,
} from "@/lib/schedule";
import { colors, radius, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

export default function ShiftDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);

  const { data: shifts } = useQuery({
    queryKey: ["my-shifts", profile?.employeeId],
    queryFn: () =>
      profile?.employeeId
        ? loadMyShifts(profile.employeeId)
        : Promise.resolve([]),
    enabled: !!profile?.employeeId,
  });
  const shift = shifts?.find((s) => s.id === id);

  const { data: entries } = useQuery<TimeEntry[]>({
    queryKey: ["shift-entries", id, profile?.employeeId],
    queryFn: () =>
      profile?.employeeId && id
        ? loadShiftEntries(id, profile.employeeId)
        : Promise.resolve([]),
    enabled: !!id && !!profile?.employeeId,
  });

  const state = deriveState(entries ?? []);
  const ticking = state.stage === "working" || state.stage === "on_break";
  const now = useTick(ticking);

  const runAction = useCallback(
    async (kind: TimeEntry["kind"]) => {
      if (!profile?.employeeId || !id) return;
      setPending(true);
      try {
        // GPS sample only for check-in and check-out. Break start/end
        // don't need it — they only prove the clock is running.
        let lat: number | null = null;
        let lng: number | null = null;
        let accuracy: number | null = null;
        let distance: number | null = null;
        if (kind === "check_in" || kind === "check_out") {
          const perm = await Location.requestForegroundPermissionsAsync();
          if (perm.status !== "granted") {
            Alert.alert(t("schedule.gpsPermTitle"), t("schedule.gpsPermBody"));
          } else {
            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
            accuracy = pos.coords.accuracy ?? null;
            distance =
              shift?.property.lat != null && shift?.property.lng != null
                ? distanceMeters({ lat, lng }, { lat: shift.property.lat, lng: shift.property.lng })
                : null;
            if (distance != null && distance > 500) {
              const proceed = await confirm(
                t("schedule.farFromSiteTitle"),
                t("schedule.farFromSiteBody"),
              );
              if (!proceed) {
                setPending(false);
                return;
              }
            }
          }
        }

        const r = await insertTimeEntry({
          shiftId: id,
          employeeId: profile.employeeId,
          kind,
          lat,
          lng,
          accuracy,
          distance,
        });
        if (!r.ok) {
          Alert.alert(t("schedule.actionFailed"), r.error);
          return;
        }
        await qc.invalidateQueries({ queryKey: ["shift-entries", id] });
        await qc.invalidateQueries({ queryKey: ["my-shifts"] });
        await qc.invalidateQueries({ queryKey: ["my-self"] });
      } finally {
        setPending(false);
      }
    },
    [profile?.employeeId, id, shift, qc],
  );

  const header = <NavHeader title={t("mobile.ui.shift.title")} />;

  if (!shift || !entries) {
    return (
      <Screen header={header} scroll={false}>
        <CenterSpinner />
      </Screen>
    );
  }

  const locale = dfLocale();
  const start = parseISO(shift.starts_at);
  const end = parseISO(shift.ends_at);
  const st = statusMeta(shift.status);
  const area = [shift.property.building_section, shift.property.floor]
    .map((x) => x?.trim())
    .filter(Boolean)
    .join(" · ");

  // Live timer (check-in → now / check-out) and current break length.
  const inEntry = entries.find((e) => e.kind === "check_in");
  const outEntry = entries.find((e) => e.kind === "check_out");
  const elapsedMs = inEntry
    ? (outEntry ? parseISO(outEntry.occurred_at) : now).getTime() - parseISO(inEntry.occurred_at).getTime()
    : 0;
  const lastBreakStart = [...entries].reverse().find((e) => e.kind === "break_start");
  const breakMs =
    state.stage === "on_break" && lastBreakStart
      ? now.getTime() - parseISO(lastBreakStart.occurred_at).getTime()
      : 0;

  // Distance recorded at check-in (only when both fixes exist).
  const checkInDistance =
    inEntry?.lat != null && inEntry?.lng != null && shift.property.lat != null && shift.property.lng != null
      ? distanceMeters(
          { lat: inEntry.lat, lng: inEntry.lng },
          { lat: shift.property.lat, lng: shift.property.lng },
        )
      : null;

  return (
    <Screen header={header}>
      {/* Title block */}
      <View style={{ gap: 6 }}>
        <Badge label={st.label} tone={st.tone} />
        <Txt v="title" color={colors.secondary[500]}>
          {shift.property.name}
        </Txt>
        <Txt v="subhead" color={colors.neutral[500]}>
          {format(start, i18n.locale === "de" ? "EEEE, d. MMMM" : "EEEE, d MMMM", { locale })} ·{" "}
          {format(start, "HH:mm")} – {format(end, "HH:mm")}
        </Txt>
      </View>

      {/* Address + route hand-off */}
      {shift.property.address ? (
        <Card padded={false}>
          <View style={styles.addressRow}>
            <Icon name="map-pin" size={20} color={colors.neutral[500]} />
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Txt v="bodyStrong" numberOfLines={2}>
                {shift.property.address}
              </Txt>
              <Txt v="caption" color={colors.neutral[500]} numberOfLines={1}>
                {area || shift.client.name}
              </Txt>
            </View>
            <Pressable
              onPress={() => openInMaps(shift.property.address!)}
              hitSlop={10}
              accessibilityRole="button"
            >
              <Txt v="subheadStrong" color={colors.primary[600]}>
                {t("mobile.ui.shift.route")}
              </Txt>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {/* Time tracking */}
      <Card style={{ gap: spacing[3] }}>
        <View style={styles.cardHead}>
          <Txt v="headline" style={{ flex: 1 }}>
            {t("mobile.ui.shift.timeTracking")}
          </Txt>
          <Txt
            v="monoStrong"
            color={
              state.stage === "done"
                ? colors.success[700]
                : ticking
                  ? colors.secondary[500]
                  : colors.neutral[400]
            }
          >
            {fmtClock(elapsedMs)}
          </Txt>
        </View>

        {checkInDistance != null ? (
          <Notice tone={checkInDistance > 500 ? "warning" : "success"} icon="navigation">
            {t("mobile.ui.shift.checkInDistance", { distance: fmtDistance(checkInDistance) })}
          </Notice>
        ) : state.stage === "before" ? (
          <Notice tone="info" icon="navigation">
            {t("mobile.ui.shift.gpsHint")}
          </Notice>
        ) : null}

        {state.stage === "before" && (
          <>
            <Button
              label={t("schedule.checkIn")}
              icon="login"
              onPress={() => runAction("check_in")}
              loading={pending}
            />
            <View style={styles.btnRow}>
              <Button
                label={t("schedule.breakStart")}
                icon="coffee"
                variant="outline"
                size="md"
                disabled
                onPress={() => {}}
                style={{ flex: 1 }}
              />
              <Button
                label={t("schedule.checkOut")}
                icon="logout"
                variant="outline"
                size="md"
                disabled
                onPress={() => {}}
                style={{ flex: 1 }}
              />
            </View>
            <Txt v="caption" color={colors.neutral[500]}>
              {t("mobile.ui.shift.actionsHint")}
            </Txt>
          </>
        )}

        {state.stage === "working" && (
          <View style={styles.btnRow}>
            <Button
              label={t("schedule.breakStart")}
              icon="coffee"
              variant="outline"
              onPress={() => runAction("break_start")}
              loading={pending}
              style={{ flex: 1 }}
            />
            <Button
              label={t("schedule.checkOut")}
              icon="logout"
              onPress={() => runAction("check_out")}
              loading={pending}
              style={{ flex: 1 }}
            />
          </View>
        )}

        {state.stage === "on_break" && (
          <>
            <Notice tone="warning" icon="coffee">
              {t("schedule.break.onBreakWithTimer", { elapsed: fmtClock(breakMs) })}
            </Notice>
            <Button
              label={t("schedule.breakEnd")}
              icon="play"
              onPress={() => runAction("break_end")}
              loading={pending}
            />
          </>
        )}

        {state.stage === "done" && (
          <Notice tone="success" icon="check">
            <Txt v="subheadStrong" color={colors.success[700]}>
              {t("schedule.completedText", {
                hours: state.workedHours.toFixed(1),
              })}
            </Txt>
          </Notice>
        )}
      </Card>

      {/* Clock log */}
      {entries.length > 0 && (
        <Card style={{ gap: spacing[1] }}>
          <Txt v="headline" style={{ marginBottom: spacing[1] }}>
            {t("schedule.log")}
          </Txt>
          {entries.map((e, i) => (
            <View key={e.id}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.logRow}>
                <View style={[styles.logDot, { backgroundColor: dotColor(e.kind) }]} />
                <Txt v="body" style={{ flex: 1 }}>
                  {t(`schedule.entry.${e.kind}`)}
                </Txt>
                <Txt v="mono" color={colors.neutral[500]}>
                  {format(parseISO(e.occurred_at), "HH:mm:ss")}
                </Txt>
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Details */}
      <Card style={{ paddingVertical: spacing[1] }}>
        <KeyValue label={t("schedule.panel.client")} value={shift.client.name} valueColor={colors.primary[700]} />
        <Divider />
        <KeyValue label={t("schedule.dialog.property")} value={shift.property.name} />
        {area ? (
          <>
            <Divider />
            <KeyValue label={t("mobile.ui.shift.area")} value={area} />
          </>
        ) : null}
        <Divider />
        <KeyValue label={t("schedule.panel.duration")} value={fmtDuration(end.getTime() - start.getTime())} />
      </Card>

      {/* Notes */}
      {shift.notes?.trim() ? (
        <Card style={{ gap: spacing[3] }}>
          <GroupLabel>{t("schedule.panel.notes")}</GroupLabel>
          <View style={styles.noteBox}>
            <Txt v="subhead" color={colors.neutral[700]}>
              {shift.notes.trim()}
            </Txt>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

type Stage = "before" | "working" | "on_break" | "done";
function deriveState(entries: TimeEntry[]): {
  stage: Stage;
  workedHours: number;
} {
  const inEntry = entries.find((e) => e.kind === "check_in");
  const outEntry = entries.find((e) => e.kind === "check_out");
  const openBreak =
    entries.filter((e) => e.kind === "break_start").length >
    entries.filter((e) => e.kind === "break_end").length;
  let workedHours = 0;
  if (inEntry && outEntry) {
    workedHours = Math.max(
      0,
      (new Date(outEntry.occurred_at).getTime() -
        new Date(inEntry.occurred_at).getTime()) /
        3_600_000,
    );
  }
  const stage: Stage = !inEntry
    ? "before"
    : outEntry
      ? "done"
      : openBreak
        ? "on_break"
        : "working";
  return { stage, workedHours };
}

function dotColor(k: TimeEntry["kind"]): string {
  if (k === "check_in") return colors.success[500];
  if (k === "check_out") return colors.error[500];
  if (k === "break_start") return colors.warning[500];
  return colors.secondary[500];
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

function confirm(title: string, msg: string): Promise<boolean> {
  return new Promise((res) => {
    Alert.alert(title, msg, [
      { text: t("schedule.cancel"), style: "cancel", onPress: () => res(false) },
      { text: t("schedule.proceed"), style: "destructive", onPress: () => res(true) },
    ]);
  });
}

/** Current time, refreshed every second while `active`. */
function useTick(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function dfLocale() {
  return i18n.locale === "de" ? de : i18n.locale === "ta" ? ta : enUS;
}

function numLocale() {
  return i18n.locale === "de" ? "de-DE" : i18n.locale === "ta" ? "ta-IN" : "en-GB";
}

/** 00:00:00 */
function fmtClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** "3 h 00 min" */
function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`;
}

/** "45 m" / "1,2 km" */
function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${new Intl.NumberFormat(numLocale(), { maximumFractionDigits: 1 }).format(m / 1000)} km`;
}

function openInMaps(address: string) {
  const q = encodeURIComponent(address);
  const url = Platform.OS === "ios" ? `maps:0,0?q=${q}` : `geo:0,0?q=${q}`;
  Linking.openURL(url).catch(() => {
    void Linking.openURL(`https://maps.google.com/?q=${q}`);
  });
}

const styles = StyleSheet.create({
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  btnRow: { flexDirection: "row", gap: spacing[2] },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: 10,
  },
  logDot: { width: 8, height: 8, borderRadius: 4 },
  noteBox: {
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.neutral[50],
  },
});

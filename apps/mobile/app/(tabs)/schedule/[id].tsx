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
 */

import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { format, parseISO } from "date-fns";
import { Button, Card, CenterSpinner, Chip } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  distanceMeters,
  insertTimeEntry,
  loadMyShifts,
  loadShiftEntries,
  type TimeEntry,
} from "@/lib/schedule";
import { colors, radius, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function ShiftDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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

  const runAction = useCallback(
    async (kind: TimeEntry["kind"]) => {
      if (!profile?.employeeId || !id) return;
      setPending(true);
      try {
        // GPS sample only for check-in and check-out. Break start/end
        // don't need it — they only prove the clock is running.
        let lat: number | null = null;
        let lng: number | null = null;
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
            if (
              shift?.property.lat != null &&
              shift?.property.lng != null &&
              distanceMeters(
                { lat, lng },
                { lat: shift.property.lat, lng: shift.property.lng },
              ) > 500
            ) {
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

  if (!shift || !entries) return <CenterSpinner />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.tertiary[200] }} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← {t("schedule.back")}</Text>
        </Pressable>

        <View style={styles.headBlock}>
          <Text style={styles.eyebrow}>{shift.client.name.toUpperCase()}</Text>
          <Text style={styles.propName}>{shift.property.name}</Text>
          {shift.property.address ? (
            <Text style={styles.address}>{shift.property.address}</Text>
          ) : null}
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>
              {format(parseISO(shift.starts_at), "EEE d LLL · HH:mm")} →{" "}
              {format(parseISO(shift.ends_at), "HH:mm")}
            </Text>
            <Chip label={shift.status} tone={statusTone(shift.status)} />
          </View>
        </View>

        <Card style={styles.card}>
          <Text style={styles.cardH}>{t("schedule.actions")}</Text>

          {state.stage === "before" && (
            <Button
              label={t("schedule.checkIn")}
              onPress={() => runAction("check_in")}
              loading={pending}
            />
          )}

          {state.stage === "working" && (
            <>
              <Button
                label={t("schedule.breakStart")}
                variant="secondary"
                onPress={() => runAction("break_start")}
                loading={pending}
              />
              <Button
                label={t("schedule.checkOut")}
                onPress={() => runAction("check_out")}
                loading={pending}
              />
            </>
          )}

          {state.stage === "on_break" && (
            <Button
              label={t("schedule.breakEnd")}
              onPress={() => runAction("break_end")}
              loading={pending}
            />
          )}

          {state.stage === "done" && (
            <View style={styles.doneBanner}>
              <Text style={styles.doneText}>
                {t("schedule.completedText", {
                  hours: state.workedHours.toFixed(1),
                })}
              </Text>
            </View>
          )}
        </Card>

        {entries.length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.cardH}>{t("schedule.log")}</Text>
            {entries.map((e) => (
              <View key={e.id} style={styles.logRow}>
                <View
                  style={[
                    styles.logDot,
                    { backgroundColor: dotColor(e.kind) },
                  ]}
                />
                <Text style={styles.logKind}>{t(`schedule.entry.${e.kind}`)}</Text>
                <Text style={styles.logTime}>
                  {format(parseISO(e.occurred_at), "HH:mm:ss")}
                </Text>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
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

function statusTone(
  s: string,
): "primary" | "success" | "warning" | "error" | "neutral" | "secondary" {
  if (s === "completed") return "success";
  if (s === "in_progress") return "primary";
  if (s === "cancelled") return "error";
  if (s === "scheduled") return "secondary";
  return "neutral";
}

function confirm(title: string, msg: string): Promise<boolean> {
  return new Promise((res) => {
    Alert.alert(title, msg, [
      { text: t("schedule.cancel"), style: "cancel", onPress: () => res(false) },
      { text: t("schedule.proceed"), style: "destructive", onPress: () => res(true) },
    ]);
  });
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[4],
    gap: spacing[4],
  },
  back: {
    marginBottom: spacing[2],
  },
  backText: {
    fontSize: typography.size.md,
    color: colors.primary[600],
    fontWeight: "600",
  },
  headBlock: {
    gap: spacing[1],
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary[700],
    letterSpacing: 0.6,
  },
  propName: {
    fontSize: typography.size["2xl"],
    fontWeight: "800",
    color: colors.secondary[500],
    letterSpacing: -0.5,
  },
  address: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    marginTop: spacing[3],
    flexWrap: "wrap",
  },
  timeLabel: {
    fontFamily: "Menlo",
    fontSize: 12,
    color: colors.neutral[600],
  },
  card: {
    gap: spacing[3],
  },
  cardH: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.neutral[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing[1],
  },
  doneBanner: {
    padding: spacing[4],
    backgroundColor: colors.success[50],
    borderRadius: radius.md,
  },
  doneText: {
    color: colors.success[700],
    fontWeight: "700",
    fontSize: typography.size.md,
    textAlign: "center",
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  logDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  logKind: {
    flex: 1,
    fontSize: typography.size.md,
    color: colors.neutral[800],
  },
  logTime: {
    fontFamily: "Menlo",
    fontSize: 12,
    color: colors.neutral[500],
  },
});

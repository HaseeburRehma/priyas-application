/**
 * Schedule tab — list of my upcoming + recently-completed shifts.
 * Tapping a row opens the detail screen with clock-in / clock-out /
 * break controls.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { format, isSameDay, parseISO } from "date-fns";
import Svg, { Path } from "react-native-svg";
import { Chip, CenterSpinner, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { can } from "@/lib/rbac";
import { loadMyShifts, type ShiftRow } from "@/lib/schedule";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

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

  const groups = groupByDay(data ?? []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.tertiary[200] }} edges={["top"]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("schedule.title")}</Text>
          <Text style={styles.sub}>{t("schedule.subtitle")}</Text>
        </View>
        {canPlan && (
          <Pressable
            onPress={() => router.push("/(tabs)/schedule/new")}
            style={styles.planBtn}
            hitSlop={8}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 5v14M5 12h14" />
            </Svg>
            <Text style={styles.planBtnText}>
              {t("mobile.planShift.buttonLabel")}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
        }
      >
        {isLoading && <CenterSpinner />}
        {!isLoading && groups.length === 0 && (
          <EmptyState
            title={t("schedule.emptyTitle")}
            subtitle={t("schedule.emptyBody")}
          />
        )}
        {groups.map((g) => (
          <View key={g.dateKey} style={styles.group}>
            <Text style={styles.groupHead}>
              {isSameDay(new Date(g.dateKey), new Date())
                ? t("schedule.today")
                : format(new Date(g.dateKey), "EEEE · d MMM")}
            </Text>
            {g.rows.map((s) => (
              <Pressable
                key={s.id}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/schedule/[id]",
                    params: { id: s.id },
                  })
                }
                style={styles.row}
              >
                <View style={styles.timeCol}>
                  <Text style={styles.timeText}>
                    {format(parseISO(s.starts_at), "HH:mm")}
                  </Text>
                  <Text style={styles.timeSep}>–</Text>
                  <Text style={styles.timeText}>
                    {format(parseISO(s.ends_at), "HH:mm")}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.client} numberOfLines={1}>
                    {s.client.name}
                  </Text>
                  <Text style={styles.property} numberOfLines={1}>
                    {s.property.name}
                  </Text>
                </View>
                <Chip label={s.status} tone={statusTone(s.status)} />
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function groupByDay(rows: ShiftRow[]) {
  const map = new Map<string, ShiftRow[]>();
  for (const r of rows) {
    const key = r.starts_at.slice(0, 10);
    const existing = map.get(key) ?? [];
    existing.push(r);
    map.set(key, existing);
  }
  return Array.from(map.entries()).map(([dateKey, rows]) => ({
    dateKey,
    rows,
  }));
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

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  planBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primary[500],
  },
  planBtnText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: typography.size.sm,
  },
  title: {
    fontSize: typography.size["2xl"],
    fontWeight: "800",
    color: colors.secondary[500],
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: typography.size.md,
    color: colors.neutral[500],
    marginTop: 2,
  },
  container: {
    padding: spacing[4],
    gap: spacing[4],
  },
  group: {
    gap: spacing[2],
  },
  groupHead: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.neutral[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[4],
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.neutral[100],
  },
  timeCol: {
    alignItems: "center",
  },
  timeText: {
    fontFamily: "Menlo",
    fontSize: 12,
    fontWeight: "700",
    color: colors.neutral[700],
  },
  timeSep: {
    fontSize: 10,
    color: colors.neutral[400],
  },
  client: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  property: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
});

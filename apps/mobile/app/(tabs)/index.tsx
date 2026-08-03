/**
 * Home tab — personal-scope dashboard (works for every role).
 *
 * Mirrors the web app's `MySelfPanel` structure:
 *   - Greeting
 *   - 4 KPI tiles (hours week, hours month, vacation, training)
 *   - Upcoming shifts preview
 *   - Sign-out button at the bottom
 *
 * Field staff see ONLY this. Management sees this plus (in follow-up
 * turns) org KPIs on a dedicated Dashboard tab. Rule of thumb: this
 * home is "you", not "the business".
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { format, parseISO } from "date-fns";
import { Button, Card, CenterSpinner, Chip, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { loadMySelf, type MySelfData } from "@/lib/my-self";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function HomeTab() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { data, isLoading } = useQuery<MySelfData | null>({
    queryKey: ["my-self", profile?.id],
    queryFn: loadMySelf,
    enabled: !!profile?.id,
  });

  const hour = new Date().getHours();
  const greetKey =
    hour < 11 ? "goodMorning" : hour < 17 ? "goodAfternoon" : "goodEvening";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.tertiary[200] }} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.hi}>
              {t(`dashboard.${greetKey}`)}, {profile?.fullName?.split(" ")[0] ?? "—"} 👋
            </Text>
            <Text style={styles.sub}>{t("dashboard.subtitle")}</Text>
          </View>
        </View>

        {isLoading && <CenterSpinner />}

        {!isLoading && !data && (
          <EmptyState
            title={t("dashboard.mySelf.notLinkedTitle")}
            subtitle={t("dashboard.mySelf.notLinkedBody")}
          />
        )}

        {data && (
          <>
            <View style={styles.kpiGrid}>
              <Kpi
                label={t("dashboard.mySelf.hoursWeek")}
                value={`${data.hours_this_week.toFixed(1)} h`}
                sub={t("dashboard.mySelf.hoursWeekTarget", { target: data.weekly_target })}
              />
              <Kpi
                label={t("dashboard.mySelf.hoursMonth")}
                value={`${data.hours_this_month.toFixed(1)} h`}
                sub={format(new Date(), "LLLL")}
              />
              <Kpi
                label={t("dashboard.mySelf.vacation")}
                value={`${data.vacation_total - data.vacation_used} / ${data.vacation_total}`}
                sub={t("dashboard.mySelf.vacationRemaining")}
                onPress={() => router.push("/vacation")}
              />
              <Kpi
                label={t("dashboard.mySelf.training")}
                value={String(data.outstanding_mandatory.length)}
                sub={
                  data.outstanding_mandatory.length === 0
                    ? t("dashboard.mySelf.trainingAllDone")
                    : t("dashboard.mySelf.trainingOutstanding")
                }
                tone={data.outstanding_mandatory.length > 0 ? "warning" : "success"}
              />
            </View>

            <Card style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>
                  {t("dashboard.mySelf.upcomingShifts")}
                </Text>
                <Pressable onPress={() => router.push("/(tabs)/schedule")}>
                  <Text style={styles.link}>
                    {t("dashboard.mySelf.openSchedule")} →
                  </Text>
                </Pressable>
              </View>

              {data.upcoming_shifts.length === 0 ? (
                <Text style={styles.emptyLine}>
                  {t("dashboard.mySelf.noUpcoming")}
                </Text>
              ) : (
                data.upcoming_shifts.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => router.push(`/(tabs)/schedule/${s.id}`)}
                    style={styles.shiftRow}
                  >
                    <View style={styles.shiftBadge}>
                      <Text style={styles.shiftBadgeDay}>
                        {format(parseISO(s.starts_at), "dd")}
                      </Text>
                      <Text style={styles.shiftBadgeMon}>
                        {format(parseISO(s.starts_at), "MMM").toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.shiftClient} numberOfLines={1}>
                        {s.client_name}
                      </Text>
                      <Text style={styles.shiftPlace} numberOfLines={1}>
                        {s.property_name}
                      </Text>
                      <Text style={styles.shiftTime}>
                        {format(parseISO(s.starts_at), "HH:mm")} –{" "}
                        {format(parseISO(s.ends_at), "HH:mm")}
                      </Text>
                    </View>
                    <Chip label={s.status} tone={statusTone(s.status)} />
                  </Pressable>
                ))
              )}
            </Card>

            {data.outstanding_mandatory.length > 0 && (
              <Card style={styles.card}>
                <Text style={styles.cardTitle}>
                  {t("dashboard.mySelf.trainingTitle")}
                </Text>
                {data.outstanding_mandatory.map((m) => (
                  <View key={m.id} style={styles.trainingRow}>
                    <Text style={styles.trainingTitle}>{m.title}</Text>
                    <Chip label={t("dashboard.mySelf.mandatory")} tone="warning" />
                  </View>
                ))}
              </Card>
            )}
          </>
        )}

        <View style={{ height: spacing[6] }} />
        <Button
          label={t("nav.logout") ?? "Sign out"}
          onPress={() => signOut()}
          variant="ghost"
        />
      </ScrollView>
    </SafeAreaView>
  );
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

function Kpi({
  label,
  value,
  sub,
  tone = "primary",
  onPress,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "primary" | "warning" | "success";
  onPress?: () => void;
}) {
  const stripe =
    tone === "warning"
      ? colors.warning[500]
      : tone === "success"
        ? colors.success[500]
        : colors.primary[500];
  const body = (
    <>
      <Text style={styles.kpiLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiSub}>{sub}</Text>
    </>
  );
  // When tappable, render as Pressable so flexBasis keeps the tile
  // sized correctly in the 2-col grid. Non-tappable stays a View.
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.kpi,
          { borderTopColor: stripe, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View style={[styles.kpi, { borderTopColor: stripe }]}>{body}</View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[4],
    gap: spacing[4],
  },
  header: {
    marginBottom: spacing[2],
  },
  hi: {
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
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[3],
  },
  kpi: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    borderTopWidth: 3,
    padding: spacing[4],
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.neutral[500],
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: typography.size.xl,
    fontWeight: "800",
    color: colors.secondary[500],
    letterSpacing: -0.5,
  },
  kpiSub: {
    fontSize: 11,
    color: colors.neutral[500],
    marginTop: 2,
  },
  card: {
    gap: spacing[3],
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing[1],
  },
  cardTitle: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  link: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.primary[600],
  },
  emptyLine: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    textAlign: "center",
    paddingVertical: spacing[4],
  },
  shiftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  shiftBadge: {
    width: 44,
    alignItems: "center",
    backgroundColor: colors.primary[50],
    borderRadius: 8,
    paddingVertical: 6,
  },
  shiftBadgeDay: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary[700],
  },
  shiftBadgeMon: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.primary[700],
    letterSpacing: 0.5,
  },
  shiftClient: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  shiftPlace: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 1,
  },
  shiftTime: {
    fontFamily: "Menlo",
    fontSize: 11,
    color: colors.neutral[500],
    marginTop: 2,
  },
  trainingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
    gap: spacing[2],
  },
  trainingTitle: {
    flex: 1,
    fontSize: typography.size.md,
    color: colors.neutral[800],
  },
});

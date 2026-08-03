/**
 * Vacation home — list of my requests + big "Request time off" CTA.
 */

import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { format, parseISO } from "date-fns";
import { Button, Card, CenterSpinner, Chip, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  loadMyVacationRequests,
  type LeaveStatus,
  type VacationRow,
} from "@/lib/vacation";
import { colors, spacing, typography } from "@/lib/theme";
import { t } from "@/lib/i18n";

export default function VacationList() {
  const router = useRouter();
  const { profile } = useAuth();

  const { data, isLoading, refetch, isRefetching } = useQuery<VacationRow[]>({
    queryKey: ["my-vacation", profile?.employeeId],
    queryFn: () =>
      profile?.employeeId
        ? loadMyVacationRequests(profile.employeeId)
        : Promise.resolve([]),
    enabled: !!profile?.employeeId,
  });

  const rows = data ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.tertiary[200] }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
        }
      >
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← {t("schedule.back")}</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>{t("vacation.title")}</Text>
          <Text style={styles.sub}>{t("vacation.subtitle")}</Text>
        </View>

        <Button
          label={t("vacation.newRequest")}
          onPress={() => router.push("/vacation/new")}
        />

        {isLoading && <CenterSpinner />}

        {!isLoading && rows.length === 0 && (
          <EmptyState
            title={t("vacation.emptyTitle")}
            subtitle={t("vacation.emptyBody")}
          />
        )}

        {pending.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionH}>{t("vacation.pending")}</Text>
            {pending.map((r) => (
              <VacationCard key={r.id} row={r} />
            ))}
          </View>
        )}

        {done.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionH}>{t("vacation.history")}</Text>
            {done.map((r) => (
              <VacationCard key={r.id} row={r} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function VacationCard({ row }: { row: VacationRow }) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dates}>
            {format(parseISO(row.start_date), "d LLL")} –{" "}
            {format(parseISO(row.end_date), "d LLL yyyy")}
          </Text>
          <Text style={styles.meta}>
            {row.days} {row.days === 1 ? t("vacation.day") : t("vacation.days")}
            {" · "}
            {t(`vacation.kind.${row.kind}` as never)}
          </Text>
        </View>
        <Chip label={t(`vacation.status.${row.status}` as never)} tone={statusTone(row.status)} />
      </View>
      {row.reason ? <Text style={styles.reason}>{row.reason}</Text> : null}
      {row.reviewer_note ? (
        <View style={styles.note}>
          <Text style={styles.noteLabel}>{t("vacation.reviewerNote")}</Text>
          <Text style={styles.noteBody}>{row.reviewer_note}</Text>
        </View>
      ) : null}
    </Card>
  );
}

function statusTone(
  s: LeaveStatus,
): "primary" | "secondary" | "warning" | "success" | "error" | "neutral" {
  if (s === "approved") return "success";
  if (s === "pending") return "warning";
  if (s === "rejected") return "error";
  return "neutral";
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[4],
    gap: spacing[3],
  },
  back: {
    marginBottom: spacing[1],
  },
  backText: {
    fontSize: typography.size.md,
    color: colors.primary[600],
    fontWeight: "600",
  },
  header: {
    gap: spacing[1],
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
  },
  section: {
    gap: spacing[2],
    marginTop: spacing[2],
  },
  sectionH: {
    fontSize: typography.size.sm,
    fontWeight: "700",
    color: colors.neutral[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    gap: spacing[2],
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
  },
  dates: {
    fontSize: typography.size.md,
    fontWeight: "700",
    color: colors.neutral[800],
  },
  meta: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  reason: {
    fontSize: typography.size.sm,
    color: colors.neutral[700],
    fontStyle: "italic",
    paddingTop: spacing[1],
  },
  note: {
    marginTop: spacing[2],
    padding: spacing[3],
    borderRadius: 8,
    backgroundColor: colors.neutral[50],
    borderLeftWidth: 3,
    borderLeftColor: colors.primary[500],
  },
  noteLabel: {
    fontSize: typography.size.xs,
    fontWeight: "700",
    color: colors.neutral[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  noteBody: {
    fontSize: typography.size.sm,
    color: colors.neutral[700],
    marginTop: 2,
  },
});

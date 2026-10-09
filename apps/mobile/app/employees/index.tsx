/**
 * Employees list — admin + dispatcher only.
 * Search + service-line filter (header filter button) + status chips,
 * week workload per person, drill-down to detail.
 */

import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  loadMobileEmployees,
  type EmployeeRow,
} from "@/lib/employees";
import {
  Avatar,
  Badge,
  Card,
  CenterSpinner,
  ChipRow,
  Divider,
  EmptyState,
  FilterChip,
  Icon,
  NavHeader,
  ProgressBar,
  RoundButton,
  Screen,
  SearchField,
  Segmented,
  Txt,
} from "@/components/ui";
import { colors, radius, shadow, spacing } from "@/lib/theme";
import { t } from "@/lib/i18n";
import {
  displayStatusBadge,
  displayStatusOf,
  type EmployeeDisplayStatus,
} from "@/components/employee-status";

type ServiceFilter = "all" | "priya" | "alltagshilfe";
type StatusFilter = "all" | "active" | "away" | "overtime" | "inactive";

const hoursFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

const GROUP: Record<EmployeeDisplayStatus, Exclude<StatusFilter, "all">> = {
  active: "active",
  overtime: "active",
  vacation: "away",
  on_leave: "away",
  sick: "away",
  unavailable: "inactive",
  inactive: "inactive",
  terminated: "inactive",
};

export default function EmployeesScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [service, setService] = useState<ServiceFilter>("all");
  const [showService, setShowService] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const query = useQuery({
    queryKey: ["employees", { q: q.trim(), service }],
    queryFn: () => loadMobileEmployees({ q, serviceLine: service }),
    staleTime: 60_000,
  });

  const rows = useMemo(
    () => (query.data ?? []).map((r) => ({ row: r, status: displayStatusOf(r) })),
    [query.data],
  );
  const counts = useMemo(() => {
    const c = { all: rows.length, active: 0, away: 0, overtime: 0, inactive: 0 };
    for (const r of rows) {
      c[GROUP[r.status]] += 1;
      if (r.status === "overtime") c.overtime += 1;
    }
    return c;
  }, [rows]);
  const hasWorkload = rows.some((r) => r.row.hours_this_week != null);
  const activeToday = rows.filter((r) => r.row.on_shift_today).length;
  const visible = rows.filter((r) =>
    statusFilter === "all"
      ? true
      : statusFilter === "overtime"
        ? r.status === "overtime"
        : GROUP[r.status] === statusFilter,
  );

  const chips: StatusFilter[] = ["all", "active", "away", "overtime", "inactive"];

  return (
    <Screen
      edges={["top", "bottom"]}
      header={
        <NavHeader
          title={t("mobile.employees.title")}
          onBack={() => router.back()}
          right={
            <RoundButton
              icon="filter"
              dot={service !== "all"}
              accessibilityLabel={t("mobile.ui.employees.serviceFilter")}
              onPress={() => setShowService((v) => !v)}
            />
          }
        />
      }
      refreshing={query.isFetching && !query.isLoading}
      onRefresh={() => query.refetch()}
    >
      <SearchField
        value={q}
        onChangeText={setQ}
        placeholder={t("mobile.employees.searchPlaceholder")}
        autoCapitalize="none"
        returnKeyType="search"
      />

      {showService || service !== "all" ? (
        <Segmented
          value={service}
          onChange={setService}
          options={(["all", "priya", "alltagshilfe"] as const).map((v) => ({
            value: v,
            label: t(`mobile.employees.filter.${v}`),
          }))}
        />
      ) : null}

      {query.isLoading ? (
        <CenterSpinner />
      ) : query.error ? (
        <EmptyState
          icon="alert"
          title={t("mobile.employees.errorTitle")}
          subtitle={t("mobile.employees.errorBody")}
        />
      ) : (
        <>
          <ChipRow>
            {chips
              .filter((c) => c === "all" || counts[c] > 0 || statusFilter === c)
              .map((c) => (
                <FilterChip
                  key={c}
                  label={chipLabel(c)}
                  count={counts[c]}
                  selected={statusFilter === c}
                  onPress={() => setStatusFilter(c)}
                />
              ))}
          </ChipRow>

          {rows.length > 0 ? (
            <View style={styles.statRow}>
              {hasWorkload ? (
                <StatCard
                  label={t("employees.summary.active")}
                  value={String(activeToday)}
                  sub={t("employees.summary.activeSub")}
                />
              ) : null}
              <StatCard
                label={t("mobile.ui.employees.statAway")}
                value={String(counts.away)}
                sub={t("mobile.ui.employees.statAwaySub")}
                subColor={counts.away > 0 ? colors.warning[700] : undefined}
              />
              {hasWorkload ? (
                <StatCard
                  label={t("employees.status.overtime")}
                  value={String(counts.overtime)}
                  sub={t("mobile.ui.employees.statOvertimeSub")}
                  subColor={counts.overtime > 0 ? colors.error[700] : undefined}
                />
              ) : null}
            </View>
          ) : null}

          {visible.length === 0 ? (
            <Card>
              <EmptyState
                icon="users"
                title={t("mobile.employees.emptyTitle")}
                subtitle={t("mobile.employees.emptyBody")}
              />
            </Card>
          ) : (
            <Card padded={false}>
              {visible.map(({ row, status }, i) => (
                <View key={row.id}>
                  {i > 0 ? <Divider /> : null}
                  <EmployeeListRow
                    row={row}
                    status={status}
                    onPress={() =>
                      router.push({
                        pathname: "/employees/[id]",
                        params: { id: row.id },
                      })
                    }
                  />
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function chipLabel(c: StatusFilter): string {
  switch (c) {
    case "all":
      return t("mobile.employees.filter.all");
    case "active":
      return t("mobile.employees.status.active");
    case "away":
      return t("mobile.ui.employees.statAway");
    case "overtime":
      return t("employees.status.overtime");
    case "inactive":
      return t("mobile.employees.status.inactive");
  }
}

function StatCard({
  label,
  value,
  sub,
  subColor = colors.neutral[500],
}: {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <View style={styles.stat}>
      <Txt v="overline" color={colors.neutral[500]} numberOfLines={1}>
        {label}
      </Txt>
      <Txt v="title" color={colors.secondary[500]} numberOfLines={1}>
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

function EmployeeListRow({
  row,
  status,
  onPress,
}: {
  row: EmployeeRow;
  status: EmployeeDisplayStatus;
  onPress: () => void;
}) {
  const badge = displayStatusBadge(status);
  const roleLine = [
    row.role ? t(`mobile.employees.role.${row.role}`) : null,
    row.service_line ? t(`mobile.employees.service.${row.service_line}`) : null,
    row.city,
  ]
    .filter(Boolean)
    .join(" · ");
  const hours = row.hours_this_week;
  const target = row.weekly_hours ?? null;
  const over = status === "overtime";
  const vacationLeft =
    row.vacation_days_per_year != null && row.vacation_days_taken != null
      ? row.vacation_days_per_year - row.vacation_days_taken
      : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.neutral[50] }]}
    >
      <Avatar name={row.full_name} size={40} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={styles.rowTop}>
          <Txt v="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
            {row.full_name}
          </Txt>
          <Badge label={badge.label} tone={badge.tone} dot={false} />
        </View>
        {roleLine ? (
          <Txt v="subhead" color={colors.neutral[500]} numberOfLines={1}>
            {roleLine}
          </Txt>
        ) : null}
        {hours != null || vacationLeft != null ? (
          <View style={styles.workload}>
            {hours != null && target ? (
              <View style={{ flex: 1 }}>
                <ProgressBar
                  value={hours / target}
                  tone={over ? "error" : "brand"}
                />
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            {hours != null ? (
              <Txt v="mono" color={over ? colors.error[700] : colors.neutral[700]}>
                {target
                  ? `${hoursFmt.format(hours)}/${hoursFmt.format(target)} h`
                  : `${hoursFmt.format(hours)} h`}
              </Txt>
            ) : null}
            {vacationLeft != null ? (
              <View
                style={styles.vacation}
                accessible
                accessibilityLabel={t("mobile.ui.employees.vacationLeftA11y", {
                  n: vacationLeft,
                })}
              >
                {hours != null ? (
                  <Txt v="caption" color={colors.neutral[300]}>
                    ·
                  </Txt>
                ) : null}
                <Icon name="sun" size={14} color={colors.warning[500]} />
                <Txt v="caption" color={colors.neutral[600]}>
                  {String(vacationLeft)}
                </Txt>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: "row", gap: spacing[2] },
  stat: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.neutral[100],
    backgroundColor: colors.white,
    ...shadow.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  workload: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginTop: 6,
  },
  vacation: { flexDirection: "row", alignItems: "center", gap: 4 },
});

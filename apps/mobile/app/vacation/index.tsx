/**
 * Vacation home — balance card + "Request time off" CTA, next approved
 * leave, status filter and the list of my requests (Figma 19-vacation).
 */

import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Badge,
  Button,
  Card,
  CenterSpinner,
  ChipRow,
  Divider,
  EmptyState,
  FilterChip,
  IconChip,
  NavHeader,
  Screen,
  Txt,
  type IconName,
  type Tone,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import {
  formatLeavePeriod,
  loadMyVacationBalance,
  loadMyVacationRequests,
  type LeaveKind,
  type LeaveStatus,
  type VacationBalance,
  type VacationRow,
} from "@/lib/vacation";
import { colors, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

type Filter = "all" | "pending" | "suggested" | "approved" | "rejected";

export default function VacationList() {
  const router = useRouter();
  const { profile } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");

  const { data, isLoading, refetch, isRefetching } = useQuery<VacationRow[]>({
    queryKey: ["my-vacation", profile?.employeeId],
    queryFn: () =>
      profile?.employeeId
        ? loadMyVacationRequests(profile.employeeId)
        : Promise.resolve([]),
    enabled: !!profile?.employeeId,
  });

  const balanceQuery = useQuery<VacationBalance | null>({
    queryKey: ["vacation-balance", profile?.employeeId],
    queryFn: () =>
      profile?.employeeId
        ? loadMyVacationBalance(profile.employeeId)
        : Promise.resolve(null),
    enabled: !!profile?.employeeId,
  });
  const balance = balanceQuery.data ?? null;

  const rows = data ?? [];

  const counts = useMemo(() => {
    const c: Record<LeaveStatus, number> = {
      pending: 0,
      suggested: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const nextLeave = useMemo(() => {
    const today = todayIso();
    return (
      rows
        .filter(
          (r) => r.status === "approved" && r.kind === "vacation" && r.end_date >= today,
        )
        .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null
    );
  }, [rows]);

  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  const filters: Filter[] = ["all", "pending", "suggested", "approved", "rejected"];

  return (
    <Screen
      header={<NavHeader title={t("vacation.title")} />}
      refreshing={isRefetching}
      onRefresh={() => {
        void refetch();
        void balanceQuery.refetch();
      }}
    >
      {/* Balance + CTA */}
      <Card style={styles.balanceCard}>
        <View style={styles.balanceTop}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="display" color={colors.secondary[500]}>
              {balance ? String(balance.free) : "—"}
            </Txt>
            <Txt v="subhead" color={colors.neutral[500]}>
              {t("mobile.ui.vacation.availableDays")}
            </Txt>
          </View>
          <IconChip icon="sun" tone="warning" size={48} iconSize={24} />
        </View>

        {balance ? <UsageBar balance={balance} /> : null}

        <Button
          label={t("vacation.newRequest")}
          icon="plus"
          onPress={() => router.push("/vacation/new")}
        />
      </Card>

      {/* Next approved leave */}
      {nextLeave ? (
        <Card style={styles.nextCard}>
          <IconChip icon="calendar" tone="brand" size={40} iconSize={20} />
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Txt v="caption" color={colors.neutral[500]}>
              {t("mobile.ui.vacation.nextLeave")}
            </Txt>
            <Txt v="bodyStrong" numberOfLines={1}>
              {formatLeavePeriod(nextLeave.start_date, nextLeave.end_date, i18n.locale)}
              {" · "}
              {daysLabel(nextLeave.days)}
            </Txt>
          </View>
          <Badge label={t("vacation.status.approved")} tone="success" />
        </Card>
      ) : null}

      {/* Status filter */}
      {rows.length > 0 ? (
        <ChipRow>
          {filters
            .filter((f) => f !== "suggested" || counts.suggested > 0 || filter === "suggested")
            .map((f) => (
              <FilterChip
                key={f}
                label={t(`vacation.tabs.${f}`)}
                count={f === "all" ? undefined : counts[f]}
                selected={filter === f}
                onPress={() => setFilter(f)}
              />
            ))}
        </ChipRow>
      ) : null}

      {isLoading && <CenterSpinner />}

      {!isLoading && rows.length === 0 && (
        <EmptyState
          icon="sun"
          title={t("vacation.emptyTitle")}
          subtitle={t("vacation.emptyBody")}
        />
      )}

      {!isLoading && rows.length > 0 && visible.length === 0 && (
        <Txt v="subhead" color={colors.neutral[500]} style={{ textAlign: "center" }}>
          {t("vacation.table.empty")}
        </Txt>
      )}

      {visible.length > 0 && (
        <Card padded={false}>
          {visible.map((r, i) => (
            <View key={r.id}>
              {i > 0 ? <Divider /> : null}
              <RequestRow row={r} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

/* ----------------------------- Balance bar ----------------------------- */

function UsageBar({ balance }: { balance: VacationBalance }) {
  const scale = Math.max(1, balance.total, balance.used + balance.approved);
  const usedPct = (balance.used / scale) * 100;
  const approvedPct = (balance.approved / scale) * 100;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.bar}>
        {usedPct > 0 ? (
          <View style={{ width: `${usedPct}%`, backgroundColor: colors.primary[500] }} />
        ) : null}
        {approvedPct > 0 ? (
          <View
            style={{
              width: `${approvedPct}%`,
              backgroundColor: colors.accent[500],
              marginLeft: usedPct > 0 ? 2 : 0,
            }}
          />
        ) : null}
      </View>
      <View style={styles.legend}>
        <LegendItem color={colors.primary[500]} label={t("mobile.ui.vacation.legendUsed", { n: balance.used })} />
        <LegendItem
          color={colors.accent[500]}
          label={t("mobile.ui.vacation.legendApproved", { n: balance.approved })}
        />
        <LegendItem color={colors.neutral[200]} label={t("mobile.ui.vacation.legendFree", { n: balance.free })} />
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Txt v="caption" color={colors.neutral[600]}>
        {label}
      </Txt>
    </View>
  );
}

/* ------------------------------ Request row ---------------------------- */

function RequestRow({ row }: { row: VacationRow }) {
  const kind = KIND_STYLE[row.kind] ?? KIND_STYLE.vacation;
  const suggestion =
    row.status === "suggested" && row.suggested_start && row.suggested_end
      ? t("mobile.ui.vacation.suggestion", {
          period: formatLeavePeriod(row.suggested_start, row.suggested_end, i18n.locale),
        })
      : null;
  const requestedOn = t("mobile.ui.vacation.requestedOn", {
    date: new Date(row.created_at).toLocaleDateString(i18n.locale, {
      day: "2-digit",
      month: "2-digit",
    }),
  });
  // One compact detail line (design), but never drop the employee's
  // reason or the manager's note — anything not shown inline gets its
  // own caption line below.
  const detail = suggestion ?? row.reviewer_note ?? row.reason ?? requestedOn;
  const extraReason = row.reason && row.reason !== detail ? row.reason : null;
  const extraNote =
    row.reviewer_note && row.reviewer_note !== detail ? row.reviewer_note : null;

  return (
    <View style={styles.reqRow}>
      <IconChip icon={kind.icon} tone={kind.tone} size={36} iconSize={18} />
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <Txt v="bodyStrong" numberOfLines={1}>
          {kindLabel(row.kind)}
          {" · "}
          {formatLeavePeriod(row.start_date, row.end_date, i18n.locale)}
        </Txt>
        <Txt
          v="subhead"
          color={suggestion ? colors.secondary[500] : colors.neutral[500]}
          numberOfLines={2}
        >
          {daysLabel(row.days)}
          {" · "}
          {detail}
        </Txt>
        {extraReason ? (
          <Txt v="caption" color={colors.neutral[600]} numberOfLines={2}>
            {extraReason}
          </Txt>
        ) : null}
        {extraNote ? (
          <Txt v="caption" color={colors.neutral[600]} numberOfLines={3}>
            {t("vacation.reviewerNote")}: {extraNote}
          </Txt>
        ) : null}
        <Badge
          label={t(`vacation.status.${row.status}`)}
          tone={statusTone(row.status)}
          style={{ marginTop: 2 }}
        />
      </View>
    </View>
  );
}

/* -------------------------------- Helpers ------------------------------ */

const KIND_STYLE: Record<LeaveKind, { icon: IconName; tone: Tone }> = {
  vacation: { icon: "sun", tone: "warning" },
  sick: { icon: "alert", tone: "error" },
  unpaid: { icon: "briefcase", tone: "neutral" },
};

function kindLabel(k: LeaveKind): string {
  if (k === "vacation") return t("vacation.table.kindVacation");
  if (k === "sick") return t("vacation.table.kindSick");
  return t("vacation.kind.unpaid");
}

function daysLabel(n: number): string {
  const v = Number(n);
  return `${v.toLocaleString(i18n.locale)} ${v === 1 ? t("vacation.day") : t("vacation.days")}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function statusTone(s: LeaveStatus): Tone {
  if (s === "approved") return "success";
  if (s === "pending") return "warning";
  if (s === "rejected") return "error";
  if (s === "suggested") return "info";
  return "neutral";
}

const styles = StyleSheet.create({
  balanceCard: { gap: 14 },
  balanceTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  bar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: colors.neutral[100],
  },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  nextCard: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  reqRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    paddingVertical: 14,
    paddingHorizontal: spacing[4],
  },
});

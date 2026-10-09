/**
 * Alltagshilfe monthly report viewer — read-only mobile version of
 * the web /reports/alltagshilfe page. Shows the same hours, visits and
 * amounts grouped by client → staff, with a month picker and the
 * latest delivery log entry for the month.
 *
 * The web app still generates the PDF/CSV and sends the report to
 * management (address configured on the web under Settings →
 * Firmenprofil → "E-Mail Geschäftsleitung"). Mobile is for eyeballing
 * the month in the field — there is no send/export action here.
 */

import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { de, enUS, ta } from "date-fns/locale";
import {
  loadAlltagshilfeReportForMonth,
  type AlltagshilfeDelivery,
  type AlltagshilfeReportRow,
} from "@/lib/reports";
import {
  Avatar,
  Badge,
  Card,
  CenterSpinner,
  ChipRow,
  Divider,
  EmptyState,
  Grid,
  HALF,
  Icon,
  IconChip,
  KeyValue,
  KpiCard,
  NavHeader,
  Screen,
  Txt,
} from "@/components/ui";
import { colors, radius, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

const hoursFmt = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const rateFmt = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Client groups shown before the "show more" toggle. */
const GROUPS_COLLAPSED = 5;
/** Months offered in the picker (current month and the ones before). */
const MONTHS_BACK = 6;

function dfLocale() {
  return i18n.locale === "en" ? enUS : i18n.locale === "ta" ? ta : de;
}

const h = (n: number) => `${hoursFmt.format(n)} h`;

export default function AlltagshilfeReport() {
  const router = useRouter();
  // Default: current month
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [expanded, setExpanded] = useState(false);

  const query = useQuery({
    queryKey: [
      "alltagshilfeReport",
      monthAnchor.toISOString().slice(0, 7),
    ],
    queryFn: () => loadAlltagshilfeReportForMonth(monthAnchor),
    staleTime: 5 * 60_000,
  });

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: MONTHS_BACK }, (_, i) =>
      new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1 - i), 1),
    );
  }, []);
  const pick = (m: Date) => {
    setExpanded(false);
    setMonthAnchor(m);
  };

  const now = new Date();
  const isPast = monthAnchor < new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLabel = format(monthAnchor, "LLLL yyyy", { locale: dfLocale() });
  const monthOnly = format(monthAnchor, "LLLL", { locale: dfLocale() });
  const r = query.data;
  const rows = r?.rows ?? [];
  const shown = expanded ? rows : rows.slice(0, GROUPS_COLLAPSED);

  return (
    <Screen
      edges={["top", "bottom"]}
      header={
        <NavHeader title={t("alltagshilfeReport.title")} onBack={() => router.back()} />
      }
      refreshing={query.isFetching && !query.isLoading}
      onRefresh={() => query.refetch()}
    >
      <View style={styles.banner}>
        <IconChip icon="file-text" tone="error" bg={colors.error[500]} fg={colors.white} size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Txt v="overline" color={colors.error[700]}>
            {t("alltagshilfeReport.bannerTag")}
          </Txt>
          <Txt v="caption" color={colors.neutral[700]}>
            {`${t("alltagshilfeReport.bannerStrong")} ${t("alltagshilfeReport.bannerBody")}`}
          </Txt>
          {r?.delivery?.status === "sent" && r.delivery.sent_at ? (
            <Txt v="mono" color={colors.neutral[600]}>
              {`${t("alltagshilfeReport.deliveryStatusSent")} ${format(
                parseISO(r.delivery.sent_at),
                "dd.MM.yyyy · HH:mm",
              )}`}
            </Txt>
          ) : null}
        </View>
      </View>

      <View style={styles.titleRow}>
        <Txt v="title" color={colors.error[700]} numberOfLines={1} style={{ flexShrink: 1 }}>
          {monthLabel}
        </Txt>
        {isPast ? (
          <Badge label={t("alltagshilfeReport.statusFinal")} tone="success" />
        ) : (
          <Badge label={t("mobile.ui.alltagshilfe.running")} tone="warning" />
        )}
      </View>

      <ChipRow>
        {months.map((m) => {
          const on = m.getTime() === monthAnchor.getTime();
          return (
            <Pressable
              key={m.toISOString()}
              onPress={() => pick(m)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={format(m, "LLLL yyyy", { locale: dfLocale() })}
              style={[styles.monthChip, on ? styles.monthChipOn : styles.monthChipOff]}
            >
              <Txt v="callout" color={on ? colors.white : colors.neutral[700]}>
                {format(m, "LLL", { locale: dfLocale() }).replace(".", "")}
              </Txt>
            </Pressable>
          );
        })}
      </ChipRow>

      {query.isLoading ? (
        <CenterSpinner />
      ) : (
        <>
          <Grid>
            <KpiCard
              style={HALF}
              accent="top"
              tone="error"
              icon="clock"
              label={t("alltagshilfeReport.kpi.totalHours")}
              value={h(r?.total_hours ?? 0)}
              valueColor={colors.error[700]}
              sub={t("mobile.reports.visitsCount", { n: r?.total_visits ?? 0 })}
            />
            <KpiCard
              style={HALF}
              accent="top"
              tone="error"
              icon="users"
              label={t("mobile.ui.alltagshilfe.clients")}
              value={String(rows.length)}
              valueColor={colors.error[700]}
              sub={t("alltagshilfeReport.kpiClientsSub", {
                visits: r?.total_visits ?? 0,
                insurers: r?.insurers_count ?? 0,
              })}
            />
            <KpiCard
              style={HALF}
              accent="top"
              tone="error"
              icon="shield"
              label={t("mobile.ui.alltagshilfe.staff")}
              value={String(r?.staff_count ?? 0)}
              valueColor={colors.error[700]}
              sub={t("mobile.ui.alltagshilfe.staffSub")}
            />
            <KpiCard
              style={HALF}
              accent="top"
              tone="error"
              icon="receipt"
              label={t("mobile.ui.alltagshilfe.amount")}
              value={eur0.format((r?.total_amount_cents ?? 0) / 100)}
              valueColor={colors.error[700]}
              sub={t("alltagshilfeReport.kpi.amountSub", {
                rate: rateFmt.format((r?.hourly_rate_cents ?? 0) / 100),
              })}
            />
          </Grid>

          {rows.length === 0 ? (
            <Card>
              <EmptyState
                icon="calendar"
                title={t("alltagshilfeReport.emptyMonth", { month: monthLabel })}
                subtitle={t("mobile.ui.alltagshilfe.emptyBody")}
              />
            </Card>
          ) : (
            <>
              {shown.map((row) => (
                <ClientGroup key={row.client_id} row={row} />
              ))}
              {rows.length > GROUPS_COLLAPSED ? (
                <Pressable
                  onPress={() => setExpanded((v) => !v)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.moreBtn, pressed && { opacity: 0.8 }]}
                >
                  <Txt v="subheadStrong" color={colors.error[700]}>
                    {expanded
                      ? t("mobile.ui.alltagshilfe.showLess")
                      : t("mobile.ui.alltagshilfe.showMore", {
                          n: rows.length - GROUPS_COLLAPSED,
                        })}
                  </Txt>
                  <Icon
                    name={expanded ? "chevron-down" : "chevron-right"}
                    size={16}
                    color={colors.error[700]}
                  />
                </Pressable>
              ) : null}

              <View style={styles.totalBar}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt v="overline" color={colors.white}>
                    {t("alltagshilfeReport.totalRowLabel", { month: monthOnly })}
                  </Txt>
                  <Txt v="caption" color={colors.error[100]}>
                    {t("mobile.ui.alltagshilfe.totalSub", {
                      visits: r?.total_visits ?? 0,
                      hours: h(r?.total_hours ?? 0),
                    })}
                  </Txt>
                </View>
                <Txt v="monoStrong" color={colors.white} style={{ fontSize: 16, lineHeight: 22 }}>
                  {eur.format((r?.total_amount_cents ?? 0) / 100)}
                </Txt>
              </View>
            </>
          )}

          <DeliveryCard delivery={r?.delivery ?? null} />
        </>
      )}
    </Screen>
  );
}

function rhythmLabel(rhythm: AlltagshilfeReportRow["rhythm"]): string | null {
  switch (rhythm) {
    case "weekly":
      return t("alltagshilfeReport.rhythmWeekly");
    case "biweekly":
      return t("alltagshilfeReport.rhythmBiweekly");
    case "monthly":
      return t("alltagshilfeReport.rhythmMonthly");
    case "on_demand":
      return t("alltagshilfeReport.rhythmOnDemand");
    default:
      return null;
  }
}

function ClientGroup({ row }: { row: AlltagshilfeReportRow }) {
  const sub = [row.address, rhythmLabel(row.rhythm ?? null)].filter(Boolean).join(" · ");
  const staff = row.staff ?? [];
  return (
    <Card padded={false} style={{ overflow: "hidden" }}>
      <View style={styles.groupHead}>
        <Avatar name={row.client_name} tone="red" size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Txt v="headline" color={colors.error[700]} numberOfLines={1}>
            {row.client_name}
          </Txt>
          {sub ? (
            <Txt v="caption" color={colors.neutral[600]} numberOfLines={1}>
              {sub}
            </Txt>
          ) : null}
          {row.care_fund ? (
            <View style={styles.insurer}>
              <Txt v="caption" color={colors.error[700]} numberOfLines={1}>
                {row.care_fund}
              </Txt>
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Txt v="monoStrong" color={colors.error[700]}>
            {h(row.hours)}
          </Txt>
          {row.amount_cents != null ? (
            <Txt v="mono" color={colors.neutral[700]}>
              {eur.format(row.amount_cents / 100)}
            </Txt>
          ) : null}
        </View>
      </View>
      {staff.map((s) => (
        <View key={s.employee_id}>
          <Divider />
          <View style={styles.staffRow}>
            <Avatar name={s.name} size={32} />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt v="subheadStrong" numberOfLines={1}>
                {s.name}
              </Txt>
              <Txt v="caption" color={colors.neutral[500]} numberOfLines={1}>
                {t("mobile.ui.alltagshilfe.staffLine", { visits: s.visits, hours: h(s.hours) })}
              </Txt>
            </View>
            <Txt v="mono" color={colors.neutral[800]}>
              {eur.format(s.amount_cents / 100)}
            </Txt>
          </View>
        </View>
      ))}
    </Card>
  );
}

function DeliveryCard({ delivery }: { delivery: AlltagshilfeDelivery | null }) {
  const status = (() => {
    if (!delivery) {
      return { label: t("alltagshilfeReport.deliveryStatusNever"), color: colors.neutral[600] };
    }
    const when = delivery.sent_at ?? delivery.created_at;
    const stamp = when ? ` · ${format(parseISO(when), "dd.MM. HH:mm")}` : "";
    switch (delivery.status) {
      case "sent":
        return { label: t("alltagshilfeReport.deliveryStatusSent") + stamp, color: colors.success[700] };
      case "queued":
        return { label: t("alltagshilfeReport.deliveryStatusQueued") + stamp, color: colors.warning[700] };
      case "failed":
        return { label: t("alltagshilfeReport.deliveryStatusFailed") + stamp, color: colors.error[700] };
      case "manual_skipped":
        return {
          label: t("alltagshilfeReport.deliveryStatusManualSkipped") + stamp,
          color: colors.neutral[600],
        };
    }
  })();
  return (
    <Card style={{ gap: spacing[2] }}>
      <View style={styles.deliveryHead}>
        <Icon name="mail" size={20} color={colors.error[500]} />
        <Txt v="headline">{t("alltagshilfeReport.deliveryTitle")}</Txt>
      </View>
      <Txt v="caption" color={colors.neutral[500]}>
        {t("mobile.ui.alltagshilfe.deliveryInfo")}
      </Txt>
      <View>
        <KeyValue
          label={t("alltagshilfeReport.deliveryStatus")}
          value={status.label}
          valueColor={status.color}
        />
        {delivery ? (
          <>
            <Divider />
            <KeyValue label={t("alltagshilfeReport.deliveryRecipient")} value={delivery.recipient} />
            <Divider />
            <KeyValue label={t("alltagshilfeReport.deliveryFormat")} value={delivery.format} />
          </>
        ) : null}
      </View>
      {delivery?.status === "failed" && delivery.error_message ? (
        <Txt v="caption" color={colors.error[700]}>
          {delivery.error_message}
        </Txt>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: colors.error[100],
    borderLeftColor: colors.error[500],
    backgroundColor: colors.error[50],
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  monthChip: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  monthChipOn: { backgroundColor: colors.error[500] },
  monthChipOff: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.neutral[200] },
  groupHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    padding: 14,
    backgroundColor: colors.error[50],
  },
  insurer: {
    alignSelf: "flex-start",
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.error[100],
    backgroundColor: colors.white,
  },
  staffRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  moreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.error[100],
    backgroundColor: colors.white,
  },
  totalBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.error[700],
  },
  deliveryHead: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
});

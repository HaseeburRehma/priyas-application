/**
 * Invoices list — read-only. KPI header (org-wide summary RPC), status
 * filter (all/draft/sent/paid/overdue), tap for detail with line items.
 *
 * Lexware: invoices pushed by the system land in Lexware as drafts that
 * Priya's team finalises there — rows say "Lexware-Entwurf", never
 * "billed in Lexware".
 */

import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  loadMobileInvoices,
  loadMobileInvoicesSummary,
  type InvoiceRow,
  type InvoiceStatus,
} from "@/lib/invoices";
import {
  Badge,
  Card,
  CenterSpinner,
  ChipRow,
  Divider,
  EmptyState,
  FilterChip,
  Grid,
  HALF,
  KpiCard,
  NavHeader,
  ProgressBar,
  Screen,
  Txt,
} from "@/components/ui";
import { colors, spacing } from "@/lib/theme";
import { t } from "@/lib/i18n";
import { dfLocale, formatEUR, partialShare, StatusChip } from "@/components/invoice-bits";

type StatusFilter = InvoiceStatus | "all";

const eur0 = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export default function InvoicesScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("all");
  const query = useQuery({
    queryKey: ["invoices", { status }],
    queryFn: () => loadMobileInvoices({ status }),
    staleTime: 60_000,
  });
  const summaryQuery = useQuery({
    queryKey: ["invoicesSummary"],
    queryFn: loadMobileInvoicesSummary,
    staleTime: 60_000,
  });
  const s = summaryQuery.data ?? null;

  const counts: Partial<Record<StatusFilter, number>> = s
    ? {
        all: s.total,
        draft: s.draftCount,
        sent: s.openCount,
        paid: s.paidCount,
        overdue: s.overdueCount,
      }
    : {};
  const rows = query.data ?? [];
  // Overdue invoices are part of the RPC's 30-day figure (due date passed).
  const overdueIn30 = s ? Math.min(s.overdueAmountCents, s.forecast30dCents) : 0;

  return (
    <Screen
      edges={["top", "bottom"]}
      header={<NavHeader title={t("mobile.invoices.title")} onBack={() => router.back()} />}
      refreshing={query.isFetching && !query.isLoading}
      onRefresh={() => {
        void query.refetch();
        void summaryQuery.refetch();
      }}
    >
      {s ? (
        <>
          <Grid>
            <KpiCard
              style={HALF}
              accent="left"
              tone="warning"
              icon="clock"
              label={t("invoices.summary.open")}
              value={eur0.format(s.openAmountCents / 100)}
              sub={t("mobile.ui.invoices.openSub", { n: s.openCount })}
            />
            <KpiCard
              style={HALF}
              accent="left"
              tone="success"
              icon="check"
              label={t("mobile.ui.invoices.paidMonth")}
              value={eur0.format(s.collectedThisMonthCents / 100)}
              sub={format(new Date(), "LLLL yyyy", { locale: dfLocale() })}
            />
            <KpiCard
              style={HALF}
              accent="left"
              tone="error"
              icon="alert"
              label={t("invoices.summary.overdue")}
              value={eur0.format(s.overdueAmountCents / 100)}
              valueColor={s.overdueAmountCents > 0 ? colors.error[700] : colors.secondary[500]}
              sub={t("mobile.ui.invoices.invoiceCount", { n: s.overdueCount })}
            />
            <KpiCard
              style={HALF}
              accent="left"
              tone="neutral"
              icon="file-text"
              label={t("mobile.ui.invoices.drafts")}
              value={String(s.draftCount)}
              sub={t("mobile.ui.invoices.draftsInLexware", { n: s.draftInLexwareCount })}
            />
          </Grid>

          {s.forecast30dCents > 0 ? (
            <Card style={{ gap: spacing[2] }}>
              <View style={styles.forecastTop}>
                <Txt v="subheadStrong" style={{ flex: 1 }}>
                  {t("mobile.ui.invoices.due30Title")}
                </Txt>
                <Txt v="headline" color={colors.secondary[500]}>
                  {eur0.format(s.forecast30dCents / 100)}
                </Txt>
              </View>
              {/* Bar = share of the 30-day amount that is not yet overdue. */}
              <ProgressBar
                value={(s.forecast30dCents - overdueIn30) / s.forecast30dCents}
                height={8}
              />
              <Txt v="caption" color={colors.neutral[500]}>
                {overdueIn30 > 0
                  ? t("mobile.ui.invoices.due30Overdue", {
                      amount: eur0.format(overdueIn30 / 100),
                    })
                  : t("mobile.ui.invoices.due30Sub")}
              </Txt>
            </Card>
          ) : null}
        </>
      ) : null}

      <ChipRow>
        {(["all", "draft", "sent", "paid", "overdue"] as const).map((v) => (
          <FilterChip
            key={v}
            label={t(`mobile.invoices.filter.${v}`)}
            count={counts[v]}
            selected={status === v}
            onPress={() => setStatus(v)}
          />
        ))}
      </ChipRow>

      {query.isLoading ? (
        <CenterSpinner />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="receipt"
            title={t("mobile.invoices.emptyTitle")}
            subtitle={t("mobile.invoices.emptyBody")}
          />
        </Card>
      ) : (
        <Card padded={false}>
          {rows.map((item, i) => (
            <View key={item.id}>
              {i > 0 ? <Divider /> : null}
              <Row
                row={item}
                onPress={() =>
                  router.push({
                    pathname: "/invoices/[id]",
                    params: { id: item.id },
                  })
                }
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function Row({ row, onPress }: { row: InvoiceRow; onPress: () => void }) {
  const due = dueLine(row);
  const partial = partialShare(row);
  const lexwareDraft = row.lexware_sync_status === "synced" && row.status !== "draft";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.neutral[50] }]}
    >
      <View style={styles.line}>
        <Txt v="monoStrong" numberOfLines={1} style={{ flex: 1 }}>
          {row.invoice_number ?? "—"}
        </Txt>
        <Txt v="monoStrong">{formatEUR(row.total_cents)}</Txt>
      </View>
      <View style={styles.line}>
        <Txt v="callout" color={colors.secondary[500]} numberOfLines={1} style={{ flex: 1 }}>
          {row.client_name}
        </Txt>
        {partial != null ? (
          <Badge
            label={t("mobile.ui.invoices.partial", { pct: Math.round(partial * 100) })}
            tone="warning"
            dot={false}
          />
        ) : (
          <StatusChip status={row.status} />
        )}
      </View>
      {due || lexwareDraft ? (
        <Txt v="caption" color={colors.neutral[500]} numberOfLines={1}>
          {due ? <Txt v="caption" color={due.color}>{due.text}</Txt> : null}
          {due && lexwareDraft ? " · " : null}
          {lexwareDraft ? t("mobile.invoices.detail.lexwareSynced") : null}
        </Txt>
      ) : null}
    </Pressable>
  );
}

function shortDate(iso: string): string {
  return format(parseISO(iso), "dd.MM.");
}

/** One honest status line per row, derived from dates + Lexware state. */
function dueLine(r: InvoiceRow): { text: string; color: string } | null {
  const muted = colors.neutral[500];
  if (r.status === "paid") {
    return r.paid_at
      ? { text: t("mobile.ui.invoices.paidOn", { date: shortDate(r.paid_at) }), color: muted }
      : null;
  }
  if (r.status === "draft") {
    if (r.lexware_sync_status === "synced") {
      return { text: t("mobile.invoices.detail.lexwareSynced"), color: muted };
    }
    if (r.lexware_sync_status === "failed") {
      return { text: t("mobile.ui.invoices.lexwareFailed"), color: colors.error[700] };
    }
    return r.issue_date
      ? { text: t("mobile.ui.invoices.issuedOn", { date: shortDate(r.issue_date) }), color: muted }
      : null;
  }
  if (r.status === "cancelled" || !r.due_date) return null;
  const days = differenceInCalendarDays(parseISO(r.due_date), new Date());
  if (days < 0) {
    return { text: t("mobile.ui.invoices.daysOverdue", { n: -days }), color: colors.error[700] };
  }
  if (days === 0) {
    return { text: t("mobile.ui.invoices.dueToday"), color: colors.warning[700] };
  }
  return {
    text: t("mobile.ui.invoices.dueIn", { date: shortDate(r.due_date), n: days }),
    color: muted,
  };
}

const styles = StyleSheet.create({
  forecastTop: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  row: { gap: 4, paddingVertical: 14, paddingHorizontal: spacing[4] },
  line: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
});

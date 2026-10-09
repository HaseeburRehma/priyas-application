/**
 * Invoice detail — read-only. Summary (open amount, dates, Lexware draft
 * state), parties, line items with totals, and a history built only
 * from timestamps the invoice really carries. No actions: marking paid,
 * sending and PDFs stay on the web app.
 */

import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { loadMobileInvoiceDetail, type InvoiceDetail as InvoiceDetailData } from "@/lib/invoices";
import {
  Card,
  CenterSpinner,
  Divider,
  EmptyState,
  KeyValue,
  NavHeader,
  Notice,
  Screen,
  SectionHeader,
  Txt,
} from "@/components/ui";
import { dfLocale, formatEUR, partialShare, StatusChip } from "@/components/invoice-bits";
import { colors, radius, spacing } from "@/lib/theme";
import { t } from "@/lib/i18n";

const qtyFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["invoiceDetail", id],
    queryFn: () => loadMobileInvoiceDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  const header = <NavHeader title={t("invoices.table.number")} onBack={() => router.back()} />;

  const d = query.data;
  if (query.isLoading) {
    return (
      <Screen edges={["top", "bottom"]} header={header} scroll={false}>
        <CenterSpinner />
      </Screen>
    );
  }
  if (!d) {
    return (
      <Screen edges={["top", "bottom"]} header={header} scroll={false}>
        <EmptyState
          icon="receipt"
          title={t("mobile.invoices.notFoundTitle")}
          subtitle={t("mobile.invoices.notFoundBody")}
        />
      </Screen>
    );
  }
  return (
    <Screen
      edges={["top", "bottom"]}
      header={header}
      refreshing={query.isFetching && !query.isLoading}
      onRefresh={() => query.refetch()}
    >
      <SummaryCard d={d} />
      <PartiesCard d={d} />
      <ItemsCard d={d} />
      <HistoryCard d={d} />
    </Screen>
  );
}

const fmtDate = (iso: string) => format(parseISO(iso), "dd.MM.yyyy");

/* -------------------------------- Summary -------------------------------- */

function SummaryCard({ d }: { d: InvoiceDetailData }) {
  const paid = d.paid_amount_cents ?? 0;
  const open = d.status === "sent" || d.status === "overdue";
  const amount = open ? Math.max(0, d.total_cents - paid) : d.total_cents;
  const amountColor =
    d.status === "overdue"
      ? colors.error[700]
      : d.status === "sent"
        ? colors.warning[700]
        : d.status === "paid"
          ? colors.success[700]
          : d.status === "cancelled"
            ? colors.neutral[500]
            : colors.secondary[500];
  const partial = partialShare(d);
  const dueDays =
    open && d.due_date ? differenceInCalendarDays(parseISO(d.due_date), new Date()) : null;

  const dates: Array<{ label: string; value: string; extra?: string; extraColor?: string }> = [];
  if (d.issue_date) dates.push({ label: t("invoices.table.issued"), value: fmtDate(d.issue_date) });
  if (d.due_date) {
    dates.push({
      label: t("invoices.table.due"),
      value: fmtDate(d.due_date),
      extra:
        dueDays == null
          ? undefined
          : dueDays < 0
            ? t("mobile.ui.invoices.daysOverdue", { n: -dueDays })
            : t("mobile.ui.invoices.daysShort", { n: dueDays }),
      extraColor: dueDays != null && dueDays < 0 ? colors.error[700] : undefined,
    });
  }
  if (d.paid_at) dates.push({ label: t("mobile.invoices.detail.paidAt"), value: fmtDate(d.paid_at) });
  if (d.period_start && d.period_end) {
    dates.push({
      label: t("mobile.invoices.detail.period"),
      value: `${format(parseISO(d.period_start), "dd.MM.")} – ${fmtDate(d.period_end)}`,
    });
  }

  return (
    <Card style={{ gap: spacing[3] }}>
      <View style={styles.summaryTop}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt v="overline" color={colors.neutral[500]}>
            {t("invoices.table.number")}
          </Txt>
          <Txt v="monoStrong" style={{ fontSize: 16, lineHeight: 22 }} numberOfLines={1}>
            {d.invoice_number ?? "—"}
          </Txt>
        </View>
        <StatusChip status={d.status} dot />
      </View>

      <View style={{ gap: 2 }}>
        <Txt v="subhead" color={colors.neutral[500]}>
          {open ? t("mobile.ui.invoices.openAmount") : t("mobile.ui.invoices.invoiceAmount")}
        </Txt>
        <Txt v="display" color={amountColor} numberOfLines={1} adjustsFontSizeToFit>
          {formatEUR(amount)}
        </Txt>
        {partial != null ? (
          <Txt v="caption" color={colors.neutral[500]}>
            {t("mobile.ui.invoices.partialPaid", {
              paid: formatEUR(paid),
              total: formatEUR(d.total_cents),
            })}
          </Txt>
        ) : null}
      </View>

      {dates.length > 0 ? (
        <View style={styles.dates}>
          {dates.map((x) => (
            <View key={x.label} style={styles.dateCol}>
              <Txt v="overline" color={colors.neutral[500]} numberOfLines={1}>
                {x.label}
              </Txt>
              <Txt v="subheadStrong" numberOfLines={1}>
                {x.value}
                {x.extra ? (
                  <Txt v="subheadStrong" color={x.extraColor ?? colors.neutral[900]}>
                    {` · ${x.extra}`}
                  </Txt>
                ) : null}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      <LexwareNotice d={d} />
    </Card>
  );
}

function LexwareNotice({ d }: { d: InvoiceDetailData }) {
  switch (d.lexware_sync_status) {
    case "synced":
      return (
        <Notice tone="success" icon="check">
          {t("mobile.ui.invoices.lexwareDraftNotice")}
        </Notice>
      );
    case "pending":
      return (
        <Notice tone="warning" icon="clock">
          {t("mobile.invoices.detail.notSynced")}
        </Notice>
      );
    case "failed":
      return (
        <Notice tone="error" icon="alert">
          {t("mobile.ui.invoices.lexwareFailed")}
        </Notice>
      );
    default:
      return null;
  }
}

/* -------------------------------- Parties -------------------------------- */

function PartiesCard({ d }: { d: InvoiceDetailData }) {
  const c = d.client;
  const clientAddress = c
    ? [c.address_line1, [c.postal_code, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : "";
  const places = d.properties ?? [];
  if (!c && places.length === 0) return null;
  return (
    <Card style={{ gap: spacing[3] }}>
      {c ? (
        <View style={{ gap: 2 }}>
          <Txt v="overline" color={colors.neutral[500]}>
            {t("mobile.ui.invoices.billTo")}
          </Txt>
          <Txt v="bodyStrong" color={colors.secondary[500]}>
            {c.display_name}
          </Txt>
          {clientAddress ? (
            <Txt v="subhead" color={colors.neutral[500]}>
              {clientAddress}
            </Txt>
          ) : null}
          {c.insurance_provider ? (
            <Txt v="subhead" color={colors.neutral[500]}>
              {c.insurance_provider}
            </Txt>
          ) : null}
        </View>
      ) : null}
      {places.length > 0 ? (
        <View style={{ gap: 2 }}>
          <Txt v="overline" color={colors.neutral[500]}>
            {t("mobile.ui.invoices.serviceLocation")}
          </Txt>
          {places.map((p) => (
            <View key={`${p.name}-${p.address}`} style={{ gap: 2 }}>
              <Txt v="bodyStrong" color={colors.secondary[500]}>
                {p.name}
              </Txt>
              {p.address ? (
                <Txt v="subhead" color={colors.neutral[500]}>
                  {p.address}
                </Txt>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/* --------------------------------- Items --------------------------------- */

function ItemsCard({ d }: { d: InvoiceDetailData }) {
  const itemsSum = d.items.reduce((s, i) => s + i.total_cents, 0);
  const subtotal = d.subtotal_cents && d.subtotal_cents > 0 ? d.subtotal_cents : itemsSum;
  const tax = d.tax_cents ?? 0;
  const rates = Array.from(
    new Set(d.items.map((i) => i.tax_rate).filter((r): r is number => r != null && r > 0)),
  );
  const taxLabel =
    rates.length === 1
      ? t("invoices.detail.tax", { rate: qtyFmt.format(rates[0]!) })
      : t("invoices.draftEditor.vat");
  const sub = [
    d.period_start ? format(parseISO(d.period_start), "LLLL yyyy", { locale: dfLocale() }) : null,
    t("mobile.ui.invoices.itemsCount", { n: d.items.length }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card style={{ gap: spacing[2] }}>
      <SectionHeader title={t("invoices.detail.items")} subtitle={sub} />
      {d.items.length === 0 ? (
        <Txt v="subhead" color={colors.neutral[500]}>
          {t("mobile.invoices.detail.itemsEmpty")}
        </Txt>
      ) : (
        <View>
          {d.items.map((item) => (
            <View key={item.id}>
              <Divider />
              <View style={styles.item}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt v="subheadStrong" numberOfLines={2}>
                    {item.description}
                  </Txt>
                  <Txt v="mono" color={colors.neutral[500]}>
                    {`${qtyFmt.format(item.quantity)} × ${formatEUR(item.unit_price_cents)}`}
                  </Txt>
                </View>
                <Txt v="mono" color={colors.neutral[900]}>
                  {formatEUR(item.total_cents)}
                </Txt>
              </View>
            </View>
          ))}
          <Divider />
          <View style={{ paddingTop: 4 }}>
            <KeyValue label={t("invoices.detail.subtotal")} value={formatEUR(subtotal)} mono />
            {tax > 0 ? <KeyValue label={taxLabel} value={formatEUR(tax)} mono /> : null}
          </View>
        </View>
      )}
      <View style={styles.totalBar}>
        <Txt v="overline" color={colors.white}>
          {t("invoices.detail.total")}
        </Txt>
        <Txt v="monoStrong" color={colors.white} style={{ fontSize: 16, lineHeight: 22 }}>
          {formatEUR(d.total_cents)}
        </Txt>
      </View>
    </Card>
  );
}

/* -------------------------------- History -------------------------------- */

function HistoryCard({ d }: { d: InvoiceDetailData }) {
  type Ev = { key: string; at: string; title: string; sub?: string | null; color: string };
  const evs: Ev[] = [];
  for (const p of d.payments ?? []) {
    evs.push({
      key: `pay-${p.id}`,
      at: p.paid_at,
      title: t("mobile.ui.invoices.evPayment", { amount: formatEUR(p.amount_cents) }),
      sub: p.method,
      color: colors.success[500],
    });
  }
  if (d.paid_at && (d.payments ?? []).length === 0) {
    evs.push({
      key: "paid",
      at: d.paid_at,
      title: t("invoices.detail.markPaidSuccess"),
      color: colors.success[500],
    });
  }
  if (d.email_sent_at) {
    evs.push({
      key: "mail",
      at: d.email_sent_at,
      title: t("mobile.ui.invoices.evEmailSent"),
      sub: d.email_recipient,
      color: colors.secondary[500],
    });
  }
  if (d.lexware_sync_status === "synced" && d.lexware_last_attempt_at) {
    evs.push({
      key: "lexware",
      at: d.lexware_last_attempt_at,
      title: t("invoices.detail.syncSuccess"),
      color: colors.primary[500],
    });
  }
  if (d.created_at) {
    evs.push({
      key: "created",
      at: d.created_at,
      title: t("mobile.ui.invoices.evCreated"),
      color: colors.neutral[400],
    });
  }
  if (evs.length === 0) return null;
  evs.sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Card style={{ gap: spacing[3] }}>
      <SectionHeader title={t("invoices.detail.activityTitle")} />
      <View style={{ gap: spacing[3] }}>
        {evs.map((e) => (
          <View key={e.key} style={styles.ev}>
            <View style={[styles.evDot, { borderColor: e.color }]} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt v="subheadStrong">{e.title}</Txt>
              <Txt v="caption" color={colors.neutral[500]} numberOfLines={1}>
                {[format(parseISO(e.at), "dd.MM. · HH:mm"), e.sub].filter(Boolean).join(" · ")}
              </Txt>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  summaryTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  dates: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing[5], rowGap: spacing[2] },
  dateCol: { gap: 2 },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  totalBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary[900],
  },
  ev: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  evDot: {
    width: 12,
    height: 12,
    marginTop: 3,
    borderRadius: 6,
    borderWidth: 2.5,
    backgroundColor: colors.white,
  },
});

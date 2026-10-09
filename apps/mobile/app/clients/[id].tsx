/**
 * Client detail screen — Figma "Kunde" (frame 07).
 *
 * Hero card (avatar, badges, meta, 4 stats, call / mail / SMS actions),
 * tabs (Übersicht · Objekte · Vertrag · Rechnungen) and, on the overview,
 * the internal hours card (non-Alltagshilfe), contacts, service scope,
 * key information and the internal note. Read-only: editing lives on the
 * web wizard.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  differenceInMonths,
  format,
  formatDistanceToNowStrict,
  parseISO,
} from "date-fns";
import { de, enUS, ta } from "date-fns/locale";
import {
  loadMobileClientDetail,
  loadMobileClientOverview,
  type ClientBilling,
  type ClientContact,
  type ClientHoursMonth,
  type ClientOverview,
  type ClientScope,
  type ClientStatus,
} from "@/lib/clients";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CenterSpinner,
  Divider,
  EmptyState,
  Grid,
  HALF,
  Icon,
  IconChip,
  KeyValue,
  ListRow,
  NavHeader,
  ProgressBar,
  RoundButton,
  Screen,
  SectionHeader,
  TabsRow,
  Txt,
  toneFor,
  type IconName,
  type Tone,
} from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { can } from "@/lib/rbac";
import { colors, radius, spacing } from "@/lib/theme";
import { i18n, t } from "@/lib/i18n";

type TabKey = "overview" | "properties" | "contract" | "invoices";

function dfLocale() {
  return i18n.locale === "en" ? enUS : i18n.locale === "ta" ? ta : de;
}

const eur2 = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

const eur0 = (cents: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

/** "12,4k €" above 10.000 €, otherwise the full amount. */
function eurCompact(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 10_000) {
    return `${(v / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}k €`;
  }
  return eur0(cents);
}

function formatHours(h: number): string {
  return `${(Math.round(h * 100) / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} h`;
}

/** "2026-08-01" → "01.08.2026" without timezone shifts. */
function dmy(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : null;
}

/** Whole days from today until `endIso`; negative once passed (web parity). */
function daysUntil(endIso: string): number {
  const [y, m, d] = endIso.slice(0, 10).split("-").map(Number);
  const end = Date.UTC(y!, m! - 1, d!);
  const today = new Date();
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((end - now) / 86_400_000);
}

function openMaps(address: string) {
  const q = encodeURIComponent(address);
  const native = Platform.OS === "ios" ? `maps:0,0?q=${q}` : `geo:0,0?q=${q}`;
  Linking.openURL(native).catch(() => Linking.openURL(`https://maps.google.com/?q=${q}`));
}

const STATUS_TONE: Record<ClientStatus, Tone> = {
  active: "success",
  review: "warning",
  onboarding: "info",
  ended: "neutral",
};

const INVOICE_TONE: Record<string, Tone> = {
  paid: "success",
  sent: "info",
  overdue: "error",
  draft: "neutral",
  cancelled: "neutral",
};

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const role = profile?.role ?? null;
  const [tab, setTab] = useState<TabKey>("overview");

  const detailQuery = useQuery({
    queryKey: ["clientDetail", id],
    queryFn: () => loadMobileClientDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  const d = detailQuery.data;
  const propertyIds = useMemo(() => (d?.properties ?? []).map((p) => p.id), [d]);
  const isAlltags = d?.customer_type === "alltagshilfe";

  const overviewQuery = useQuery<ClientOverview>({
    queryKey: ["clientOverview", id, propertyIds.join(",")],
    queryFn: () =>
      loadMobileClientOverview(id!, { propertyIds, withHours: !isAlltags }),
    enabled: !!id && !!d,
    staleTime: 30_000,
  });

  const call = useCallback((phone: string) => {
    Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`);
  }, []);
  const email = useCallback((addr: string) => {
    Linking.openURL(`mailto:${addr}`);
  }, []);
  const sms = useCallback((phone: string) => {
    Linking.openURL(`sms:${phone.replace(/[^\d+]/g, "")}`);
  }, []);

  const navHeader = <NavHeader title={t("clients.table.client")} />;

  if (detailQuery.isLoading) {
    return (
      <Screen scroll={false} header={navHeader}>
        <CenterSpinner />
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen scroll={false} header={navHeader}>
        <EmptyState
          icon="users"
          title={t("mobile.clients.notFoundTitle")}
          subtitle={t("mobile.clients.notFoundBody")}
        />
      </Screen>
    );
  }

  const o = overviewQuery.data;
  const canInvoices = can(role, "invoice.read");
  const canPlanShift = can(role, "shift.create");

  const status: ClientStatus | null = d.archived
    ? "ended"
    : o
      ? o.contract
        ? o.contract.status === "active"
          ? "active"
          : o.contract.status === "draft"
            ? "onboarding"
            : "ended"
        : "review"
      : null;
  const isNew =
    !!o?.created_at && Date.now() - new Date(o.created_at).getTime() < 30 * 86_400_000;
  const address = [
    d.address_line1,
    [d.postal_code, d.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const typeLabel = t(`mobile.clients.filter.${d.customer_type}`);

  // Contacts: the client_contacts table, or the client's own contact
  // fields when no separate contacts were captured.
  const contacts: ClientContact[] =
    o && o.contacts.length > 0
      ? o.contacts
      : o && (o.contact_name || d.email || d.phone)
        ? [
            {
              id: "client",
              full_name: o.contact_name ?? d.display_name,
              role: null,
              email: d.email,
              phone: d.phone,
              is_primary: true,
            },
          ]
        : [];

  const tabs: { value: TabKey; label: string; count?: number }[] = [
    { value: "overview", label: t("clients.detail.tabOverview") },
    { value: "properties", label: t("clients.detail.tabProperties"), count: d.properties.length },
    { value: "contract", label: t("clients.detail.tabContract") },
  ];
  if (canInvoices) {
    tabs.push({
      value: "invoices",
      label: t("mobile.ui.clients.detail.tabInvoices"),
      count: o?.invoices.length,
    });
  }

  return (
    <Screen
      header={navHeader}
      refreshing={detailQuery.isRefetching || overviewQuery.isRefetching}
      onRefresh={() => {
        void detailQuery.refetch();
        void overviewQuery.refetch();
      }}
    >
      {/* ------------------------------ Hero ------------------------------ */}
      <Card elevation="md" style={{ gap: 14 }}>
        <View style={styles.heroTop}>
          <View style={styles.avatarRing}>
            <Avatar
              name={d.display_name}
              size={60}
              tone={isAlltags ? "red" : toneFor(d.display_name)}
            />
          </View>
          <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
            <Txt v="title" color={colors.secondary[500]} numberOfLines={2}>
              {d.display_name}
            </Txt>
            <View style={styles.badges}>
              {isNew ? <Badge label={t("clients.detail.newBadge")} tone="brand" dot={false} /> : null}
              {isAlltags ? (
                <Badge label={t("mobile.clients.tagAlltagshilfe")} tone="error" dot={false} />
              ) : null}
              {status ? (
                <Badge label={t(`mobile.ui.clients.status.${status}`)} tone={STATUS_TONE[status]} />
              ) : null}
            </View>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Meta icon="building">
            {[o?.contract?.legal_form, typeLabel].filter(Boolean).join(" · ")}
          </Meta>
          {address ? (
            <Meta icon="map-pin" onPress={() => openMaps(address)}>
              {address}
            </Meta>
          ) : null}
          {o?.created_at ? (
            <Meta icon="clock">
              {t("clients.detail.clientSince", {
                date: format(parseISO(o.created_at), "PPP", { locale: dfLocale() }),
              })}
            </Meta>
          ) : null}
        </View>

        <Divider />

        <View style={styles.heroStats}>
          <HeroStat value={String(d.properties.length)} label={t("mobile.ui.clients.detail.statProperties")} />
          <HeroStat value={o ? String(contacts.length) : "—"} label={t("mobile.ui.clients.detail.statContacts")} />
          <HeroStat value={o ? String(o.shift_count) : "—"} label={t("mobile.ui.clients.detail.statShifts")} />
          <HeroStat
            value={o && canInvoices ? eurCompact(o.ytd_invoiced_cents) : "—"}
            label={t("mobile.ui.clients.detail.statYtd")}
          />
        </View>

        {d.phone || d.email || canPlanShift ? (
          <View style={styles.heroActions}>
            {d.phone ? (
              <RoundButton
                icon="phone"
                variant="subtle"
                size={44}
                accessibilityLabel={t("mobile.ui.clients.detail.call")}
                onPress={() => call(d.phone!)}
              />
            ) : null}
            {d.email ? (
              <RoundButton
                icon="mail"
                variant="subtle"
                size={44}
                accessibilityLabel={t("mobile.ui.clients.detail.mail")}
                onPress={() => email(d.email!)}
              />
            ) : null}
            {d.phone ? (
              <RoundButton
                icon="chat"
                variant="subtle"
                size={44}
                accessibilityLabel={t("mobile.ui.clients.detail.sms")}
                onPress={() => sms(d.phone!)}
              />
            ) : null}
            {canPlanShift ? (
              <Button
                label={t("mobile.ui.clients.detail.planShift")}
                icon="calendar"
                size="md"
                style={{ flex: 1, minHeight: 44 }}
                onPress={() => router.push("/(tabs)/schedule/new")}
              />
            ) : null}
          </View>
        ) : null}
      </Card>

      <TabsRow options={tabs} value={tab} onChange={setTab} />

      {overviewQuery.isLoading && tab !== "properties" ? <CenterSpinner /> : null}

      {/* ---------------------------- Overview ---------------------------- */}
      {tab === "overview" ? (
        <>
          {o && !isAlltags && o.billing && o.hours.length > 0 ? (
            <HoursCard billing={o.billing} months={o.hours} />
          ) : null}

          {contacts.length > 0 ? (
            <Card style={{ gap: spacing[3] }}>
              <SectionHeader
                title={t("clients.contacts.title")}
                subtitle={t("mobile.ui.clients.contacts.count", { count: contacts.length })}
              />
              {contacts.map((c) => (
                <View key={c.id} style={styles.contactRow}>
                  <Avatar name={c.full_name} size={40} />
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <View style={styles.contactName}>
                      <Txt v="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {c.full_name}
                      </Txt>
                      {c.is_primary ? (
                        <Badge label={t("mobile.ui.clients.contacts.primary")} tone="brand" dot={false} />
                      ) : null}
                    </View>
                    {c.role ? (
                      <Txt v="caption" color={colors.neutral[500]} numberOfLines={1}>
                        {c.role}
                      </Txt>
                    ) : null}
                  </View>
                  {c.email ? (
                    <RoundButton
                      icon="mail"
                      size={36}
                      accessibilityLabel={t("mobile.ui.clients.detail.mail")}
                      onPress={() => email(c.email!)}
                    />
                  ) : null}
                  {c.phone ? (
                    <RoundButton
                      icon="phone"
                      size={36}
                      accessibilityLabel={t("mobile.ui.clients.detail.call")}
                      onPress={() => call(c.phone!)}
                    />
                  ) : null}
                </View>
              ))}
            </Card>
          ) : null}

          {o && o.scopes.length > 0 ? <ScopeCard scopes={o.scopes} /> : null}

          {o ? (
            <Card style={{ paddingVertical: spacing[2] }}>
              <KeyInfoRows
                rows={keyInfo(d, o)}
              />
            </Card>
          ) : null}

          {d.notes ? (
            <View style={styles.note}>
              <View style={styles.noteTitle}>
                <Icon name="alert" size={16} color={colors.warning[700]} />
                <Txt v="subheadStrong" color={colors.warning[700]}>
                  {t("mobile.ui.clients.note.title")}
                </Txt>
              </View>
              <Txt v="subhead" color={colors.neutral[800]}>
                {d.notes}
              </Txt>
              {o?.notes_updated_at ? (
                <Txt v="caption" color={colors.neutral[500]}>
                  {`— ${[
                    o.notes_updated_by_name,
                    formatDistanceToNowStrict(new Date(o.notes_updated_at), {
                      addSuffix: true,
                      locale: dfLocale(),
                    }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}`}
                </Txt>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      {/* ---------------------------- Properties -------------------------- */}
      {tab === "properties" ? (
        <Card padded={false}>
          {d.properties.length === 0 ? (
            <Txt v="subhead" color={colors.neutral[500]} style={styles.emptyLine}>
              {t("mobile.clients.detail.propertiesEmpty")}
            </Txt>
          ) : (
            d.properties.map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={p.name}
                  subtitle={p.city}
                  leading={<IconChip icon="building" tone="info" size={36} />}
                  onPress={() =>
                    router.push({ pathname: "/properties/[id]", params: { id: p.id } })
                  }
                />
              </View>
            ))
          )}
        </Card>
      ) : null}

      {/* ----------------------------- Contract --------------------------- */}
      {tab === "contract" && o ? <ContractCard overview={o} status={status} /> : null}

      {/* ----------------------------- Invoices --------------------------- */}
      {tab === "invoices" && o && canInvoices ? (
        <Card padded={false}>
          {o.invoices.length === 0 ? (
            <Txt v="subhead" color={colors.neutral[500]} style={styles.emptyLine}>
              {t("mobile.ui.clients.detail.invoicesEmpty")}
            </Txt>
          ) : (
            o.invoices.map((inv, i) => (
              <View key={inv.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={inv.invoice_number ?? t("mobile.invoices.status.draft")}
                  subtitle={dmy(inv.issue_date)}
                  leading={<IconChip icon="file-text" tone="info" size={36} />}
                  trailing={
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Txt v="monoStrong" color={colors.neutral[900]}>
                        {eur2(inv.total_cents)}
                      </Txt>
                      <Badge
                        label={t(`mobile.invoices.status.${inv.status}`, { defaultValue: inv.status })}
                        tone={INVOICE_TONE[inv.status] ?? "neutral"}
                        dot={false}
                      />
                    </View>
                  }
                  onPress={() =>
                    router.push({ pathname: "/invoices/[id]", params: { id: inv.id } })
                  }
                />
              </View>
            ))
          )}
        </Card>
      ) : null}
    </Screen>
  );
}

/* --------------------------------- Bits --------------------------------- */

function Meta({
  icon,
  children,
  onPress,
}: {
  icon: IconName;
  children: ReactNode;
  onPress?: () => void;
}) {
  const body = (
    <View style={styles.meta}>
      <Icon name={icon} size={16} color={colors.neutral[400]} />
      <Txt v="subhead" color={colors.neutral[600]} numberOfLines={1} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} hitSlop={4} accessibilityRole="link">
      {body}
    </Pressable>
  ) : (
    body
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Txt v="headline" color={colors.secondary[500]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
      <Txt v="overline" color={colors.neutral[500]} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

type InfoRow = { label: string; value: string; mono?: boolean };

function KeyInfoRows({ rows }: { rows: InfoRow[] }) {
  return (
    <>
      {rows.map((r, i) => (
        <View key={r.label}>
          {i > 0 ? <Divider /> : null}
          <KeyValue label={r.label} value={r.value} mono={r.mono} />
        </View>
      ))}
    </>
  );
}

function keyInfo(
  d: NonNullable<Awaited<ReturnType<typeof loadMobileClientDetail>>>,
  o: ClientOverview,
): InfoRow[] {
  const rows: InfoRow[] = [
    {
      label: t("mobile.ui.clients.info.clientId"),
      value: o.customer_number ?? `CLT-${d.id.slice(0, 8).toUpperCase()}`,
      mono: true,
    },
  ];
  if (o.company_name && o.company_name !== d.display_name) {
    rows.push({ label: t("mobile.ui.clients.info.companyName"), value: o.company_name });
  }
  if (o.contract?.legal_form) {
    rows.push({ label: t("mobile.ui.clients.info.legalForm"), value: o.contract.legal_form });
  }
  const vat = o.vat_id ?? o.tax_id;
  if (vat) rows.push({ label: t("mobile.ui.clients.info.vatId"), value: vat, mono: true });
  const start = dmy(o.contract?.start_date ?? o.billing?.contract_start);
  if (start) rows.push({ label: t("mobile.ui.clients.info.contractStart"), value: start });
  const term = termMonths(o);
  if (term != null) {
    rows.push({ label: t("mobile.ui.clients.info.term"), value: t("mobile.ui.clients.info.months", { n: term }) });
  }
  const notice = o.contract?.notice_period_days;
  if (notice != null) {
    rows.push({
      label: t("mobile.ui.clients.info.notice"),
      value:
        notice % 30 === 0
          ? t("mobile.ui.clients.info.months", { n: notice / 30 })
          : t("mobile.ui.clients.info.days", { n: notice }),
    });
  }
  if (d.customer_type === "alltagshilfe") {
    rows.push({
      label: t("mobile.clients.detail.insuranceProvider"),
      value: d.insurance_provider ?? "—",
    });
    rows.push({
      label: t("mobile.clients.detail.insuranceNumber"),
      value: d.insurance_number ?? "—",
      mono: true,
    });
    rows.push({
      label: t("mobile.clients.detail.careLevel"),
      value: d.care_level != null ? String(d.care_level) : "—",
    });
  }
  if (d.payer_type) {
    rows.push({
      label: t("mobile.ui.clients.info.payer"),
      value: t(`mobile.clients.payer.${d.payer_type}`),
    });
  }
  return rows;
}

/** Contract term in months: billing setting first, else the contract dates. */
function termMonths(o: ClientOverview): number | null {
  if (o.billing?.contract_months) return o.billing.contract_months;
  const c = o.contract;
  if (c?.start_date && c.end_date) {
    return differenceInMonths(addDays(parseISO(c.end_date), 1), parseISO(c.start_date));
  }
  return null;
}

/* ------------------------------ Hours card ------------------------------ */

/**
 * Internal hours overview — mirrors the web `ClientHoursCard`. Fixed
 * contracts compare delivered hours with the contracted hours/month and
 * show the effective hourly rate the flat fee works out to; months
 * outside contract_start..contract_end show "—". Hourly clients show
 * delivered vs. planned and what the delivered hours are worth.
 */
function HoursCard({ billing, months }: { billing: ClientBilling; months: ClientHoursMonth[] }) {
  const isFixed = billing.mode === "fixed";
  const contracted = billing.contracted_hours_per_month ?? 0;
  const fee = billing.fixed_monthly_fee_cents;
  const daysLeft = billing.contract_end ? daysUntil(billing.contract_end) : null;
  const startMonth = billing.contract_start?.slice(0, 7) ?? null;
  const endMonth = billing.contract_end?.slice(0, 7) ?? null;
  const inContract = (month: string) =>
    (!startMonth || month >= startMonth) && (!endMonth || month <= endMonth);

  const mode = isFixed
    ? t("mobile.ui.clients.hours.modeFixed", { fee: eur0(fee ?? 0) })
    : billing.hourly_rate_cents != null
      ? t("mobile.ui.clients.hours.modeHourly", { rate: eur2(billing.hourly_rate_cents) })
      : t("mobile.ui.clients.hours.modeHourlyNoRate");

  const termTone =
    daysLeft != null && daysLeft < 0
      ? { bg: colors.error[50], fg: colors.error[700] }
      : daysLeft != null && daysLeft <= 30
        ? { bg: colors.warning[50], fg: colors.warning[700] }
        : { bg: colors.neutral[50], fg: colors.neutral[600] };

  return (
    <Card style={{ gap: spacing[3] }}>
      <View style={styles.hoursHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="headline">{t("mobile.ui.clients.hours.title")}</Txt>
          <Txt v="subhead" color={colors.neutral[500]}>
            {t("mobile.ui.clients.hours.subtitle")}
          </Txt>
        </View>
        <Badge label={mode} tone="neutral" dot={false} />
      </View>

      {isFixed && billing.contract_start && billing.contract_end ? (
        <View style={[styles.term, { backgroundColor: termTone.bg }]}>
          <Txt v="caption" color={termTone.fg}>
            {t("mobile.ui.clients.hours.term", {
              start: dmy(billing.contract_start) ?? "—",
              end: dmy(billing.contract_end) ?? "—",
              months: billing.contract_months ?? 0,
            })}
            {daysLeft == null
              ? ""
              : ` · ${
                  daysLeft < 0
                    ? t("mobile.ui.clients.hours.expiredAgo", { days: -daysLeft })
                    : daysLeft === 0
                      ? t("mobile.ui.clients.hours.endsToday")
                      : t("mobile.ui.clients.hours.endsIn", { days: daysLeft })
                }`}
          </Txt>
        </View>
      ) : null}

      {months.map((m, i) => {
        const actualH = m.actualMinutes / 60;
        const plannedH = m.plannedMinutes / 60;
        const covered = isFixed && inContract(m.month);
        const diff = actualH - contracted;
        const effective =
          covered && actualH > 0 && fee ? Math.round(fee / actualH) : null;
        const [y, mo] = m.month.split("-");
        const over = covered && diff > 0.01;
        const compareTo = covered && contracted > 0 ? contracted : plannedH;
        return (
          <View key={m.month} style={{ gap: 8 }}>
            <Divider />
            <View style={styles.monthLine}>
              <Txt v="monoStrong" color={colors.neutral[900]}>
                {`${mo}/${y}`}
              </Txt>
              {i === 0 ? (
                <Txt v="caption" color={colors.neutral[400]}>
                  {t("mobile.ui.clients.hours.running")}
                </Txt>
              ) : null}
              {isFixed ? (
                <Txt v="mono" color={colors.neutral[400]} style={{ flexShrink: 1 }} numberOfLines={1}>
                  <Txt
                    v="mono"
                    color={
                      !covered
                        ? colors.neutral[400]
                        : diff > 0.01
                          ? colors.error[700]
                          : diff < -0.01
                            ? colors.warning[700]
                            : colors.neutral[600]
                    }
                  >
                    {covered
                      ? `${diff > 0.01 ? "+" : diff < -0.01 ? "−" : ""}${formatHours(Math.abs(diff))}`
                      : "—"}
                  </Txt>
                  {" · "}
                  <Txt v="mono" color={colors.neutral[700]}>
                    {effective != null ? `${eur2(effective)}/h` : "—"}
                  </Txt>
                </Txt>
              ) : billing.hourly_rate_cents != null ? (
                <Txt v="mono" color={colors.neutral[700]}>
                  {eur2(Math.round(actualH * billing.hourly_rate_cents))}
                </Txt>
              ) : null}
            </View>
            <View style={styles.monthBar}>
              <View style={{ flex: 1 }}>
                <ProgressBar
                  value={compareTo > 0 ? actualH / compareTo : 0}
                  tone={over ? "error" : "brand"}
                />
              </View>
              <Txt v="caption" color={colors.neutral[600]}>
                {`${formatHours(actualH)} / ${compareTo > 0 ? formatHours(compareTo) : "—"}`}
              </Txt>
            </View>
          </View>
        );
      })}

      <Txt v="caption" color={colors.neutral[500]}>
        {isFixed ? t("mobile.ui.clients.hours.footnoteFixed") : t("mobile.ui.clients.hours.footnoteHourly")}
      </Txt>
    </Card>
  );
}

/* ------------------------------ Scope card ------------------------------ */

function scopeIcon(type: string): IconName {
  const s = type.toLowerCase();
  if (s.includes("window") || s.includes("fenster")) return "eye";
  if (s.includes("waste") || s.includes("abfall")) return "upload";
  if (s.includes("carpet") || s.includes("deep") || s.includes("teppich")) return "droplet";
  if (s.includes("sanit")) return "shield";
  if (s.includes("emergency") || s.includes("notfall")) return "alert";
  return "check";
}

const humanize = (s: string) => {
  const x = s.replace(/[_-]+/g, " ").trim();
  return x.charAt(0).toUpperCase() + x.slice(1);
};

function ScopeCard({ scopes }: { scopes: ClientScope[] }) {
  return (
    <Card style={{ gap: spacing[3] }}>
      <SectionHeader
        title={t("mobile.ui.clients.scope.title")}
        subtitle={t("mobile.ui.clients.scope.subtitle")}
      />
      <Grid gap={spacing[2]}>
        {scopes.map((s) => {
          const freq = s.frequency
            ? t(`mobile.ui.clients.scope.freq.${s.frequency}`, { defaultValue: humanize(s.frequency) })
            : null;
          return (
            <View key={s.id} style={[HALF, styles.scopeTile]}>
              <View style={styles.scopeIcon}>
                <Icon name={scopeIcon(s.service_type)} size={16} color={colors.primary[600]} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="subheadStrong" numberOfLines={1}>
                  {t(`mobile.ui.clients.scope.types.${s.service_type}`, {
                    defaultValue: humanize(s.service_type),
                  })}
                </Txt>
                <Txt v="caption" color={colors.neutral[500]} numberOfLines={1}>
                  {[freq, s.special_notes].filter(Boolean).join(" · ") || "—"}
                </Txt>
              </View>
            </View>
          );
        })}
      </Grid>
    </Card>
  );
}

/* ----------------------------- Contract card ---------------------------- */

function ContractCard({ overview: o, status }: { overview: ClientOverview; status: ClientStatus | null }) {
  const c = o.contract;
  const b = o.billing;
  const rows: InfoRow[] = [];
  if (c?.start_date || b?.contract_start) {
    rows.push({
      label: t("mobile.ui.clients.info.contractStart"),
      value: dmy(c?.start_date ?? b?.contract_start) ?? "—",
    });
  }
  const end = c?.end_date ?? b?.contract_end;
  if (end) rows.push({ label: t("mobile.ui.clients.info.contractEnd"), value: dmy(end) ?? "—" });
  const term = termMonths(o);
  if (term != null) {
    rows.push({ label: t("mobile.ui.clients.info.term"), value: t("mobile.ui.clients.info.months", { n: term }) });
  }
  if (c?.notice_period_days != null) {
    rows.push({
      label: t("mobile.ui.clients.info.notice"),
      value:
        c.notice_period_days % 30 === 0
          ? t("mobile.ui.clients.info.months", { n: c.notice_period_days / 30 })
          : t("mobile.ui.clients.info.days", { n: c.notice_period_days }),
    });
  }
  if (c?.legal_form) rows.push({ label: t("mobile.ui.clients.info.legalForm"), value: c.legal_form });
  if (b) {
    rows.push({
      label: t("mobile.ui.clients.info.billing"),
      value:
        b.mode === "fixed"
          ? t("mobile.ui.clients.hours.modeFixedMonthly", { fee: eur0(b.fixed_monthly_fee_cents ?? 0) })
          : b.hourly_rate_cents != null
            ? t("mobile.ui.clients.hours.modeHourly", { rate: eur2(b.hourly_rate_cents) })
            : t("mobile.ui.clients.hours.modeHourlyNoRate"),
    });
    if (b.mode === "fixed" && b.contracted_hours_per_month != null) {
      rows.push({
        label: t("mobile.ui.clients.info.contractedHours"),
        value: formatHours(b.contracted_hours_per_month),
      });
    }
  }

  if (!c && rows.length === 0) {
    return (
      <Card>
        <Txt v="subhead" color={colors.neutral[500]} style={styles.emptyLine}>
          {t("mobile.ui.clients.info.noContract")}
        </Txt>
      </Card>
    );
  }

  return (
    <Card style={{ gap: spacing[2] }}>
      <View style={styles.hoursHead}>
        <Txt v="headline" style={{ flex: 1 }}>
          {t("clients.detail.tabContract")}
        </Txt>
        {status ? (
          <Badge label={t(`mobile.ui.clients.status.${status}`)} tone={STATUS_TONE[status]} />
        ) : null}
      </View>
      <View>
        <KeyInfoRows rows={rows} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  avatarRing: {
    padding: 3,
    borderRadius: 40,
    backgroundColor: colors.primary[100],
  },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroStats: { flexDirection: "row" },
  heroStat: { flex: 1, alignItems: "center", gap: 2, minWidth: 0 },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  emptyLine: { textAlign: "center", padding: spacing[4] },
  contactRow: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  contactName: { flexDirection: "row", alignItems: "center", gap: 6 },
  hoursHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing[2] },
  term: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md },
  monthLine: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  monthBar: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  scopeTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary[100],
    backgroundColor: colors.primary[50],
  },
  scopeIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  note: {
    gap: 6,
    padding: spacing[4],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.warning[300],
    backgroundColor: colors.warning[50],
  },
  noteTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
});

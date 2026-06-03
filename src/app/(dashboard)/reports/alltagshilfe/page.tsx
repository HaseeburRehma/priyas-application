import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  loadAlltagshilfeMonthly,
  type AlltagshilfeRow,
  type AlltagshilfeEmployeeSummary,
  type AlltagshilfeDelivery,
} from "@/lib/api/alltagshilfe";
import { can } from "@/lib/rbac/permissions";
import {
  asAppLocale,
  type AppLocale,
  formatCurrencyCents,
  formatDateTime,
  formatPattern,
} from "@/lib/utils/i18n-format";
import { routes } from "@/lib/constants/routes";
import { SendMonthlyReportButton } from "@/components/reports/SendMonthlyReportButton";

export const metadata: Metadata = { title: "Alltagshilfe — Monatsbericht" };
export const dynamic = "force-dynamic";

type SearchParams = { month?: string; year?: string };

/**
 * 16-alltagshilfe-report.html — monthly billing report for the
 * Alltagshilfe service area. Generates the per-client + per-employee
 * hours breakdown so management can manually invoice the German
 * healthcare insurers (the spec explicitly says insurance, not the
 * customer, pays).
 *
 * Page composition:
 *   1. Banner with creation metadata (red theme matches Everyday
 *      Help / care colour family).
 *   2. KPI strip (hours, customers, staff, billing amount).
 *   3. Per-client breakdown — each client gets a pink header row with
 *      care-level pill + insurance pill, then nested staff rows.
 *   4. Hours-per-employee summary — cross-client roll-up.
 *   5. Delivery panel — last send status / next run / Resend +
 *      Create-manual-invoice actions.
 *   6. Footer line that mirrors the prototype's "automatically generated"
 *      explainer so the recipient knows what they're looking at.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!(await can("report.alltagshilfe.view"))) redirect(routes.reports);

  const t = await getTranslations("alltagshilfeReport");
  const locale = asAppLocale(await getLocale());
  const formatEUR = (cents: number) => formatCurrencyCents(cents, locale);
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year ?? now.getFullYear());
  const month = Number(sp.month ?? now.getMonth());
  const report = await loadAlltagshilfeMonthly(year, month, locale);

  // Locale-aware short month name via date-fns ("MMM"). The date itself
  // is anchored to the 1st so the year/month decode is deterministic
  // regardless of the current day (avoids Feb-29 → Mar-01 surprises).
  const monthShort = (m: number, y: number = year): string =>
    formatPattern(new Date(y, m, 1), "MMM", locale);
  const monthLabel = `${monthShort(month)} ${year}`;

  // Europe/Berlin alternates between CET (MEZ) and CEST (MESZ). Use
  // Intl.DateTimeFormat's `timeZoneName: 'short'` rendered in German so
  // the abbreviation matches what German users expect.
  const tzAbbrev = (() => {
    const parts = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "MEZ";
  })();

  const nextRunDate = new Date(report.nextRunAt);
  const nextRunLabel = `${formatPattern(nextRunDate, "d. LLL", locale)} · 06:00 ${tzAbbrev}`;
  const reportCreatedLabel = `${formatDateTime(new Date(), locale)} · ${tzAbbrev}`;
  const eomLabel = formatPattern(
    new Date(year, month + 1, 1),
    "dd MMM yyyy",
    locale,
  );

  const periodHasData = report.rows.length > 0;
  const alreadySent = report.latestDelivery?.status === "sent";

  return (
    <>
      {/* Breadcrumb */}
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <Link href={routes.reports} className="hover:text-neutral-700">
          {t("breadcrumbReports")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbCurrent")}</span>
      </nav>

      {/* Banner */}
      <section className="mb-6 rounded-lg border-l-4 border-error-500 bg-error-50/40 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-md bg-error-500 text-white">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
            </svg>
          </span>
          <div className="flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-error-700">
              {t("bannerTag")}
            </div>
            <p className="mt-1 max-w-2xl text-[13px] leading-[1.5] text-neutral-700">
              <strong>{t("bannerStrong")}</strong> {t("bannerBody")}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
              {t("createdAt")}
            </div>
            <div className="font-mono text-[12px] text-neutral-700">
              {reportCreatedLabel}
            </div>
          </div>
        </div>
      </section>

      {/* Page head */}
      <div className="mb-5">
        <h1 className="flex items-center gap-3 text-[24px] font-bold text-error-700">
          {t("title")}
          <span className="rounded-md bg-error-50 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.04em]">
            {monthLabel}
          </span>
        </h1>
        <p className="mt-1 text-[13px] text-neutral-600">
          {t("subtitle")} · {t("statusLabel")}{" "}
          <span className="font-semibold text-neutral-800">{t("statusFinal")}</span>
        </p>
      </div>

      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-3 rounded-md border border-neutral-100 bg-white px-4 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
            {t("month")}
          </span>
          <span className="text-[13px] font-semibold text-neutral-800">
            {monthLabel}
          </span>
          <div className="ml-3 flex gap-1">
            {[0, 1, 2, 3].map((offset) => {
              const d = new Date(year, month - 3 + offset, 1);
              const isCurrent = d.getMonth() === month && d.getFullYear() === year;
              const link =
                `${routes.alltagshilfeReport}?month=${d.getMonth()}&year=${d.getFullYear()}` as Route;
              return (
                <Link
                  key={offset}
                  href={link}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium ${
                    isCurrent
                      ? "bg-error-500 text-white"
                      : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {monthShort(d.getMonth(), d.getFullYear())}
                </Link>
              );
            })}
          </div>
        </div>
        <a
          href="/api/reports/export?type=alltagshilfe&format=pdf"
          target="_blank"
          rel="noreferrer"
          className="btn btn--ghost border border-neutral-200 bg-white"
        >
          <DownloadIcon />
          {t("exportPdf")}
        </a>
        <a
          href="/api/reports/export?type=alltagshilfe&format=csv"
          target="_blank"
          rel="noreferrer"
          className="btn btn--ghost border border-neutral-200 bg-white"
        >
          <DownloadIcon />
          {t("exportCsv")}
        </a>
        {periodHasData && (
          <SendMonthlyReportButton
            year={year}
            month={month}
            mode={alreadySent ? "resend" : "send"}
            label={t("sendToManagement")}
            className="ml-auto"
          />
        )}
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("kpiHoursTotal")}
          value={`${report.summary.totalHours.toFixed(1)} h`}
          sub={`${report.summary.hoursDeltaPctVsPrev > 0 ? "+" : ""}${report.summary.hoursDeltaPctVsPrev.toFixed(0)}% ${t("vsPrevious")}`}
        />
        <KpiCard
          label={t("kpiClients")}
          value={`${report.summary.activeClients} / ${report.summary.totalClients}`}
          sub={t("kpiClientsSub", {
            visits: report.summary.visitsCount,
            insurers: report.summary.insurersCount,
          })}
        />
        <KpiCard
          label={t("kpiStaff")}
          value={`${report.summary.involvedStaff} ${t("kpiOf")} ${report.summary.qualifiedStaff} ${t("kpiQualified")}`}
          sub={t("kpiStaffSub")}
        />
        <KpiCard
          label={t("kpiAmount")}
          value={formatEUR(report.summary.amountCents)}
          sub={t("kpiAmountSub", {
            rate: (report.summary.hourlyRateCents / 100).toFixed(2),
          })}
        />
      </div>

      {/* Per-client breakdown */}
      <section className="mb-6 rounded-lg border border-neutral-100 bg-white">
        <header className="flex items-center justify-between border-b border-neutral-100 p-5">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-neutral-800">
              <DocIcon />
              {t("breakdownTitle")}
            </h3>
            <div className="mt-0.5 text-[12px] text-neutral-500">
              {t("breakdownSubtitle")}
            </div>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <Th>{t("colStaff")}</Th>
                <Th>{t("colPeriod")}</Th>
                <Th align="right">{t("colVisits")}</Th>
                <Th align="right">{t("colHours")}</Th>
                <Th align="right">{t("colRate")}</Th>
                <Th align="right">{t("colAmount")}</Th>
              </tr>
            </thead>
            <tbody>
              {report.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[13px] text-neutral-500">
                    {t("emptyMonth", { month: monthLabel })}
                  </td>
                </tr>
              )}
              {report.rows.map((row) => (
                <ClientGroup key={row.client.id} row={row} locale={locale} />
              ))}
              {report.rows.length > 0 && (
                <tr className="border-t-2 border-error-200 bg-error-50/30">
                  <td className="px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.05em] text-error-700">
                    {t("totalRowLabel", { month: monthLabel })}
                  </td>
                  <td className="px-5 py-3" />
                  <td className="px-5 py-3 text-right font-bold text-error-700">
                    {report.summary.visitsCount}
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-error-700">
                    {report.summary.totalHours.toFixed(1)} h
                  </td>
                  <td className="px-5 py-3" />
                  <td className="px-5 py-3 text-right font-bold text-error-700">
                    {formatEUR(report.summary.amountCents)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Hours per employee + Delivery side-by-side */}
      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ByEmployeePanel
          rows={report.byEmployee}
          locale={locale}
          formatEUR={formatEUR}
        />
        <DeliveryPanel
          delivery={report.latestDelivery}
          nextRunLabel={nextRunLabel}
          year={year}
          month={month}
          locale={locale}
          alreadySent={alreadySent}
          periodHasData={periodHasData}
        />
      </div>

      {/* Footer note */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4 text-[11px] text-neutral-500">
        <div>
          {t("footerLine", {
            dateLabel: `${eomLabel} · 06:00 ${tzAbbrev}`,
          })}
        </div>
        <div className="max-w-[480px] text-right text-[11px] leading-[1.5] text-neutral-500">
          {t("everydayHelpModule")}
        </div>
      </footer>
    </>
  );
}

/* ----------------------------- Sub-components ----------------------------- */

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-md border-t-2 border-error-500 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
        {label}
        <span className="grid h-7 w-7 place-items-center rounded-md bg-error-50 text-error-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <circle cx={12} cy={12} r={10} />
            <path d="M12 6v6l4 2" />
          </svg>
        </span>
      </div>
      <div className="mt-2 text-[24px] font-bold tracking-[-0.01em] text-error-700">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-neutral-500">{sub}</div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`border-b border-neutral-200 bg-neutral-50 px-5 py-3 ${align === "right" ? "text-right" : "text-left"} text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500`}
    >
      {children}
    </th>
  );
}

/**
 * One client group: a sticky pink header row (care-level + insurance
 * pills, address, hours sum) followed by the staff rows that
 * contributed visits in the period.
 */
async function ClientGroup({
  row,
  locale,
}: {
  row: AlltagshilfeRow;
  locale: AppLocale;
}) {
  const t = await getTranslations("alltagshilfeReport");
  const formatEUR = (cents: number) => formatCurrencyCents(cents, locale);
  const initials =
    row.client.name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "—";

  const careLevelDesc = row.client.careLevel
    ? t(`careLevelDesc${row.client.careLevel}` as never)
    : null;
  const careLevelLabel =
    row.client.careLevel && careLevelDesc
      ? t("careLevelPill", {
          level: row.client.careLevel,
          desc: careLevelDesc,
        })
      : null;

  const rhythmLabel = row.client.rhythm
    ? t(rhythmKey(row.client.rhythm) as never)
    : null;

  return (
    <>
      <tr className="bg-error-50/40">
        <td className="px-5 py-3 align-middle" colSpan={2}>
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-error-500 text-[12px] font-bold text-white">
              {initials}
            </span>
            <div>
              <div className="text-[14px] font-semibold text-error-700">
                {row.client.name}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                <span>{row.client.address}</span>
                {rhythmLabel && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{rhythmLabel}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </td>
        <td className="px-5 py-3 align-middle" colSpan={2}>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {careLevelLabel && (
              <span className="rounded-md bg-error-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {careLevelLabel}
              </span>
            )}
            <span className="rounded-md bg-error-50 px-2 py-0.5 text-[11px] font-semibold text-error-700">
              {row.client.insurance}
            </span>
          </div>
        </td>
        <td className="px-5 py-3 text-right align-middle font-bold text-error-700">
          {row.totalHours.toFixed(1)} h
        </td>
        <td className="px-5 py-3 text-right align-middle font-bold text-error-700">
          {formatEUR(row.totalAmountCents)}
        </td>
      </tr>
      {row.staff.map((emp) => (
        <tr key={emp.id} className="border-b border-neutral-100">
          <td className="px-5 py-3 pl-16 align-middle">
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-warning-500 text-[10px] font-bold text-white">
                {emp.name
                  .split(/\s+/)
                  .map((w) => w[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase() || "—"}
              </span>
              <div>
                <div className="text-[13px] font-medium text-neutral-800">
                  {emp.name}
                </div>
                <div className="text-[11px] text-success-700">
                  {emp.qualifications.join(" · ")}
                </div>
              </div>
            </div>
          </td>
          <td className="px-5 py-3 align-middle text-[12px] text-neutral-700">
            <div>{emp.period}</div>
            <div className="text-[11px] text-neutral-500">{emp.schedule}</div>
          </td>
          <td className="px-5 py-3 text-right align-middle font-mono text-[12px] text-neutral-700">
            {emp.visits}
          </td>
          <td className="px-5 py-3 text-right align-middle font-mono text-[12px] text-neutral-700">
            {emp.hours.toFixed(1)} h
          </td>
          <td className="px-5 py-3 text-right align-middle font-mono text-[12px] text-neutral-600">
            {formatEUR(emp.rateCents)}
          </td>
          <td className="px-5 py-3 text-right align-middle font-mono text-[12px] font-semibold text-neutral-800">
            {formatEUR(emp.amountCents)}
          </td>
        </tr>
      ))}
    </>
  );
}

function rhythmKey(r: NonNullable<AlltagshilfeRow["client"]["rhythm"]>): string {
  switch (r) {
    case "weekly":
      return "rhythmWeekly";
    case "biweekly":
      return "rhythmBiweekly";
    case "monthly":
      return "rhythmMonthly";
    case "on_demand":
      return "rhythmOnDemand";
  }
}

/**
 * "Hours per employee" — cross-client roll-up shown below the
 * breakdown table. Rendered as a compact list so it fits next to the
 * Delivery panel on lg+ screens. Per-row badge shows customer count
 * and visit count; right side shows hours + amount.
 */
async function ByEmployeePanel({
  rows,
  locale,
  formatEUR,
}: {
  rows: AlltagshilfeEmployeeSummary[];
  locale: AppLocale;
  formatEUR: (cents: number) => string;
}) {
  const t = await getTranslations("alltagshilfeReport");
  // locale is currently unused in this panel but the helper closes
  // over it for future per-row date renderers; we silence the lint
  // by referencing it once.
  void locale;
  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 p-5">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-neutral-800">
          <UserIcon />
          {t("byEmployeeTitle")}
        </h3>
        <div className="mt-0.5 text-[12px] text-neutral-500">
          {t("byEmployeeSubtitle")}
        </div>
      </header>

      <div className="divide-y divide-neutral-100">
        {rows.length === 0 && (
          <div className="p-6 text-center text-[13px] text-neutral-500">
            {t("byEmployeeEmpty")}
          </div>
        )}
        {rows.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-3 px-5 py-3"
          >
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-warning-500 text-[11px] font-bold text-white">
              {e.name
                .split(/\s+/)
                .map((w) => w[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase() || "—"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-neutral-800">
                {e.name}
              </div>
              <div className="truncate text-[11px] text-neutral-500">
                {t("byEmployeeCustomersN", { n: e.customersCount })} ·{" "}
                {t("byEmployeeVisitsN", { n: e.visits })}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[13px] font-semibold text-neutral-800">
                {e.hours.toFixed(1)} h
              </div>
              <div className="font-mono text-[11px] text-neutral-500">
                {formatEUR(e.amountCents)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Right-hand "Delivery" panel mirroring the prototype: shows last
 * send status, recipient, format, the explicit Lexware-skipped marker
 * (so the recipient knows we don't automate Pflegekasse invoicing),
 * next scheduled run, and the two follow-up actions (Resend and
 * Create manual invoice).
 */
async function DeliveryPanel({
  delivery,
  nextRunLabel,
  year,
  month,
  locale,
  alreadySent,
  periodHasData,
}: {
  delivery: AlltagshilfeDelivery | null;
  nextRunLabel: string;
  year: number;
  month: number;
  locale: AppLocale;
  alreadySent: boolean;
  periodHasData: boolean;
}) {
  const t = await getTranslations("alltagshilfeReport");

  const statusLabel = delivery
    ? t(`deliveryStatus${capitalise(delivery.status)}` as never)
    : t("deliveryStatusNever");

  const statusDot =
    delivery?.status === "sent"
      ? "bg-success-500"
      : delivery?.status === "failed"
        ? "bg-error-500"
        : delivery?.status === "queued"
          ? "bg-warning-500"
          : "bg-neutral-300";

  const sentLine = delivery?.sentAt
    ? formatPattern(new Date(delivery.sentAt), "dd MMM · HH:mm", locale)
    : null;

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 p-5">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-neutral-800">
          <MailIcon />
          {t("deliveryTitle")}
        </h3>
        <p className="mt-1 text-[12px] leading-[1.5] text-neutral-500">
          {t("deliveryDescription")}
        </p>
      </header>

      <dl className="divide-y divide-neutral-100">
        <Row
          label={t("deliveryStatus")}
          value={
            <span className="flex items-center justify-end gap-2">
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${statusDot}`}
              />
              <span className="font-semibold text-neutral-800">{statusLabel}</span>
              {sentLine && (
                <span className="font-mono text-[11px] text-neutral-500">{sentLine}</span>
              )}
            </span>
          }
        />
        <Row
          label={t("deliveryRecipient")}
          value={
            <span className="font-mono text-[12px] text-neutral-700">
              {delivery?.recipient ?? "—"}
            </span>
          }
        />
        <Row
          label={t("deliveryFormat")}
          value={
            <span className="text-[12px] text-neutral-700">
              {delivery?.format ?? "PDF · CSV"}
            </span>
          }
        />
        <Row
          label={t("deliveryLexwareSync")}
          value={
            <span className="rounded-md bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-700">
              {t("deliveryLexwareSkipped")}
            </span>
          }
        />
        <Row
          label={t("deliveryNextVersion")}
          value={
            <span className="font-mono text-[12px] text-neutral-700">
              {nextRunLabel}
            </span>
          }
        />
      </dl>

      <footer className="grid grid-cols-2 gap-2 border-t border-neutral-100 p-4">
        {periodHasData ? (
          <SendMonthlyReportButton
            year={year}
            month={month}
            mode={alreadySent ? "resend" : "send"}
            variant="ghost"
            label={t("actionResend")}
          />
        ) : (
          <button
            type="button"
            disabled
            className="btn btn--ghost cursor-not-allowed border border-neutral-200 bg-white opacity-50"
          >
            {t("actionResend")}
          </button>
        )}
        <Link
          href={routes.invoiceNew}
          className="btn btn--danger justify-center"
        >
          {t("actionCreateInvoice")}
        </Link>
      </footer>
    </section>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className="text-[12px] text-neutral-500">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function capitalise(s: string): string {
  if (!s) return s;
  // 'manual_skipped' -> 'ManualSkipped'
  return s
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

/* --------------------------- Inline icon helpers --------------------------- */

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 10l-5 5-5-5M12 15V3" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx={9} cy={7} r={4} />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <path d="M22 6l-10 7L2 6" />
    </svg>
  );
}

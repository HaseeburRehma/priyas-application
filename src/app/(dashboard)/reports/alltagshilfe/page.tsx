import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { loadAlltagshilfeMonthly, type AlltagshilfeRow } from "@/lib/api/alltagshilfe";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import {
  asAppLocale,
  formatCurrencyCents,
  formatDateTime,
} from "@/lib/utils/i18n-format";
import { routes } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Alltagshilfe — Monatsbericht" };
export const dynamic = "force-dynamic";

type SearchParams = { month?: string; year?: string };

/**
 * 16-alltagshilfe-report.html — monthly billing report for the
 * Alltagshilfe service area. Generates the per-client + per-employee hours
 * breakdown so management can manually invoice the German healthcare
 * insurers (the spec explicitly says insurance, not the customer, pays).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  try {
    await requirePermission("report.alltagshilfe.view");
  } catch (err) {
    if (err instanceof PermissionError) redirect(routes.reports);
    throw err;
  }

  const t = await getTranslations("alltagshilfeReport");
  const locale = asAppLocale(await getLocale());
  const formatEUR = (cents: number) => formatCurrencyCents(cents, locale);
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year ?? now.getFullYear());
  const month = Number(sp.month ?? now.getMonth());
  const report = await loadAlltagshilfeMonthly(year, month, locale);

  const monthNames = [
    "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
    "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
  ];
  const monthLabel = `${monthNames[month]} ${year}`;

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
              {formatDateTime(new Date(), locale)}
              {" · MEZ"}
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
                  {monthNames[d.getMonth()]}
                </Link>
              );
            })}
          </div>
        </div>
        <button className="btn btn--ghost border border-neutral-200 bg-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 10l-5 5-5-5M12 15V3" />
          </svg>
          {t("exportPdf")}
        </button>
        <button className="btn btn--ghost border border-neutral-200 bg-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 10l-5 5-5-5M12 15V3" />
          </svg>
          {t("exportCsv")}
        </button>
        <button className="btn btn--danger ml-auto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
          {t("sendToManagement")}
        </button>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("kpiHoursTotal")}
          value={`${report.summary.totalHours.toFixed(1)} Std.`}
          sub={`${report.summary.hoursDeltaPctVsPrev > 0 ? "+" : ""}${report.summary.hoursDeltaPctVsPrev.toFixed(0)}% ${t("vsPrevious")}`}
          tone="error"
        />
        <KpiCard
          label={t("kpiClients")}
          value={`${report.summary.activeClients} / ${report.summary.totalClients}`}
          sub={t("kpiClientsSub", {
            visits: report.summary.visitsCount,
            insurers: report.summary.insurersCount,
          })}
          tone="error"
        />
        <KpiCard
          label={t("kpiStaff")}
          value={`${report.summary.involvedStaff} ${t("kpiOf")} ${report.summary.qualifiedStaff} ${t("kpiQualified")}`}
          sub={t("kpiStaffSub")}
          tone="error"
        />
        <KpiCard
          label={t("kpiAmount")}
          value={formatEUR(report.summary.amountCents)}
          sub={t("kpiAmountSub", {
            rate: (report.summary.hourlyRateCents / 100).toFixed(2),
          })}
          tone="error"
        />
      </div>

      {/* Per-client breakdown */}
      <section className="rounded-lg border border-neutral-100 bg-white">
        <header className="flex items-center justify-between border-b border-neutral-100 p-5">
          <div>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-neutral-800">
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
                <ClientGroup key={row.client.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone = "muted",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "error" | "muted";
}) {
  return (
    <div className="rounded-md border border-neutral-100 bg-white p-5">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
        {label}
        <span
          className={`grid h-7 w-7 place-items-center rounded-md ${tone === "error" ? "bg-error-50 text-error-700" : "bg-neutral-100 text-neutral-600"}`}
        >
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

function ClientGroup({
  row,
}: {
  row: AlltagshilfeRow;
}) {
  return (
    <>
      <tr className="bg-error-50/40">
        <td className="px-5 py-3 align-middle" colSpan={3}>
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-error-500 text-[12px] font-bold text-white">
              {row.client.name
                .split(/\s+/)
                .map((w) => w[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase() || "—"}
            </span>
            <div>
              <div className="text-[14px] font-semibold text-error-700">{row.client.name}</div>
              <div className="text-[11px] text-neutral-500">
                {row.client.address}
              </div>
            </div>
          </div>
        </td>
        <td className="px-5 py-3 text-right align-middle">
          <span className="rounded-md bg-error-50 px-2 py-0.5 text-[11px] font-semibold text-error-700">
            {row.client.insurance}
          </span>
        </td>
        <td className="px-5 py-3 text-right align-middle font-bold text-error-700">
          {row.totalHours.toFixed(1)} h
        </td>
        <td className="px-5 py-3 text-right align-middle font-bold text-error-700">
          €{(row.totalAmountCents / 100).toFixed(2)}
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
            €{(emp.rateCents / 100).toFixed(2)}
          </td>
          <td className="px-5 py-3 text-right align-middle font-mono text-[12px] font-semibold text-neutral-800">
            €{(emp.amountCents / 100).toFixed(2)}
          </td>
        </tr>
      ))}
    </>
  );
}

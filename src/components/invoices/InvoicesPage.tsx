"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { formatEUR } from "@/lib/utils/format";
import { useInvoices } from "@/hooks/invoices/useInvoices";
import type {
  InvoicesSummary,
  InvoiceStatus,
} from "@/lib/api/invoices.types";

const PAGE_SIZE = 25;
const FILTERS: Array<InvoiceStatus | "all"> = [
  "all",
  "draft",
  "sent",
  "paid",
  "overdue",
];

const statusStyles: Record<InvoiceStatus, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  sent: "bg-secondary-50 text-secondary-700",
  paid: "bg-success-50 text-success-700",
  overdue: "bg-error-50 text-error-700",
  cancelled: "bg-neutral-100 text-neutral-500",
};

type Props = { summary: InvoicesSummary; canCreate: boolean };

export function InvoicesPage({ summary, canCreate }: Props) {
  const t = useTranslations("invoices");
  const tStatus = useTranslations("invoices.status");
  const tFilter = useTranslations("invoices.toolbar");
  const tTable = useTranslations("invoices.table");
  const tSum = useTranslations("invoices.summary");
  const tSide = useTranslations("invoices.side");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useInvoices({
    q,
    status,
    page,
    pageSize: PAGE_SIZE,
    sort: "issue_date",
    direction: "desc",
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span>{t("breadcrumbFinance")}</span>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbCurrent")}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
          </h1>
          <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button className="btn btn--ghost border border-neutral-200 bg-white">
            {t("actions.import")}
          </button>
          <button className="btn btn--tertiary">{t("actions.export")}</button>
          {canCreate && (
            <button className="btn btn--primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t("actions.new")}
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label={tSum("total")}
          value={formatEUR(summary.totalAmountCents)}
          sub={tSum("totalSub", { count: summary.total })}
        />
        <SummaryCard
          label={tSum("paid")}
          value={formatEUR(summary.paidAmountCents)}
          sub={tSum("paidSub", { count: summary.paidCount })}
          tone="up"
        />
        <SummaryCard
          label={tSum("open")}
          value={formatEUR(summary.openAmountCents)}
          sub={tSum("openSub", { count: summary.openCount })}
        />
        <SummaryCard
          label={tSum("overdue")}
          value={formatEUR(summary.overdueAmountCents)}
          sub={tSum("overdueSub", { count: summary.overdueCount })}
          tone="danger"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-5 py-4">
            <div className="flex min-w-[240px] flex-1 items-center gap-2.5 rounded-md border border-neutral-100 bg-neutral-50 px-3.5 py-2">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 text-neutral-400"
              >
                <circle cx={11} cy={11} r={7} />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder={tFilter("searchPlaceholder")}
                className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-neutral-800 outline-none placeholder:text-neutral-400"
              />
            </div>
            <div className="flex flex-wrap gap-1 rounded-md bg-neutral-50 p-1 text-[12px]">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setStatus(f);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded px-2.5 py-1 font-medium transition",
                    status === f
                      ? "bg-white text-secondary-500 shadow-xs"
                      : "text-neutral-600 hover:bg-white",
                  )}
                >
                  {f === "all"
                    ? tFilter("filterAll")
                    : tFilter(`filter${f.charAt(0).toUpperCase() + f.slice(1)}` as never)}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <Th>{tTable("number")}</Th>
                  <Th>{tTable("client")}</Th>
                  <Th>{tTable("issued")}</Th>
                  <Th>{tTable("due")}</Th>
                  <Th align="right">{tTable("amount")}</Th>
                  <Th>{tTable("status")}</Th>
                  <Th>{tTable("lexware")}</Th>
                  <Th>{tTable("actions")}</Th>
                </tr>
              </thead>
              <tbody>
                {(isLoading || isFetching) &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td colSpan={8} className="px-5 py-4">
                        <div className="h-9 animate-pulse rounded bg-neutral-100" />
                      </td>
                    </tr>
                  ))}
                {!isLoading && !isFetching && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center text-[13px] text-neutral-500">
                      {tTable("empty")}
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  !isFetching &&
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-neutral-100 transition last:border-b-0 hover:bg-tertiary-200"
                    >
                      <td className="px-5 py-3.5 align-middle">
                        <Link
                          href={routes.invoice(r.id)}
                          className="font-mono text-[13px] font-semibold text-secondary-500"
                        >
                          {r.invoice_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        <Link
                          href={routes.client(r.client_id)}
                          className="text-[13px] font-medium text-primary-700 hover:underline"
                        >
                          {r.client_name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 align-middle font-mono text-[12px] text-neutral-600">
                        {format(new Date(r.issue_date), "yyyy-MM-dd")}
                      </td>
                      <td className="px-5 py-3.5 align-middle font-mono text-[12px] text-neutral-600">
                        {r.due_date ? format(new Date(r.due_date), "yyyy-MM-dd") : "—"}
                        {r.days_overdue ? (
                          <span className="ml-2 text-error-700">
                            +{r.days_overdue}d
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 text-right align-middle font-semibold text-neutral-800">
                        {formatEUR(r.total_cents)}
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.02em]",
                            statusStyles[r.status],
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {tStatus(r.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        {r.lexware_id ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-semibold text-success-700">
                            ✓ {tTable("synced")}
                          </span>
                        ) : (
                          <span className="text-[12px] text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={routes.invoice(r.id)}
                            title={tTable("view")}
                            className="grid h-7 w-7 place-items-center rounded-sm text-neutral-500 transition hover:bg-neutral-100"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                              <circle cx={12} cy={12} r={3} />
                            </svg>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3.5 text-[12px] text-neutral-500">
            <div>
              {tTable("showing", {
                from: total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1,
                to: Math.min(page * PAGE_SIZE, total),
                total,
              })}
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                const p = i + 1;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={cn(
                      "grid h-8 min-w-[32px] place-items-center rounded-sm px-2 text-[12px] font-medium transition",
                      p === page
                        ? "bg-primary-500 text-white"
                        : "text-neutral-600 hover:bg-neutral-100",
                    )}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Side */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-lg border border-neutral-100 bg-white p-5">
            <h3 className="text-[13px] font-semibold text-neutral-800">
              {tSide("cashTitle")}
            </h3>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              {tSide("cashSub")}
            </p>
            <div className="mt-3 text-[24px] font-bold text-secondary-500">
              {formatEUR(summary.forecast30dCents)}
            </div>
            <div className="mt-1 text-[11px] text-neutral-500">
              + collected this month {formatEUR(summary.collectedThisMonthCents)}
            </div>
          </section>
          <section className="rounded-lg border border-neutral-100 bg-white p-5">
            <h3 className="text-[13px] font-semibold text-neutral-800">
              {tSide("quickActions")}
            </h3>
            <div className="mt-3 flex flex-col gap-2">
              <button className="btn btn--ghost border border-neutral-200 bg-white">
                {tSide("qaSendReminders")}
              </button>
              <button className="btn btn--ghost border border-neutral-200 bg-white">
                {tSide("qaExportXls")}
              </button>
              <button className="btn btn--tertiary">
                {tSide("qaSyncLexware")}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone = "muted",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "up" | "danger" | "muted";
}) {
  const subColor =
    tone === "up"
      ? "text-success-500"
      : tone === "danger"
        ? "text-error-700"
        : "text-neutral-500";
  return (
    <div className="rounded-md border border-neutral-100 bg-white p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </div>
      <div className="mt-1.5 text-[22px] font-bold tracking-[-0.01em] text-secondary-500">
        {value}
      </div>
      <div className={`mt-0.5 text-[11px] ${subColor}`}>{sub}</div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "border-b border-neutral-200 bg-neutral-50 px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

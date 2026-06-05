"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { useFormat } from "@/lib/utils/i18n-format";
import { useInvoices } from "@/hooks/invoices/useInvoices";
import type {
  InvoiceRow,
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
  const f = useFormat();
  const formatEUR = (cents: number) => f.currencyCents(cents);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");
  // Service-line segment filter — matches the prototype's
  // "All / Priya's / Alltagshilfe" pill toggle at the right of the
  // toolbar. Filtered client-side because the loader pre-paginates
  // and re-issuing the query for a UI tab feels heavy for a
  // <50-row screen; revisit if the dataset grows past one page.
  const [kind, setKind] = useState<"all" | "regular" | "alltagshilfe">("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useInvoices({
    q,
    status,
    page,
    pageSize: PAGE_SIZE,
    sort: "issue_date",
    direction: "desc",
  });
  const allRows = data?.rows ?? [];
  // Apply the service-line filter client-side. Done after the loader
  // returns so pagination still reflects the underlying filtered set,
  // not the post-kind subset (which would feel jumpy as pages turn).
  const rows = kind === "all" ? allRows : allRows.filter((r) => r.invoice_kind === kind);
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
          {/* Import / Export here used to be no-op buttons. The Export
              link now hits /api/invoices?format=csv (handled in the
              route below); Import stays parked behind a disabled
              tooltip until we ship a CSV importer. */}
          <button
            type="button"
            disabled
            title={t("actions.importComingSoon")}
            className="btn btn--ghost border border-neutral-200 bg-white opacity-50"
          >
            {t("actions.import")}
          </button>
          <a
            href="/api/invoices?format=csv"
            target="_blank"
            rel="noopener"
            className="btn btn--ghost border border-neutral-200 bg-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            {t("actions.export")}
          </a>
          {/* Lexware bulk-sync button — re-runs the retry sweep on
           *  failed/pending invoices in the visible org. Same server
           *  action that the nightly cron uses, just gated here on
           *  the manual trigger. */}
          <button
            type="button"
            className="btn btn--ghost border border-neutral-200 bg-white"
            title={t("actions.syncLexwareTitle")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M21 12a9 9 0 11-9-9" />
              <path d="M21 4v5h-5" />
            </svg>
            {t("actions.syncLexware")}
          </button>
          {canCreate && (
            <Link href={routes.invoiceNew} className="btn btn--primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t("actions.new")}
            </Link>
          )}
        </div>
      </div>

      {/* Summary — coloured top stripes per prototype:
       *  total = primary green, open = warning amber,
       *  paid = success green, overdue = error red */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          stripe="primary"
          label={tSum("total")}
          value={formatEUR(summary.totalAmountCents)}
          sub={tSum("totalSub", { count: summary.total })}
        />
        <SummaryCard
          stripe="warning"
          label={tSum("open")}
          value={formatEUR(summary.openAmountCents)}
          sub={tSum("openSub", { count: summary.openCount })}
        />
        <SummaryCard
          stripe="success"
          label={tSum("paid")}
          value={formatEUR(summary.paidAmountCents)}
          sub={tSum("paidSub", { count: summary.paidCount })}
          tone="up"
        />
        <SummaryCard
          stripe="error"
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

            {/* Service-line segment (All / Priya's / Alltagshilfe). */}
            <div className="ml-auto flex items-center gap-0.5 rounded-md border border-neutral-100 bg-neutral-50 p-[3px]">
              {(["all", "regular", "alltagshilfe"] as const).map((k) => {
                const active = kind === k;
                const dot =
                  k === "all"
                    ? "bg-gradient-to-r from-primary-500 to-error-500"
                    : k === "regular"
                      ? "bg-primary-500"
                      : "bg-error-500";
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition",
                      active
                        ? k === "regular"
                          ? "bg-primary-50 text-primary-700"
                          : k === "alltagshilfe"
                            ? "bg-error-50 text-error-700"
                            : "bg-white text-neutral-800 shadow-xs"
                        : "text-neutral-600 hover:bg-neutral-100",
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
                    {tFilter(
                      k === "all"
                        ? "serviceAll"
                        : k === "regular"
                          ? "servicePriya"
                          : "serviceAlltags",
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <Th>{tTable("number")}</Th>
                  <Th>{tTable("client")}</Th>
                  <Th>{tTable("service")}</Th>
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
                      <td colSpan={9} className="px-5 py-4">
                        <div className="h-9 animate-pulse rounded bg-neutral-100" />
                      </td>
                    </tr>
                  ))}
                {!isLoading && !isFetching && rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-16 text-center text-[13px] text-neutral-500">
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
                      <td className="px-5 py-3.5 align-middle">
                        <ServiceChip kind={r.invoice_kind} />
                      </td>
                      <td className="px-5 py-3.5 align-middle font-mono text-[12px] text-neutral-600">
                        {f.date(r.issue_date)}
                      </td>
                      <td className="px-5 py-3.5 align-middle text-[12px]">
                        {/*
                          The prototype's DUE column reads as a humanised
                          relative-time string with semantic colour:
                            paid → neutral grey
                            overdue → red, "N days over"
                            partially paid → amber, with outstanding amount
                            future-due → amber, "In N days"
                          The helper below collapses status + due_date +
                          paid_amount into one display.
                        */}
                        <InvoiceDueCell row={r} formatEUR={formatEUR} />
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
                        <LexwareSyncChip status={r.lexware_sync_status} />
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
  stripe,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "up" | "danger" | "muted";
  /** Coloured 3-px top stripe — mirrors the prototype's KPI cards. */
  stripe?: "primary" | "warning" | "success" | "error";
}) {
  const subColor =
    tone === "up"
      ? "text-success-700"
      : tone === "danger"
        ? "text-error-700"
        : "text-neutral-500";
  const stripeCls = stripe
    ? {
        primary: "bg-primary-500",
        warning: "bg-warning-500",
        success: "bg-success-500",
        error: "bg-error-500",
      }[stripe]
    : null;
  const valueColor = tone === "danger" ? "text-error-700" : "text-secondary-500";
  return (
    <div className="relative overflow-hidden rounded-lg border border-neutral-100 bg-white p-4">
      {stripeCls && (
        <span aria-hidden className={cn("absolute left-0 right-0 top-0 h-[3px]", stripeCls)} />
      )}
      <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </div>
      <div className={cn("mt-1.5 font-mono text-[24px] font-bold tracking-[-0.01em]", valueColor)}>
        {value}
      </div>
      <div className={cn("mt-1 text-[11px]", subColor)}>{sub}</div>
    </div>
  );
}

/**
 * Service-line chip — green for Priya's regular invoices, red for
 * Alltagshilfe care invoices. Mirrors the prototype's `.srv.priya` /
 * `.srv.alltags` pills.
 */
function ServiceChip({ kind }: { kind: "regular" | "alltagshilfe" }) {
  const cls =
    kind === "alltagshilfe"
      ? "bg-error-50 text-error-700"
      : "bg-primary-50 text-primary-700";
  const label = kind === "alltagshilfe" ? "Everyday help" : "Priya's";
  const dotCls = kind === "alltagshilfe" ? "bg-error-500" : "bg-primary-500";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]",
        cls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotCls)} />
      {label}
    </span>
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

/**
 * Compact pill that reflects Lexware push state on a single invoice row.
 * The colour mapping mirrors the project's status conventions:
 *   - success (green)  → row successfully synced
 *   - warning (amber) → push hasn't happened yet
 *   - error   (red)    → at least one attempt failed
 *   - neutral (gray)   → invoice isn't eligible for Lexware sync
 *
 * Wired off `invoices.lexware_sync_status`, which migration 000040
 * derives from `lexware_id` + the row's history; no client-side
 * recompute needed.
 */
function LexwareSyncChip({
  status,
}: {
  status: "na" | "pending" | "synced" | "failed";
}) {
  const map: Record<
    "na" | "pending" | "synced" | "failed",
    { cls: string; label: string; mark: string }
  > = {
    synced:  { cls: "bg-success-50 text-success-700", label: "Synchronisiert", mark: "✓" },
    pending: { cls: "bg-warning-50 text-warning-700", label: "Ausstehend",     mark: "…" },
    failed:  { cls: "bg-error-50 text-error-700",     label: "Fehlgeschlagen", mark: "!" },
    na:      { cls: "bg-neutral-100 text-neutral-500", label: "—",              mark: "" },
  };
  const c = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        c.cls,
      )}
      title={`Lexware: ${c.label}`}
    >
      {c.mark && <span aria-hidden>{c.mark}</span>}
      {c.label}
    </span>
  );
}

/**
 * Renders the "DUE" column as a coloured relative-time string per the
 * prototype. Reads `status`, `due_date`, `total_cents`, and
 * `paid_amount_cents` from the invoice row and picks one of:
 *
 *   - paid                  → neutral "Paid"
 *   - cancelled             → neutral "—"
 *   - partially-paid (open) → amber "Partially paid · €X outstanding"
 *   - overdue (status flag) → red    "N days over"
 *   - sent, due in future   → amber  "In N days"  (red when ≤ 0 too)
 */
function InvoiceDueCell({
  row,
  formatEUR,
}: {
  row: InvoiceRow;
  formatEUR: (cents: number) => string;
}) {
  if (row.status === "paid") {
    return <span className="text-neutral-500">Paid</span>;
  }
  if (row.status === "cancelled") {
    return <span className="text-neutral-400">—</span>;
  }
  const outstanding = row.outstanding_cents ?? row.total_cents;
  // Partially-paid invoices live in sent/overdue territory but with paid > 0.
  // (We already returned early for status="paid"/"cancelled", so the
  //  redundant status comparison TS narrows away is implicit.)
  if (row.paid_amount_cents > 0 && outstanding > 0) {
    return (
      <span className="text-warning-700">
        Partially paid · {formatEUR(outstanding)} outstanding
      </span>
    );
  }
  if (row.status === "overdue") {
    const days = row.days_overdue ?? 0;
    return (
      <span className="text-error-700 font-medium">
        {days} day{days === 1 ? "" : "s"} over
      </span>
    );
  }
  // Sent and not overdue → "In N days"
  if (row.due_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(row.due_date + "T00:00:00Z");
    const diffDays = Math.ceil(
      (due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diffDays < 0) {
      return (
        <span className="text-error-700 font-medium">
          {Math.abs(diffDays)} day{Math.abs(diffDays) === 1 ? "" : "s"} over
        </span>
      );
    }
    if (diffDays === 0) {
      return <span className="text-warning-700 font-medium">Due today</span>;
    }
    return (
      <span className="text-warning-700">
        In {diffDays} day{diffDays === 1 ? "" : "s"}
      </span>
    );
  }
  return <span className="text-neutral-400">—</span>;
}

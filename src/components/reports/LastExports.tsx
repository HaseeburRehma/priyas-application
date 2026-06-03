"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";

/**
 * "Last exports" table — pixel-faithful conversion of the prototype's
 * audit log of report runs. Columns: file (icon + filename + sub),
 * created (relative timestamp), from (actor), size, status, actions.
 *
 * Status filter chips on the top right (All / Ready / In Progress / Mine)
 * are wired to local state. Per-row actions are Download (when ready)
 * or Cancel (when in-progress).
 *
 * Data source: the static `EXPORTS` array mirrors the screenshot until
 * we wire a real `export_runs` table. The visual contract is what the
 * client will see in QA; functional reads will flip when the loader
 * lands.
 */

type Status = "ready" | "in_progress" | "failed";
type FilterKey = "all" | "ready" | "inProgress" | "mine";
type FileKind = "xlsx" | "csv" | "zip" | "pdf";

type ExportRow = {
  id: string;
  kind: FileKind;
  file: string;
  sub: string;
  createdRelKey: "today" | "yesterday" | "april14" | "april1" | "april18";
  createdTime: string;
  fromActor: string;
  size: string;
  status: Status;
  mine?: boolean;
  downloadUrl?: string;
};

const EXPORTS: ExportRow[] = [
  {
    id: "1",
    kind: "xlsx",
    file: "revenue-by-client · 2026-W16.xlsx",
    sub: "Scheduled weekly · 10 customers · YoY",
    createdRelKey: "today",
    createdTime: "09:01",
    fromActor: "cron",
    size: "124 KB",
    status: "ready",
    downloadUrl: "/api/reports/export?type=revenue-per-customer&format=xlsx",
  },
  {
    id: "2",
    kind: "csv",
    file: "hours-timesheets · 2026-04-20.csv",
    sub: "Daily · DATEV-ready · 312 entries",
    createdRelKey: "yesterday",
    createdTime: "23:03",
    fromActor: "cron",
    size: "38 KB",
    status: "ready",
    downloadUrl: "/api/reports/working-time?format=csv",
  },
  {
    id: "3",
    kind: "zip",
    file: "client-statements-pack · Q1-2026.zip",
    sub: "10 PDFs per active customer",
    createdRelKey: "april14",
    createdTime: "16:22",
    fromActor: "Alex Moore",
    size: "2.4 MB",
    status: "ready",
    mine: true,
  },
  {
    id: "4",
    kind: "pdf",
    file: "vat-report-march-2026.pdf",
    sub: "VAT · 19 % & 7 % · Reverse Charge",
    createdRelKey: "april1",
    createdTime: "08:00",
    fromActor: "cron",
    size: "186 KB",
    status: "ready",
  },
  {
    id: "5",
    kind: "pdf",
    file: "employee-performance-march.pdf",
    sub: "42 employees · ratings & training status",
    createdRelKey: "april1",
    createdTime: "09:14",
    fromActor: "Supervisor 01",
    size: "412 KB",
    status: "ready",
  },
  {
    id: "6",
    kind: "xlsx",
    file: "revenue-by-property · Q1-2026.xlsx",
    sub: "Manual export · 10 objects · visits, hours, margin",
    createdRelKey: "april18",
    createdTime: "11:47",
    fromActor: "Alex Moore",
    size: "—",
    status: "in_progress",
    mine: true,
  },
];

const FILE_BADGE_STYLES: Record<FileKind, string> = {
  xlsx: "bg-success-50 text-success-700",
  csv:  "bg-secondary-50 text-secondary-700",
  zip:  "bg-warning-50 text-warning-700",
  pdf:  "bg-error-50 text-error-700",
};

export function LastExports() {
  const t = useTranslations("reports.lastExports");
  const tFilters = useTranslations("reports.lastExports.filters");
  const tCreated = useTranslations("reports.library.lastRunFormats");

  const [filter, setFilter] = useState<FilterKey>("all");

  const rows = EXPORTS.filter((r) => {
    switch (filter) {
      case "ready":      return r.status === "ready";
      case "inProgress": return r.status === "in_progress";
      case "mine":       return r.mine === true;
      default:           return true;
    }
  });

  const createdLabel = (k: ExportRow["createdRelKey"], time: string): string => {
    switch (k) {
      case "today":     return tCreated("today",     { time });
      case "yesterday": return tCreated("yesterday", { time });
      case "april14":   return `14.04. · ${time}`;
      case "april1":    return `01.04. · ${time}`;
      case "april18":   return `18.04. · ${time}`;
    }
  };

  return (
    <section className="mt-5 rounded-lg border border-neutral-100 bg-white">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-100 px-5 py-4">
        <h2 className="text-[15px] font-semibold text-neutral-800">
          {t("title")}
        </h2>
        <div className="flex flex-wrap items-center gap-1 rounded-md bg-neutral-50 p-1 text-[12px]">
          {(["all", "ready", "inProgress", "mine"] satisfies FilterKey[]).map(
            (k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded px-2.5 py-1 font-medium transition",
                  filter === k
                    ? "bg-white text-secondary-500 shadow-xs"
                    : "text-neutral-600 hover:bg-white/60",
                )}
              >
                {tFilters(k)}
              </button>
            ),
          )}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <Th>{t("thFile")}</Th>
              <Th>{t("thCreated")}</Th>
              <Th>{t("thFrom")}</Th>
              <Th align="right">{t("thSize")}</Th>
              <Th>{t("thStatus")}</Th>
              <Th align="right">{t("thActions")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-10 text-center text-[12px] text-neutral-500"
                >
                  {t("empty")}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-neutral-100 last:border-b-0">
                <td className="px-5 py-3 align-middle">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "inline-flex h-9 w-12 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold uppercase tracking-[0.05em]",
                        FILE_BADGE_STYLES[r.kind],
                      )}
                    >
                      {r.kind}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-neutral-800">
                        {r.file}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                        {r.sub}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 align-middle font-mono text-[12px] text-neutral-600">
                  {createdLabel(r.createdRelKey, r.createdTime)}
                </td>
                <td className="px-5 py-3 align-middle text-neutral-700">
                  {r.fromActor}
                </td>
                <td className="px-5 py-3 text-right align-middle font-mono text-[12px] text-neutral-700">
                  {r.size}
                </td>
                <td className="px-5 py-3 align-middle">
                  <StatusPill status={r.status} t={t} />
                </td>
                <td className="px-5 py-3 align-middle">
                  <div className="flex justify-end">
                    {r.status === "ready" && r.downloadUrl && (
                      <a
                        href={r.downloadUrl}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 rounded-sm border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        {t("actionDownload")}
                      </a>
                    )}
                    {r.status === "ready" && !r.downloadUrl && (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center gap-1 rounded-sm border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-400"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        {t("actionDownload")}
                      </button>
                    )}
                    {r.status === "in_progress" && (
                      <button
                        type="button"
                        className="rounded-sm border border-error-200 bg-white px-2.5 py-1 text-[11px] font-medium text-error-700 hover:bg-error-50"
                      >
                        {t("actionCancel")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="border-t border-neutral-100 px-5 py-2.5 text-[11px] text-neutral-500">
        {t("retention")}
      </footer>
    </section>
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
      className={cn(
        "border-b border-neutral-200 bg-neutral-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function StatusPill({
  status,
  t,
}: {
  status: Status;
  t: (key: string) => string;
}) {
  const map = {
    ready:       { cls: "bg-success-50 text-success-700", label: t("statusReady") },
    in_progress: { cls: "bg-warning-50 text-warning-700", label: t("statusInProgress") },
    failed:      { cls: "bg-error-50 text-error-700",     label: t("statusFailed") },
  } as const;
  const c = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em]",
        c.cls,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {c.label}
    </span>
  );
}

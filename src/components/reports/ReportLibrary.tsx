"use client";

import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { routes } from "@/lib/constants/routes";

type Item = {
  id:
    | "monthlyRevenue"
    | "alltagshilfe"
    | "hoursWorked"
    | "completion"
    | "openInvoices"
    | "satisfaction";
  href?: string;
  exportPath: string;
  tone: "primary" | "secondary" | "warning" | "success";
};

const TONES: Record<Item["tone"], string> = {
  primary: "bg-primary-50 text-primary-700",
  secondary: "bg-secondary-50 text-secondary-700",
  warning: "bg-warning-50 text-warning-700",
  success: "bg-success-50 text-success-700",
};

const ITEMS: Item[] = [
  {
    id: "monthlyRevenue",
    exportPath: "/api/reports/export?type=monthly-revenue",
    tone: "primary",
  },
  {
    id: "alltagshilfe",
    href: routes.alltagshilfeReport,
    exportPath: "/api/reports/export?type=alltagshilfe",
    tone: "warning",
  },
  {
    id: "hoursWorked",
    exportPath: "/api/reports/export?type=hours",
    tone: "secondary",
  },
  {
    id: "completion",
    exportPath: "/api/reports/export?type=completion",
    tone: "success",
  },
  {
    id: "openInvoices",
    exportPath: "/api/reports/export?type=open-invoices",
    tone: "warning",
  },
  {
    id: "satisfaction",
    exportPath: "/api/reports/export?type=satisfaction",
    tone: "primary",
  },
];

export function ReportLibrary() {
  const t = useTranslations("reports.library");
  const tItems = useTranslations("reports.library.items");
  const tCommon = useTranslations("common");

  return (
    <section className="mt-6 rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-100 p-5">
        <div>
          <h3 className="text-[15px] font-semibold text-neutral-800">
            {t("title")}
          </h3>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            {t("subtitle", { count: ITEMS.length })}
          </div>
        </div>
        <button
          type="button"
          className="btn btn--tertiary cursor-not-allowed opacity-60"
          disabled
          aria-disabled="true"
          title={t("createCustomComingSoon")}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t("createCustom")}
        </button>
      </header>
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
        {ITEMS.map((item) => (
          <article
            key={item.id}
            className="flex flex-col gap-3 rounded-md border border-neutral-100 bg-white p-4 transition hover:-translate-y-0.5 hover:border-primary-300"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-secondary-500">
                  {tItems(`${item.id}` as never)}
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-500">
                  {tItems(`${item.id}Sub` as never)}
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] ${TONES[item.tone]}`}
              >
                {tItems(`${item.id}Tag` as never)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {item.href && (
                <Link
                  href={item.href as Route}
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition hover:border-primary-500 hover:text-primary-700"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  {tCommon("open")}
                </Link>
              )}
              <a
                href={`${item.exportPath}&format=pdf`}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition hover:border-primary-500 hover:text-primary-700"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5-5 5 5M12 5v12" />
                </svg>
                {tItems("exportPdf")}
              </a>
              <a
                href={`${item.exportPath}&format=csv`}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition hover:border-primary-500 hover:text-primary-700"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5-5 5 5M12 5v12" />
                </svg>
                {tItems("exportCsv")}
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

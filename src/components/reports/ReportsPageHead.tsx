"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import type { ReportRange } from "@/lib/api/reports";

type Props = {
  range: ReportRange;
  rangeStart: string;
  rangeEnd: string;
};

const RANGES: ReportRange[] = ["30d", "Q", "YTD", "12mo"];

export function ReportsPageHead({ range, rangeStart, rangeEnd }: Props) {
  const t = useTranslations("reports");
  const router = useRouter();

  const updatedAt = format(new Date(), "HH:mm");
  // Locale-aware Berlin timezone short name (MEZ in winter, MESZ in summer).
  const tzAbbrev = (() => {
    const parts = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "MEZ";
  })();

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
          <h1 className="mb-1 flex flex-wrap items-center gap-2 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
            <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-primary-700">
              {range}{" "}
              {new Date(rangeEnd).getFullYear()}
            </span>
          </h1>
          <p className="text-[13px] text-neutral-500">
            {t("subtitle")} ·{" "}
            <span className="text-neutral-600">
              {t("lastUpdate")}{" "}
              <span className="font-semibold text-neutral-800">
                {updatedAt} {tzAbbrev}
              </span>
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period picker */}
          <div className="flex items-center gap-3 rounded-md border border-neutral-100 bg-white px-3.5 py-2 text-[12px]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 text-neutral-500"
            >
              <rect x={3} y={4} width={18} height={17} rx={2} />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
              {t("period")}
            </span>
            <span className="font-medium text-neutral-700">
              {format(new Date(rangeStart), "dd MMM")} –{" "}
              {format(new Date(rangeEnd), "dd MMM yyyy")}
            </span>
            <div className="ml-2 flex gap-1 rounded-sm bg-neutral-50 p-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => router.push(`${routes.reports}?range=${r}`)}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-medium transition",
                    r === range
                      ? "bg-primary-500 text-white"
                      : "text-neutral-600 hover:bg-white",
                  )}
                >
                  {t(`range.${r}` as never)}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="btn btn--ghost border border-neutral-200 bg-white"
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
              <path d="M3 12a9 9 0 1 0 9-9" />
              <path d="M3 4v5h5" />
            </svg>
            {t("actions.refresh")}
          </button>
          <a
            href={`/api/reports/export?type=summary&range=${range}&format=pdf`}
            className="btn btn--primary"
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M7 10l5 5 5-5M12 15V3" />
            </svg>
            {t("actions.exportAll")}
          </a>
        </div>
      </div>
    </>
  );
}

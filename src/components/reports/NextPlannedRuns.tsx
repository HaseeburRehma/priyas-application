"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * "Next planned runs" callout that lives directly under the Report
 * Library. Mirrors the prototype's two-up upcoming-runs strip — clock
 * icon, two next-up runs in inline form, and a "Manage schedules"
 * outline button on the right.
 *
 * The data here is illustrative until the `report_schedules` table
 * lands. When it does, the static `RUNS` constant becomes a prop fed
 * by the page loader. Visual contract stays the same.
 */
export function NextPlannedRuns() {
  const t = useTranslations("reports.schedules");

  const RUNS = [
    {
      label: "Hours & Time Tracking",
      whenLabel: `${t("tonight")} · 23:00`,
      destination: "DATEV Synchronization",
    },
    {
      label: "Revenue per Customer",
      whenLabel: "Mo · 09:00",
      destination: "finance@priyas-cleaning.de · #finance-weekly",
    },
  ];

  return (
    <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-100 bg-white p-4">
      <div className="flex flex-1 flex-wrap items-start gap-3">
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-secondary-50 text-secondary-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <circle cx={12} cy={12} r={10} />
            <path d="M12 6v6l4 2" />
          </svg>
        </span>
        <div className="flex-1">
          <h3 className="text-[13px] font-semibold text-neutral-800">
            {t("title")}
          </h3>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-neutral-600">
            {RUNS.map((r) => (
              <li key={r.label} className="inline-flex items-baseline gap-1.5">
                <span className="font-medium text-neutral-800">{r.label}</span>
                <span className="text-neutral-500">{r.whenLabel}</span>
                <span className="text-neutral-400">→</span>
                <span>{r.destination}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Link
        // Manage-schedules is the same place the cron entries are
        // configured. We park it on /settings until a dedicated
        // `/reports/schedules` page exists.
        href="/settings"
        className="rounded-sm border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
      >
        {t("manageBtn")} →
      </Link>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { routes } from "@/lib/constants/routes";
import { asAppLocale, bcp47Of } from "@/lib/utils/i18n-format";

type Props = {
  greetingName: string;
};

// Route the legacy locale-to-BCP47 helper through the canonical map so
// every surface in the app uses the same set of tags.
const localeToBcp = (l: string) => bcp47Of(asAppLocale(l));

function germanGreetingKey(d: Date): "morning" | "afternoon" | "evening" {
  const h = d.getHours();
  if (h < 11) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

/**
 * Top of the dashboard page: greeting + date chip + Export + New customer.
 *
 * The greeting and date strings are time/locale-dependent, which makes
 * them hostile to SSR — the server's clock + timezone don't match the
 * client's, so first-render HTML diverges and React throws a hydration
 * error. We render placeholders for the very first paint, then fill the
 * real values in via useEffect after mount. The user sees the dashboard
 * skeleton instantly, the greeting + date snap in a frame later.
 */
export function PageHead({ greetingName }: Props) {
  const t = useTranslations("dashboard");
  const tg = useTranslations("greeting");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [dateLabel, setDateLabel] = useState<string>("");
  const [greeting, setGreeting] = useState<string>("");
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const now = new Date();
    setDateLabel(
      new Intl.DateTimeFormat(localeToBcp(locale), {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(now),
    );
    setGreeting(tg(germanGreetingKey(now)));
  }, [locale, tg]);

  // Click-outside + Escape close the export popover. Standard
  // dismissable-menu pattern; centralised so the markup stays linear.
  useEffect(() => {
    if (!exportOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExportOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
          {greeting ? `${greeting}, ` : ""}
          {greetingName}{" "}
          <span aria-hidden role="img">
            👋
          </span>
        </h1>
        <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-2 rounded-full border border-neutral-100 bg-white px-3.5 py-2 text-[12px] text-neutral-600">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 text-primary-500"
          >
            <rect x={3} y={5} width={18} height={16} rx={2} />
            <path d="M3 9h18M8 3v4M16 3v4" />
          </svg>
          {dateLabel || " "}
        </span>

        {/* Export dropdown — matches the prototype's "Export overview" menu
            with three bundles (KPIs PDF/XLSX, Today's plan PDF/iCal,
            Recent activity CSV) + a "View all reports" link. */}
        <div ref={exportRef} className="relative">
          <button
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            className="btn btn--tertiary"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5-5 5 5M12 5v12" />
            </svg>
            {tCommon("export")} {t("overview")}
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {exportOpen && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-2 w-[320px] rounded-lg border border-neutral-100 bg-white p-2 shadow-lg"
            >
              <div className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
                {t("exportContains")}
              </div>
              <ExportItem
                href="/api/reports/export?type=kpi&format=xlsx"
                title={t("exportKpiTitle")}
                sub={t("exportKpiSub")}
                badge="PDF · XLSX"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M3 3v18h18" />
                    <path d="M7 13l4-4 4 4 5-7" />
                  </svg>
                }
              />
              <ExportItem
                href="/api/schedule/ical"
                title={t("exportPlanTitle")}
                sub={t("exportPlanSub")}
                badge="PDF · iCal"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <rect x={3} y={5} width={18} height={16} rx={2} />
                    <path d="M3 9h18M8 3v4M16 3v4" />
                  </svg>
                }
              />
              <ExportItem
                href="/api/reports/export?type=activity&format=csv"
                title={t("exportActivityTitle")}
                sub={t("exportActivitySub")}
                badge="CSV"
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <circle cx={12} cy={12} r={10} />
                    <path d="M12 6v6l4 2" />
                  </svg>
                }
              />
              <Link
                href={routes.reports}
                onClick={() => setExportOpen(false)}
                className="mt-1 block rounded-md px-3 py-2 text-[12px] font-medium text-primary-700 hover:bg-primary-50"
              >
                {t("exportSeeAll")} →
              </Link>
            </div>
          )}
        </div>

        <Link href={routes.clientNew} className="btn btn--primary">
          <svg
            aria-hidden
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
          {t("newCustomer")}
        </Link>
      </div>
    </div>
  );
}

/**
 * One row inside the Export-overview popover. Mirrors the prototype's
 * three-up layout: icon tile · title + sub · format badge on the right.
 */
function ExportItem({
  href,
  title,
  sub,
  badge,
  icon,
}: {
  href: string;
  title: string;
  sub: string;
  badge: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="flex items-start gap-2.5 rounded-md px-2 py-2 transition hover:bg-neutral-50"
      role="menuitem"
    >
      <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-secondary-50 text-secondary-600">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-neutral-800">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
          {sub}
        </span>
      </span>
      <span className="ml-2 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-neutral-600">
        {badge}
      </span>
    </a>
  );
}

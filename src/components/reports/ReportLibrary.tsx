"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";

/**
 * Report Library — pixel-faithful conversion of `14-reports.html`.
 *
 * Renders the 6 standard report templates as a 3×2 grid of cards with
 * category filtering, status badges, and per-report metadata (Last
 * execution / Format / Deployment plan / Delivery). Each card surfaces
 * "Create now" + "Edit schedule"/"Plan for" actions.
 *
 * The static metadata mirrors the prototype. When the `report_schedules`
 * table lands, the `lastRun` / `deploymentPlan` / `delivery` strings
 * flip from compile-time defaults to live values resolved by the
 * loader — the visual contract here doesn't change.
 *
 * Every visible string goes through `t()` so the page renders
 * identically in de / en / ta.
 */

type Category = "all" | "finances" | "operation" | "compliance" | "everydayHelp";

type Tone =
  | "primary"
  | "secondary"
  | "warning"
  | "danger"
  | "success";

type Badge = "planned" | "new" | "core" | null;

type Report = {
  id:
    | "revenuePerCustomer"
    | "revenuePerProperty"
    | "hoursTimeTracking"
    | "employeePerformance"
    | "bankStatementPackage"
    | "vatReturn"
    | "alltagshilfeMonthly";
  category: "finances" | "operation" | "compliance" | "everydayHelp";
  tone: Tone;
  badge: Badge;
  icon: React.ReactNode;
  lastRunKey:
    | "today9"
    | "threeDaysAgo"
    | "yesterday23"
    | "oneWeekAgo"
    | "never"
    | "april1March";
  format: string;
  metaLeftKind: "deploymentPlan" | "rows" | "customers";
  metaLeftValue: string;
  metaRightKind: "delivery" | "deploymentPlan";
  metaRightKey:
    | "emailSlack"
    | "uponRequest"
    | "datev"
    | "monthly1"
    | "notSpecified"
    | "taxConsulting"
    | "management";
  secondary: "editSchedule" | "planFor";
  /** Variable substitution for description placeholder `{count}`. */
  descriptionCount?: number;
  exportPath: string;
  href?: Route;
};

const TONE_BG: Record<Tone, string> = {
  primary:   "bg-primary-50  text-primary-700",
  secondary: "bg-secondary-50 text-secondary-700",
  warning:   "bg-warning-50  text-warning-700",
  danger:    "bg-error-50    text-error-700",
  success:   "bg-success-50  text-success-700",
};

const BADGE_STYLES: Record<NonNullable<Badge>, string> = {
  planned: "bg-secondary-50 text-secondary-700",
  new:     "bg-primary-500 text-white",
  core:    "bg-neutral-100 text-neutral-700",
};

// Icons rendered as inline SVG so the component stays free of any
// extra icon-library dependency. Stroke width matches the prototype.
const ICONS = {
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 13l4-4 4 4 5-7" />
    </svg>
  ),
  building: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21V8l9-6 9 6v13" />
      <path d="M9 21v-8h6v8" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v11h14V10" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3 7h7l-5.5 4.5L18 22l-6-4-6 4 1.5-8.5L2 9h7z" />
    </svg>
  ),
  document: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  ),
  receipt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
    </svg>
  ),
};

const REPORTS: Report[] = [
  {
    id: "revenuePerCustomer",
    category: "finances",
    tone: "primary",
    badge: "planned",
    icon: ICONS.chart,
    lastRunKey: "today9",
    format: "XLSX · PDF",
    metaLeftKind: "deploymentPlan",
    metaLeftValue: "Mon · 09:00",
    metaRightKind: "delivery",
    metaRightKey: "emailSlack",
    secondary: "editSchedule",
    exportPath: "/api/reports/export?type=revenue-per-customer&format=xlsx",
  },
  {
    id: "revenuePerProperty",
    category: "finances",
    tone: "secondary",
    badge: null,
    icon: ICONS.building,
    lastRunKey: "threeDaysAgo",
    format: "XLSX",
    metaLeftKind: "rows",
    metaLeftValue: "10",
    metaRightKind: "delivery",
    metaRightKey: "uponRequest",
    secondary: "planFor",
    exportPath: "/api/reports/export?type=revenue-per-property&format=xlsx",
  },
  {
    id: "hoursTimeTracking",
    category: "operation",
    tone: "primary",
    badge: "core",
    icon: ICONS.home,
    lastRunKey: "yesterday23",
    format: "CSV · PDF",
    metaLeftKind: "deploymentPlan",
    metaLeftValue: "Daily · 23:00",
    metaRightKind: "delivery",
    metaRightKey: "datev",
    secondary: "editSchedule",
    exportPath: "/api/reports/working-time?format=csv",
  },
  {
    id: "employeePerformance",
    category: "operation",
    tone: "primary",
    badge: null,
    icon: ICONS.star,
    lastRunKey: "oneWeekAgo",
    format: "PDF · XLSX",
    metaLeftKind: "rows",
    metaLeftValue: "42",
    metaRightKind: "deploymentPlan",
    metaRightKey: "monthly1",
    secondary: "planFor",
    descriptionCount: 42,
    exportPath: "/api/reports/export?type=employee-performance",
  },
  {
    id: "bankStatementPackage",
    category: "finances",
    tone: "warning",
    badge: "new",
    icon: ICONS.document,
    lastRunKey: "never",
    format: "ZIP · PDFs",
    metaLeftKind: "customers",
    metaLeftValue: "10",
    metaRightKind: "deploymentPlan",
    metaRightKey: "notSpecified",
    secondary: "planFor",
    descriptionCount: 10,
    exportPath: "/api/reports/export?type=bank-statements",
  },
  {
    id: "vatReturn",
    category: "compliance",
    tone: "danger",
    badge: "core",
    icon: ICONS.receipt,
    lastRunKey: "april1March",
    format: "DATEV · PDF",
    metaLeftKind: "deploymentPlan",
    metaLeftValue: "Monthly · 01.",
    metaRightKind: "delivery",
    metaRightKey: "taxConsulting",
    secondary: "editSchedule",
    exportPath: "/api/reports/export?type=vat-return",
  },
  // Alltagshilfe monthly report — the only report whose "Create now"
  // is a navigation rather than a direct download, because the
  // recipient (management) needs to review the on-page totals before
  // hitting "Send to management". The export action sits on the page
  // itself; the card here just gets you there.
  {
    id: "alltagshilfeMonthly",
    category: "everydayHelp",
    tone: "danger",
    badge: "core",
    icon: ICONS.heart,
    lastRunKey: "april1March",
    format: "PDF · CSV",
    metaLeftKind: "deploymentPlan",
    metaLeftValue: "Monthly · 01. · 06:00",
    metaRightKind: "delivery",
    metaRightKey: "management",
    secondary: "editSchedule",
    exportPath: "/reports/alltagshilfe",
    href: routes.alltagshilfeReport,
  },
];

export function ReportLibrary() {
  const t        = useTranslations("reports.library");
  const tBadge   = useTranslations("reports.library.badges");
  const tFields  = useTranslations("reports.library.fields");
  const tActions = useTranslations("reports.library.actions");
  const tCats    = useTranslations("reports.library.categories");
  const tNames   = useTranslations("reports.library.reports");
  const tLast    = useTranslations("reports.library.lastRunFormats");
  const tDel     = useTranslations("reports.library.deliveryFormats");

  const [category, setCategory] = useState<Category>("all");

  const plannedCount = REPORTS.filter((r) => r.badge === "planned").length;
  const filtered =
    category === "all"
      ? REPORTS
      : REPORTS.filter((r) => r.category === category);

  const lastRunLabel = (k: Report["lastRunKey"]): string => {
    switch (k) {
      case "today9":         return tLast("today",     { time: "09:00" });
      case "threeDaysAgo":   return tLast("daysAgo",   { n: 3 });
      case "yesterday23":    return tLast("yesterday", { time: "23:00" });
      case "oneWeekAgo":     return tLast("weeksAgo",  { n: 1 });
      case "never":          return tLast("never");
      case "april1March":    return tLast("explicit",  { date: "01.04." });
    }
  };
  const metaRightLabel = (k: Report["metaRightKey"]): string => {
    switch (k) {
      case "emailSlack":    return "Email · Slack";
      case "uponRequest":   return tDel("uponRequest");
      case "datev":         return "DATEV";
      case "notSpecified":  return tDel("notSpecified");
      case "taxConsulting": return tFields("delivery") === "Delivery" ? "Tax consulting" : "Steuerberatung";
      case "monthly1":      return "Monthly · 01.";
      case "management":    return tDel("management");
    }
  };

  const CATEGORY_TABS: Array<{ id: Category; label: string; count: number }> = [
    { id: "all",          label: tCats("all"),          count: REPORTS.length },
    { id: "finances",     label: tCats("finances"),     count: REPORTS.filter((r) => r.category === "finances").length },
    { id: "operation",    label: tCats("operation"),    count: REPORTS.filter((r) => r.category === "operation").length },
    { id: "compliance",   label: tCats("compliance"),   count: REPORTS.filter((r) => r.category === "compliance").length },
    { id: "everydayHelp", label: tCats("everydayHelp"), count: REPORTS.filter((r) => r.category === "everydayHelp").length },
  ];

  return (
    <section className="mt-6 rounded-lg border border-neutral-100 bg-white p-5">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold tracking-[-0.01em] text-secondary-500">
            {t("title")}
          </h2>
          <p className="mt-0.5 text-[12px] text-neutral-500">
            {t("subtitle", { count: REPORTS.length })}
          </p>
        </div>
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-sm border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-500 opacity-70"
          title={t("createOwn")}
        >
          {t("createOwn")}
        </button>
      </header>

      <nav className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
        {CATEGORY_TABS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition",
              category === c.id
                ? "bg-primary-50 text-primary-700 ring-1 ring-primary-200"
                : "bg-neutral-50 text-neutral-600 hover:bg-neutral-100",
            )}
          >
            {c.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[10px] font-bold",
                category === c.id
                  ? "bg-primary-500 text-white"
                  : "bg-neutral-200 text-neutral-700",
              )}
            >
              {c.count}
            </span>
          </button>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-3 py-1 text-neutral-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <circle cx={12} cy={12} r={10} />
            <path d="M12 6v6l4 2" />
          </svg>
          {tCats("planned", { count: plannedCount })}
        </span>
      </nav>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((r) => (
          <article
            key={r.id}
            className="flex flex-col rounded-lg border border-neutral-100 bg-white p-4 transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md"
          >
            <header className="flex items-start justify-between gap-2">
              <span
                className={cn(
                  "grid h-10 w-10 flex-shrink-0 place-items-center rounded-md [&_svg]:h-5 [&_svg]:w-5",
                  TONE_BG[r.tone],
                )}
              >
                {r.icon}
              </span>
              {r.badge && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.05em]",
                    BADGE_STYLES[r.badge],
                  )}
                >
                  {tBadge(r.badge)}
                </span>
              )}
            </header>
            <h3 className="mt-3 text-[14px] font-semibold text-neutral-800">
              {tNames(`${r.id}.title` as never)}
            </h3>
            <p className="mt-1 line-clamp-3 text-[12px] leading-[1.5] text-neutral-500">
              {tNames(
                `${r.id}.description` as never,
                r.descriptionCount !== undefined
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ? ({ count: r.descriptionCount } as any)
                  : undefined,
              )}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
              <MetaCell label={tFields("lastRun")} value={lastRunLabel(r.lastRunKey)} />
              <MetaCell label={tFields("format")} value={r.format} />
              <MetaCell
                label={
                  r.metaLeftKind === "deploymentPlan"
                    ? tFields("deploymentPlan")
                    : r.metaLeftKind === "rows"
                      ? tFields("rows")
                      : tFields("customers")
                }
                value={r.metaLeftValue}
              />
              <MetaCell
                label={
                  r.metaRightKind === "delivery"
                    ? tFields("delivery")
                    : tFields("deploymentPlan")
                }
                value={metaRightLabel(r.metaRightKey)}
              />
            </dl>

            <footer className="mt-5 grid grid-cols-2 gap-2">
              <a
                href={r.exportPath}
                target="_blank"
                rel="noopener"
                className="rounded-sm bg-primary-500 px-3 py-1.5 text-center text-[12px] font-medium text-white hover:bg-primary-600"
              >
                {tActions("createNow")}
              </a>
              {r.href ? (
                <Link
                  href={r.href}
                  className="rounded-sm border border-neutral-200 bg-white px-3 py-1.5 text-center text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  {tActions(r.secondary)}
                </Link>
              ) : (
                <button
                  type="button"
                  className="rounded-sm border border-neutral-200 bg-white px-3 py-1.5 text-center text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  {tActions(r.secondary)}
                </button>
              )}
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-neutral-800">{value}</dd>
    </div>
  );
}

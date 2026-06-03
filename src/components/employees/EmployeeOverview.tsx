"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/utils/i18n-format";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import type {
  EmployeeOverviewData,
  WorkloadRow,
  CertificateRow,
  PersonnelEvent,
} from "@/lib/api/employee-overview";

/* ===========================================================================
 * EmployeeOverview — HR dashboard.
 *
 * Pixel-faithful conversion of the "Employee overview" prototype frame.
 * Five KPI tiles with colour top-stripes, "today" mini-strip, service
 * distribution stacked bar, team workload list, attendance donut + legend,
 * certificates table and personnel events feed.
 *
 * Pure presentation — every number comes from `loadEmployeeOverview()`
 * which the page already pre-fetches on the server.
 * ========================================================================= */
export function EmployeeOverview({ data }: { data: EmployeeOverviewData }) {
  const t = useTranslations("employeeOverview");
  const f = useFormat();
  const asOfLabel = `${f.date(data.asOf)} · ${f.time(data.asOf)}`;

  return (
    <>
      <nav className="mb-3 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumb.dashboard")}
        </Link>
        {" / "}
        <span className="text-neutral-700">{t("breadcrumb.current")}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
          </h1>
          <p className="mt-1 max-w-prose text-[13px] text-neutral-500">
            {t("subtitle")} · {t("asOf", { stamp: asOfLabel })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href="/api/reports/working-time?format=csv"
            className="btn btn--ghost border border-neutral-200 bg-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            {t("export")}
          </a>
          <Link
            href={routes.employees}
            className="btn btn--ghost border border-neutral-200 bg-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
            {t("fullList")}
          </Link>
          <Link href={routes.employees} className="btn btn--primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t("newEmployee")}
          </Link>
        </div>
      </header>

      {/* ---- KPI strip (5 tiles with color stripes) -------------------- */}
      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiStripe
          stripe="primary"
          label={t("kpi.active.label")}
          value={String(data.kpis.activeEmployees)}
          sub={t("kpi.active.sub", { n: 2 })}
        />
        <KpiStripe
          stripe="secondary"
          label={t("kpi.inUseToday.label")}
          value={`${data.kpis.inUseToday} `}
          suffix={<span className="text-neutral-400">/ {data.kpis.activeEmployees}</span>}
          sub={t("kpi.inUseToday.sub", { n: data.today.freeToday + data.today.laterToday })}
        />
        <KpiStripe
          stripe="primary"
          label={t("kpi.occupancy.label")}
          value={`${data.kpis.averageOccupancyPercent}`}
          suffix={<span className="text-neutral-500">%</span>}
          sub={t(
            data.kpis.occupancyDeltaPp >= 0
              ? "kpi.occupancy.subUp"
              : "kpi.occupancy.subDown",
            { pp: Math.abs(data.kpis.occupancyDeltaPp) },
          )}
        />
        <KpiStripe
          stripe="secondary"
          label={t("kpi.certificates.label")}
          value={String(data.kpis.certificatesDueIn90Days)}
          sub={t("kpi.certificates.sub")}
        />
        <KpiStripe
          stripe="danger"
          label={t("kpi.onboarding.label")}
          value={String(data.kpis.onboardingOpen)}
          sub={
            data.kpis.onboardingOpenSampleName
              ? `${data.kpis.onboardingOpenSampleName}${data.kpis.onboardingOpenSampleModule ? " · " + data.kpis.onboardingOpenSampleModule : ""}`
              : t("kpi.onboarding.subEmpty")
          }
        />
      </section>

      {/* ---- Today block ----------------------------------------------- */}
      <section className="mb-6 rounded-lg border border-neutral-100 bg-white p-5">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-neutral-800">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-primary-500">
              <circle cx={12} cy={12} r={10} />
              <path d="M12 6v6l4 2" />
            </svg>
            {t("today.title", { date: f.date(data.asOf) })}
          </h2>
          <Link
            href={routes.schedule}
            className="text-[12px] font-medium text-primary-700 hover:text-primary-800"
          >
            {t("today.openPlan")} →
          </Link>
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <TodayTile tone="primary"   value={data.today.inUseNow}    label={t("today.inUseNow")} />
          <TodayTile tone="secondary" value={data.today.laterToday} label={t("today.laterToday")} />
          <TodayTile tone="neutral"   value={data.today.freeToday}  label={t("today.freeToday")} />
          <TodayTile tone="warning"   value={data.today.vacationOrSick} label={t("today.vacationSick")} />
        </div>

        <div className="mt-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
            {t("today.serviceDistribution")}
          </div>
          <ServiceBar dist={data.serviceDistribution} />
        </div>
      </section>

      {/* ---- Two-up: workload + attendance ----------------------------- */}
      <section className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <WorkloadPanel rows={data.workload} totalEmployees={data.kpis.activeEmployees} />
        <AttendancePanel data={data.attendance} />
      </section>

      {/* ---- Two-up: certificates + events ----------------------------- */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CertificatesPanel rows={data.certificates} />
        <EventsPanel events={data.events} />
      </section>
    </>
  );
}

/* ---------- Small presentational primitives ----------------------------- */

function KpiStripe({
  stripe,
  label,
  value,
  suffix,
  sub,
}: {
  stripe: "primary" | "secondary" | "danger" | "warning";
  label: string;
  value: string;
  suffix?: React.ReactNode;
  sub?: string;
}) {
  const stripeColor = {
    primary: "bg-primary-500",
    secondary: "bg-secondary-500",
    danger: "bg-error-500",
    warning: "bg-warning-500",
  }[stripe];
  return (
    <div className="relative overflow-hidden rounded-lg border border-neutral-100 bg-white p-4">
      <span className={cn("absolute inset-x-0 top-0 h-1", stripeColor)} aria-hidden />
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[26px] font-bold tracking-[-0.02em] text-secondary-500">
          {value}
        </span>
        {suffix}
      </div>
      {sub && <div className="mt-1 text-[11px] text-neutral-500">{sub}</div>}
    </div>
  );
}

function TodayTile({
  tone,
  value,
  label,
}: {
  tone: "primary" | "secondary" | "neutral" | "warning";
  value: number;
  label: string;
}) {
  const ring = {
    primary:   "border-primary-200   bg-primary-50",
    secondary: "border-secondary-100 bg-secondary-50",
    neutral:   "border-neutral-200   bg-neutral-50",
    warning:   "border-warning-200   bg-warning-50",
  }[tone];
  const dot = {
    primary: "bg-primary-500",
    secondary: "bg-secondary-500",
    neutral: "bg-neutral-400",
    warning: "bg-warning-500",
  }[tone];
  return (
    <div className={cn("rounded-md border px-4 py-3", ring)}>
      <div className="text-[24px] font-bold tracking-[-0.02em] text-secondary-500">
        {value}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-neutral-700">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
        {label}
      </div>
    </div>
  );
}

function ServiceBar({ dist }: { dist: { priyas: number; everyday: number; both: number } }) {
  const total = dist.priyas + dist.everyday + dist.both || 1;
  const seg = (n: number) => Math.max(0, Math.round((n / total) * 100));
  return (
    <>
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className="flex items-center justify-center text-[10px] font-semibold text-white"
          style={{ width: `${seg(dist.priyas)}%`, background: "var(--primary-500)" }}
        >
          {dist.priyas > 0 && `Priya's · ${dist.priyas}`}
        </div>
        <div
          className="flex items-center justify-center text-[10px] font-semibold text-white"
          style={{ width: `${seg(dist.everyday)}%`, background: "var(--error-500)" }}
        >
          {dist.everyday > 0 && `Everyday help · ${dist.everyday}`}
        </div>
        <div
          className="flex items-center justify-center text-[10px] font-semibold text-white"
          style={{
            width: `${seg(dist.both)}%`,
            background: "linear-gradient(to right, var(--primary-500), var(--error-500))",
          }}
        >
          {dist.both > 0 && `Both · ${dist.both}`}
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-4 text-[11px] text-neutral-600">
        <li className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary-500" />
          {dist.priyas} cleaning
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-error-500" />
          {dist.everyday} Care
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{
              background:
                "linear-gradient(to right, var(--primary-500), var(--error-500))",
            }}
          />
          {dist.both} Both
        </li>
      </ul>
    </>
  );
}

function WorkloadPanel({
  rows,
  totalEmployees,
}: {
  rows: WorkloadRow[];
  totalEmployees: number;
}) {
  const t = useTranslations("employeeOverview.workload");
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-5">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-neutral-800">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-primary-500">
            <path d="M3 3v18h18" />
            <path d="M7 13l4-4 4 4 5-7" />
          </svg>
          {t("title")}
        </h2>
        <span className="text-[11px] text-neutral-500">
          {t("showing", { n: rows.length, total: totalEmployees })}
        </span>
      </header>
      <ul className="divide-y divide-neutral-100">
        {rows.map((r) => (
          <li key={r.employeeId} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3">
            <span
              className={cn(
                "grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-[11px] font-bold text-white",
                r.serviceLine === "everyday"
                  ? "bg-error-500"
                  : r.serviceLine === "both"
                    ? "bg-secondary-500"
                    : "bg-primary-500",
              )}
            >
              {r.initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-neutral-800">
                {r.name}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.05em]">
                <ServicePill line={r.serviceLine} />
                <span className="text-neutral-500">{r.team}</span>
              </div>
            </div>
            <div className="flex w-[210px] flex-col items-end gap-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={cn(
                    "h-full rounded-full",
                    r.tone === "danger"
                      ? "bg-error-500"
                      : r.tone === "warning"
                        ? "bg-warning-500"
                        : r.tone === "idle"
                          ? "bg-neutral-300"
                          : "bg-primary-500",
                  )}
                  style={{ width: `${Math.min(100, r.utilizationPercent)}%` }}
                />
              </div>
              <div className="flex w-full items-center justify-between text-[11px]">
                <span
                  className={cn(
                    "font-mono font-semibold",
                    r.tone === "danger"
                      ? "text-error-700"
                      : r.tone === "warning"
                        ? "text-warning-700"
                        : r.tone === "idle"
                          ? "text-neutral-400"
                          : "text-success-700",
                  )}
                >
                  {r.utilizationPercent}%
                </span>
                <span className="text-neutral-500">
                  {r.hoursThisWeek}/{r.weeklyHours} h
                </span>
              </div>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-6 text-center text-[12px] text-neutral-500">
            {t("empty")}
          </li>
        )}
      </ul>
    </div>
  );
}

function ServicePill({ line }: { line: WorkloadRow["serviceLine"] }) {
  if (line === "everyday")
    return (
      <span className="rounded-full bg-error-50 px-1.5 py-0.5 text-[9px] font-bold text-error-700">
        EVERYDAY HELP
      </span>
    );
  if (line === "both")
    return (
      <span className="rounded-full bg-secondary-50 px-1.5 py-0.5 text-[9px] font-bold text-secondary-700">
        BOTH
      </span>
    );
  return (
    <span className="rounded-full bg-primary-50 px-1.5 py-0.5 text-[9px] font-bold text-primary-700">
      PRIYA'S
    </span>
  );
}

function AttendancePanel({
  data,
}: {
  data: {
    punctualityPercent: number;
    present: number;
    delayed: number;
    onHoliday: number;
    reportedSick: number;
  };
}) {
  const t = useTranslations("employeeOverview.attendance");
  // Donut math — inline SVG so we don't import Recharts here.
  const R = 56;
  const C = 2 * Math.PI * R;
  const dash = (C * data.punctualityPercent) / 100;
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-5">
      <h2 className="flex items-center gap-2 text-[14px] font-semibold text-neutral-800">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-secondary-500">
          <path d="M12 2a10 10 0 100 20 10 10 0 000-20z" />
          <path d="M12 6v6l4 2" />
        </svg>
        {t("title")}
      </h2>
      <div className="mt-4 grid grid-cols-[140px_1fr] items-center gap-5">
        <div className="relative grid h-[140px] w-[140px] place-items-center">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
            <circle cx={70} cy={70} r={R} stroke="var(--neutral-100)" strokeWidth={16} fill="none" />
            <circle
              cx={70}
              cy={70}
              r={R}
              stroke="var(--primary-500)"
              strokeWidth={16}
              strokeLinecap="butt"
              fill="none"
              strokeDasharray={`${dash} ${C - dash}`}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="text-[22px] font-bold text-secondary-500">
                {data.punctualityPercent}%
              </div>
              <div className="text-[9px] font-bold uppercase tracking-[0.05em] text-neutral-500">
                {t("punctuality")}
              </div>
            </div>
          </div>
        </div>

        <dl className="space-y-2 text-[12px]">
          <LegendRow color="bg-primary-500" label={t("legend.present")} value={data.present} />
          <LegendRow color="bg-warning-500" label={t("legend.delayed")} value={data.delayed} />
          <LegendRow color="bg-secondary-500" label={t("legend.onHoliday")} value={data.onHoliday} />
          <LegendRow color="bg-error-500" label={t("legend.sick")} value={data.reportedSick} />
        </dl>
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-neutral-700">
        <span className={cn("h-2.5 w-2.5 rounded-sm", color)} />
        {label}
      </dt>
      <dd className="font-mono font-semibold text-neutral-800">{value}</dd>
    </div>
  );
}

function CertificatesPanel({ rows }: { rows: CertificateRow[] }) {
  const t = useTranslations("employeeOverview.certificates");
  const f = useFormat();
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-5">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold text-neutral-800">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-primary-500">
            <path d="M12 2l1.7 4.3L18 7l-3 3.3L15.7 15 12 12.8 8.3 15 9 10.3 6 7l4.3-.7L12 2z" />
          </svg>
          {t("title")}
        </h2>
        {rows.length > 0 && (
          <Link href={routes.training} className="text-[12px] font-medium text-primary-700 hover:text-primary-800">
            {t("seeAll")} →
          </Link>
        )}
      </header>
      <ul className="divide-y divide-neutral-100">
        {rows.length === 0 && (
          <li className="py-6 text-center text-[12px] text-neutral-500">
            {t("empty")}
          </li>
        )}
        {rows.map((c) => (
          <li key={c.id} className="flex items-start gap-3 py-3">
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-primary-50 text-primary-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M12 2l1.7 4.3L18 7l-3 3.3L15.7 15 12 12.8 8.3 15 9 10.3 6 7l4.3-.7L12 2z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-neutral-800">
                {c.title}
                {c.employeeName && (
                  <span className="font-normal text-neutral-500"> · {c.employeeName}</span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                {t("validUntil", { date: f.date(c.validUntil) })}
                {c.daysUntil !== null &&
                  ` · ${t("dueIn", { days: c.daysUntil })}`}
              </div>
            </div>
            <CertStatusPill status={c.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CertStatusPill({ status }: { status: CertificateRow["status"] }) {
  const cls: Record<CertificateRow["status"], { bg: string; label: string }> = {
    ok:                 { bg: "bg-success-50 text-success-700", label: "OK" },
    in_4_months:        { bg: "bg-neutral-100 text-neutral-700", label: "IN 4 MONTHS" },
    in_2_months:        { bg: "bg-warning-50 text-warning-700", label: "IN 2 MONTHS" },
    urgent:             { bg: "bg-error-50 text-error-700",     label: "URGENT" },
    training_underway:  { bg: "bg-secondary-50 text-secondary-700", label: "TRAINING UNDERWAY" },
    onboarding:         { bg: "bg-primary-50 text-primary-700", label: "ONBOARDING" },
  };
  const c = cls[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.05em]", c.bg)}>
      {c.label}
    </span>
  );
}

function EventsPanel({ events }: { events: PersonnelEvent[] }) {
  const t = useTranslations("employeeOverview.events");
  const f = useFormat();
  return (
    <div className="rounded-lg border border-neutral-100 bg-white p-5">
      <h2 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-neutral-800">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-secondary-500">
          <circle cx={12} cy={12} r={10} />
          <path d="M12 6v6l4 2" />
        </svg>
        {t("title")}
      </h2>
      {events.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-neutral-500">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3">
              <span className={cn("grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-[11px]", eventIconBg(e.type))}>
                {eventIcon(e.type)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-neutral-800">{e.message}</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.05em] text-neutral-400">
                  {f.relative(e.ts)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function eventIconBg(type: PersonnelEvent["type"]): string {
  switch (type) {
    case "module_completed": return "bg-success-50 text-success-700";
    case "capacity_alert":   return "bg-warning-50 text-warning-700";
    case "shift_handover":   return "bg-secondary-50 text-secondary-700";
    case "vacation_scheduled": return "bg-primary-50 text-primary-700";
    case "rating":           return "bg-primary-50 text-primary-700";
    default:                 return "bg-neutral-100 text-neutral-700";
  }
}

function eventIcon(type: PersonnelEvent["type"]): React.ReactNode {
  // SVGs sized to inherit the parent's color via currentColor.
  const c = (path: React.ReactNode) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      {path}
    </svg>
  );
  switch (type) {
    case "module_completed": return c(<path d="M20 6L9 17l-5-5" />);
    case "capacity_alert":   return c(<><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1={12} y1={9} x2={12} y2={13} /><line x1={12} y1={17} x2={12.01} y2={17} /></>);
    case "shift_handover":   return c(<><path d="M3 12l4-4M3 12l4 4M3 12h18" /></>);
    case "vacation_scheduled": return c(<><rect x={3} y={5} width={18} height={16} rx={2} /><path d="M3 9h18M8 3v4M16 3v4" /></>);
    case "rating":           return c(<path d="M12 2l1.7 4.3L18 7l-3 3.3L15.7 15 12 12.8 8.3 15 9 10.3 6 7l4.3-.7L12 2z" />);
    default:                 return c(<><circle cx={12} cy={12} r={4} /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></>);
  }
}

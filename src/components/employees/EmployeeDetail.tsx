import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { useFormat } from "@/lib/utils/i18n-format";
import type { EmployeeDetail as Detail } from "@/lib/api/employees.types";
import { EmployeeDetailActions } from "./EmployeeDetailActions";

const toneClass: Record<Detail["tone"], string> = {
  primary: "bg-primary-500",
  secondary: "bg-secondary-500",
  accent: "bg-accent-600",
  warning: "bg-warning-500",
};

const roleChipClass: Record<Detail["role_chip"], string> = {
  pm: "bg-primary-50 text-primary-700",
  field: "bg-secondary-50 text-secondary-700",
  trainee: "bg-warning-50 text-warning-700",
};

export function EmployeeDetail({
  detail,
  canUpdate,
  canArchive,
}: {
  detail: Detail;
  canUpdate: boolean;
  canArchive: boolean;
}) {
  const t = useTranslations("employees.detail");
  const tRole = useTranslations("employees.role");
  const f = useFormat();

  return (
    <>
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <Link href={routes.employees} className="hover:text-neutral-700">
          {t("breadcrumbEmployees")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="truncate text-neutral-700">{detail.full_name}</span>
      </nav>

      {/* Hero */}
      <section className="mb-6 rounded-lg border border-neutral-100 bg-white p-5">
        <div className="flex flex-wrap items-start gap-5">
          <span
            className={cn(
              "grid h-16 w-16 flex-shrink-0 place-items-center rounded-full text-[20px] font-bold text-white",
              toneClass[detail.tone],
            )}
          >
            {detail.initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[24px] font-bold text-secondary-500">
                {detail.full_name}
              </h1>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]",
                  roleChipClass[detail.role_chip],
                )}
              >
                {tRole(detail.role_chip)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-neutral-500">
              {detail.email && <span>✉ {detail.email}</span>}
              {detail.phone && <span>☎ {detail.phone}</span>}
              <span>· {detail.team_label}</span>
              {detail.hire_date && (
                <span>
                  · {t("statHireDate")}: {f.date(detail.hire_date)}
                </span>
              )}
            </div>

            {/* Stats row */}
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label={t("statHoursWeek")} value={`${detail.hours_this_week}h`} />
              <Stat label={t("statHoursMonth")} value={`${detail.hours_this_month}h`} />
              <Stat label={t("statShiftsMonth")} value={detail.shifts_this_month} />
              <Stat label={t("statTotal")} value={detail.shifts_total} />
              <Stat
                label={t("statRate")}
                value={
                  detail.hourly_rate_eur
                    ? `€${detail.hourly_rate_eur.toFixed(2)}`
                    : "—"
                }
                accent="primary"
              />
            </div>
          </div>

          <EmployeeDetailActions
            initial={{
              id: detail.id,
              full_name: detail.full_name,
              email: detail.email,
              phone: detail.phone,
              hire_date: detail.hire_date,
              weekly_hours: detail.weekly_hours,
              hourly_rate_eur: detail.hourly_rate_eur,
              status: detail.status,
            }}
            canUpdate={canUpdate}
            canArchive={canArchive}
          />
        </div>
      </section>

      {/* Tabs */}
      <section className="mb-5 rounded-lg border border-neutral-100 bg-white">
        <div className="flex flex-wrap gap-1 overflow-x-auto border-b border-neutral-100 px-2 py-1.5 text-[13px]">
          <Tab active>{t("tabOverview")}</Tab>
          <Tab count={detail.shifts_total}>{t("tabShifts")}</Tab>
          <Tab>{t("tabHours")}</Tab>
          <Tab>{t("tabDocuments")}</Tab>
          <Tab>{t("tabHistory")}</Tab>
        </div>
      </section>

      {/* Body */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <UpcomingShiftsCard detail={detail} />
          <RecentTimeEntriesCard detail={detail} />
        </div>
        <div className="flex flex-col gap-5">
          <VacationCard detail={detail} />
          <ProfileCard detail={detail} />
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "primary";
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </div>
      <div
        className={cn(
          "text-[20px] font-bold leading-tight tracking-[-0.01em]",
          accent === "primary" ? "text-primary-700" : "text-secondary-500",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Tab({
  active,
  count,
  children,
}: {
  active?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-2 rounded-md px-3 py-2",
        active ? "text-primary-700" : "text-neutral-600",
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
          {count}
        </span>
      )}
      {active && (
        <span className="absolute inset-x-2 -bottom-[7px] h-0.5 rounded-full bg-primary-500" />
      )}
    </span>
  );
}

function UpcomingShiftsCard({ detail }: { detail: Detail }) {
  const t = useTranslations("employees.detail");
  const f = useFormat();
  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 p-5">
        <h3 className="text-[15px] font-semibold text-neutral-800">
          {t("upcomingTitle")}
        </h3>
      </header>
      <div className="px-5 py-2">
        {detail.upcoming_shifts.length === 0 && (
          <div className="py-10 text-center text-[13px] text-neutral-500">
            {t("upcomingEmpty")}
          </div>
        )}
        {detail.upcoming_shifts.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 border-b border-neutral-100 py-3 last:border-b-0"
          >
            <div className="w-[80px] flex-shrink-0 font-mono text-[12px] font-semibold text-neutral-500">
              {f.weekdayShort(s.starts_at)} {f.time(s.starts_at)}
            </div>
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary-500 ring-[3px] ring-primary-100" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-neutral-800">
                {s.property_name} · {s.client_name}
              </div>
              <div className="text-[11px] text-neutral-500">
                {s.duration_h.toFixed(s.duration_h % 1 === 0 ? 0 : 1)}h
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentTimeEntriesCard({ detail }: { detail: Detail }) {
  const t = useTranslations("employees.detail");
  const f = useFormat();
  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 p-5">
        <h3 className="text-[15px] font-semibold text-neutral-800">
          {t("recentTitle")}
        </h3>
      </header>
      <div className="px-5 py-2">
        {detail.recent_time_entries.length === 0 && (
          <div className="py-10 text-center text-[13px] text-neutral-500">
            {t("recentEmpty")}
          </div>
        )}
        {detail.recent_time_entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-3 border-b border-neutral-100 py-3 last:border-b-0"
          >
            <div className="w-[80px] flex-shrink-0 font-mono text-[12px] text-neutral-500">
              {f.weekdayShort(entry.check_in_at)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-neutral-800">
                {entry.property_name}
              </div>
              <div className="text-[11px] text-neutral-500">
                {f.time(entry.check_in_at)}
                {entry.check_out_at
                  ? ` – ${f.time(entry.check_out_at)}`
                  : " – …"}
              </div>
            </div>
            <span className="font-mono text-[12px] font-semibold text-secondary-500">
              {entry.hours.toFixed(1)}h
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function VacationCard({ detail }: { detail: Detail }) {
  const t = useTranslations("employees.detail");
  const remaining = detail.vacation_total - detail.vacation_used;
  const pct = (detail.vacation_used / detail.vacation_total) * 100;
  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 p-5">
        <h3 className="text-[15px] font-semibold text-neutral-800">
          {t("vacationTitle")}
        </h3>
      </header>
      <div className="p-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[24px] font-bold text-secondary-500">
            {remaining}
          </span>
          <span className="text-[11px] text-neutral-500">
            {t("vacationUsed", {
              used: detail.vacation_used,
              total: detail.vacation_total,
            })}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-primary-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-[11px] text-neutral-500">
          {t("vacationRemaining", { count: remaining })}
        </div>
      </div>
    </section>
  );
}

function ProfileCard({ detail }: { detail: Detail }) {
  const t = useTranslations("employees.detail");
  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 p-5">
        <h3 className="text-[15px] font-semibold text-neutral-800">
          {t("infoTitle")}
        </h3>
      </header>
      <dl className="divide-y divide-neutral-100 px-5">
        <Row
          label={t("infoEmployeeId")}
          value={`EMP-${detail.id.slice(0, 8).toUpperCase()}`}
          mono
        />
        <Row label={t("infoEmail")} value={detail.email ?? "—"} />
        <Row label={t("infoPhone")} value={detail.phone ?? "—"} />
        <Row label={t("infoTeam")} value={detail.team_label} />
        <Row label={t("infoStatus")} value={detail.status} />
        <Row label={t("infoWeeklyHours")} value={`${detail.weekly_hours}h`} />
        <Row label={t("infoLanguage")} value="DE · EN" />
      </dl>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3 py-3 text-[12px]">
      <dt className="text-neutral-500">{label}</dt>
      <dd
        className={cn(
          "text-right",
          mono ? "font-mono text-neutral-700" : "text-neutral-800",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

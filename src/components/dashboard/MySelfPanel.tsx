"use client";

import Link from "next/link";
import { format } from "date-fns";
import { de as deLocale, enUS as enLocale, ta as taLocale } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import type { MySelfData } from "@/lib/api/my-self";

const localeMap = { de: deLocale, en: enLocale, ta: taLocale } as const;

/**
 * Dashboard widget visible to anyone whose auth profile is linked to an
 * `employees` row — typically field staff, but admins/dispatchers who
 * also clock in see it too. Gives them the "my hours / my vacation /
 * my training" snapshot the spec promises field staff in §3.3, plus a
 * working-time CSV download that's gated to the caller's own employee
 * row by /api/reports/working-time.
 */
export function MySelfPanel({ data }: { data: MySelfData }) {
  const t = useTranslations("dashboard.mine");
  const locale = useLocale() as keyof typeof localeMap;

  const month = new Date().toISOString().slice(0, 7);
  const csvHref = `/api/reports/working-time?month=${month}&employee=${data.employee_id}`;

  const hoursPct = Math.min(
    150,
    Math.round((data.hours_this_week / Math.max(1, data.weekly_target)) * 100),
  );
  const vacationLeft = Math.max(0, data.vacation_total - data.vacation_used);

  return (
    <section className="rounded-lg border border-neutral-100 bg-white p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-secondary-500">
            {t("title", { name: data.full_name.split(" ")[0] ?? "" })}
          </h3>
          <p className="mt-0.5 text-[12px] text-neutral-500">{t("subtitle")}</p>
        </div>
        <a
          href={csvHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--ghost border border-neutral-200 bg-white text-[12px]"
        >
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
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          {t("downloadHours")}
        </a>
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={t("hoursWeek")}
          value={`${data.hours_this_week} h`}
          sub={t("ofTarget", { target: data.weekly_target })}
        />
        <Stat
          label={t("hoursMonth")}
          value={`${data.hours_this_month} h`}
          sub={format(new Date(), "MMMM", { locale: localeMap[locale] })}
        />
        <Stat
          label={t("vacation")}
          value={`${vacationLeft} / ${data.vacation_total}`}
          sub={t("daysLeft")}
        />
        <Stat
          label={t("mandatory")}
          value={String(data.outstanding_mandatory.length)}
          sub={
            data.outstanding_mandatory.length === 0
              ? t("mandatoryClear")
              : t("mandatoryOpen")
          }
          tone={
            data.outstanding_mandatory.length > 0 ? "warn" : "ok"
          }
        />
      </div>

      {/* Hours bar */}
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-500">
          <span>{t("hoursBarLabel")}</span>
          <span className="font-mono">{hoursPct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              hoursPct >= 100
                ? "bg-error-500"
                : hoursPct >= 90
                  ? "bg-warning-500"
                  : "bg-primary-500",
            )}
            style={{ width: `${Math.min(100, hoursPct)}%` }}
          />
        </div>
      </div>

      {/* Outstanding training callout */}
      {data.outstanding_mandatory.length > 0 && (
        <div className="mt-4 rounded-md border border-warning-50 bg-warning-50/40 p-3">
          <div className="text-[12px] font-semibold text-warning-700">
            {t("trainingPending", { n: data.outstanding_mandatory.length })}
          </div>
          <ul className="mt-1.5 space-y-0.5 text-[12px] text-warning-700">
            {data.outstanding_mandatory.slice(0, 3).map((m) => (
              <li key={m.id} className="truncate">
                · {m.title}
              </li>
            ))}
            {data.outstanding_mandatory.length > 3 && (
              <li className="text-warning-700/80">
                · {t("andMore", {
                  n: data.outstanding_mandatory.length - 3,
                })}
              </li>
            )}
          </ul>
          <Link
            href={routes.training}
            className="mt-2 inline-block text-[12px] font-medium text-primary-600 hover:underline"
          >
            {t("openTraining")} →
          </Link>
        </div>
      )}

      {/* Upcoming shifts (compact list) */}
      {data.upcoming_shifts.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
            {t("upcomingTitle")}
          </div>
          <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-100">
            {data.upcoming_shifts.map((s) => {
              const start = new Date(s.starts_at);
              const end = new Date(s.ends_at);
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px]"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-800">
                      {s.property_name}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      {s.client_name}
                    </div>
                  </div>
                  <div className="text-right font-mono text-[11px] text-neutral-700">
                    {format(start, "EEE d. MMM", {
                      locale: localeMap[locale],
                    })}
                    <div className="text-neutral-500">
                      {format(start, "HH:mm")} – {format(end, "HH:mm")}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link
            href={routes.schedule}
            className="mt-2 inline-block text-[12px] font-medium text-primary-600 hover:underline"
          >
            {t("openSchedule")} →
          </Link>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "warn" | "ok";
}) {
  return (
    <div className="rounded-md border border-neutral-100 bg-white p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-[18px] font-bold text-secondary-500">
        {value}
      </div>
      <div
        className={cn(
          "text-[10px]",
          tone === "warn"
            ? "text-warning-700"
            : tone === "ok"
              ? "text-success-700"
              : "text-neutral-500",
        )}
      >
        {sub}
      </div>
    </div>
  );
}

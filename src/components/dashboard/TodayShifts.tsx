"use client";

import Link from "next/link";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import type { TodayShift } from "@/lib/api/dashboard.types";

const toneClass: Record<TodayShift["team"][number]["tone"], string> = {
  primary: "bg-primary-500",
  secondary: "bg-secondary-500",
  accent: "bg-accent-600",
};
const flagClass: Record<TodayShift["flag"], string> = {
  ok: "bg-primary-500 ring-primary-100",
  warn: "bg-warning-500 ring-warning-50",
  done: "bg-success-500 ring-success-50",
};

type Props = {
  shifts: TodayShift[];
  pendingCount: number;
};

export function TodayShifts({ shifts, pendingCount }: Props) {
  const t = useTranslations("dashboard.todaySchedule");
  const tDash = useTranslations("dashboard");

  const subtitle =
    pendingCount > 0
      ? t("subtitle", { count: shifts.length, pending: pendingCount })
      : t("subtitleAllChecked", { count: shifts.length });

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-100 p-5">
        <div>
          <h3 className="text-[15px] font-semibold text-neutral-800">
            {t("title")}
          </h3>
          <div className="mt-0.5 text-[12px] text-neutral-500">{subtitle}</div>
        </div>
        <Link
          href={routes.schedule}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-primary-600 hover:text-primary-700"
        >
          {tDash("viewAll")} →
        </Link>
      </header>

      <div className="px-5 py-2">
        {shifts.length === 0 && (
          <div className="py-10 text-center text-[13px] text-neutral-500">
            {t("empty")}
          </div>
        )}

        {shifts.map((s) => {
          const start = format(new Date(s.startsAt), "HH:mm");
          const title = `${s.property} · ${s.client}`;
          const detail = s.flag === "warn" ? t("checkinPending") : s.flagDetail;
          return (
            <div
              key={s.id}
              className="flex items-center gap-3 border-b border-neutral-100 py-3.5 last:border-b-0"
            >
              <div className="w-[70px] flex-shrink-0 font-mono text-[12px] font-semibold text-neutral-500">
                {start}
              </div>
              <span
                className={cn(
                  "h-2.5 w-2.5 flex-shrink-0 rounded-full ring-[3px]",
                  flagClass[s.flag],
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-neutral-800">
                  {title}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                  {s.serviceLabel} · {s.durationLabel}
                  {detail ? ` · ${detail}` : ""}
                </div>
              </div>
              <div className="flex flex-shrink-0">
                {s.team.map((member, idx) => (
                  <span
                    key={idx}
                    className={cn(
                      "grid h-6 w-6 place-items-center rounded-full border-2 border-white text-[10px] font-bold text-white",
                      toneClass[member.tone],
                      idx > 0 && "-ml-1.5",
                    )}
                  >
                    {member.initials}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

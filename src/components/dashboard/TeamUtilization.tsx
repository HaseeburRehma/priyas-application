"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import type { TeamLoad, TeamLoadRole } from "@/lib/api/dashboard.types";

const toneClass: Record<TeamLoad["tone"], string> = {
  primary: "bg-primary-500",
  secondary: "bg-secondary-500",
  accent: "bg-accent-600",
};

export function TeamUtilization({ team }: { team: TeamLoad[] }) {
  const t = useTranslations("dashboard.team");
  // Mirrors the employees-list chip vocabulary so the dashboard label
  // ("Projektleitung" / "Reinigungskraft") matches /employees rather
  // than diverging into "Team Lead" / "Field Staff" hardcoded text.
  const tRole = useTranslations("employees.role");
  const tDash = useTranslations("dashboard");
  const active = team.length;
  const roleLabel = (role: TeamLoadRole) => tRole(role);

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-100 p-5">
        <div>
          <h3 className="text-[15px] font-semibold text-neutral-800">
            {t("title")}
          </h3>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            {t("subtitle", { count: active })}
          </div>
        </div>
        <Link
          href={routes.employees}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-primary-600 hover:text-primary-700"
        >
          {tDash("viewTeam")} →
        </Link>
      </header>
      <div className="px-5 py-2">
        {team.length === 0 && (
          <div className="py-10 text-center text-[13px] text-neutral-500">
            {t("empty")}
          </div>
        )}
        {team.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 border-b border-neutral-100 py-2.5 last:border-b-0"
          >
            <span
              className={cn(
                "grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[10px] font-bold text-white",
                toneClass[m.tone],
              )}
            >
              {m.initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-neutral-800">
                {m.name}
              </div>
              <div className="text-[11px] text-neutral-500">
                {roleLabel(m.role)} · {m.hours} / {m.target} h
              </div>
            </div>
            <div className="hidden h-1.5 max-w-[160px] flex-1 overflow-hidden rounded-full bg-neutral-100 sm:block">
              <div
                className={cn(
                  "h-full rounded-full",
                  m.pct >= 100
                    ? "bg-error-500"
                    : m.pct >= 90
                      ? "bg-warning-500"
                      : "bg-primary-500",
                )}
                style={{ width: `${Math.max(2, Math.min(100, m.pct))}%` }}
              />
            </div>
            <div className="w-9 text-right text-[11px] font-semibold tabular-nums text-neutral-500">
              {m.pct}%
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

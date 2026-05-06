"use client";

import { useTranslations } from "next-intl";
import type { ClientsSummary as Summary } from "@/lib/api/clients.types";

type Props = { summary: Summary };

export function ClientsSummaryStrip({ summary }: Props) {
  const t = useTranslations("clients.summary");

  const activePct =
    summary.total > 0
      ? `${Math.round((summary.activeContracts / summary.total) * 100)} %`
      : "—";

  return (
    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        label={t("total")}
        value={summary.total}
        sub={
          summary.newThisMonth > 0
            ? t("totalThisMonth", { count: summary.newThisMonth })
            : t("totalNone")
        }
        tone={summary.newThisMonth > 0 ? "up" : "muted"}
      />
      <Card
        label={t("active")}
        value={summary.activeContracts}
        sub={t("activeOfTotal", { percent: activePct })}
      />
      <Card
        label={t("new30")}
        value={summary.newLast30Days}
        sub={t("new30Sub")}
        tone={summary.newLast30Days > 0 ? "up" : "muted"}
      />
      <Card
        label={t("ending")}
        value={summary.endingSoon}
        sub={t("endingSub")}
        tone={summary.endingSoon > 0 ? "warn" : "muted"}
      />
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  tone = "muted",
}: {
  label: string;
  value: number | string;
  sub: string;
  tone?: "up" | "warn" | "muted";
}) {
  const subColor =
    tone === "up"
      ? "text-success-500"
      : tone === "warn"
        ? "text-warning-700"
        : "text-neutral-500";
  return (
    <div className="rounded-md border border-neutral-100 bg-white p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </div>
      <div className="mt-1.5 text-[22px] font-bold tracking-[-0.01em] text-secondary-500">
        {value}
      </div>
      <div className={`mt-0.5 text-[11px] ${subColor}`}>{sub}</div>
    </div>
  );
}

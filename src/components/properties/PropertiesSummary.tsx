"use client";

import { useTranslations } from "next-intl";
import type { PropertiesSummary as Summary } from "@/lib/api/properties.types";

export function PropertiesSummaryStrip({ summary }: { summary: Summary }) {
  const t = useTranslations("properties.summary");

  const activePct =
    summary.total > 0
      ? `${((summary.activelyServiced / summary.total) * 100).toFixed(1)}%`
      : "—";

  return (
    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        label={t("total")}
        value={summary.total}
        sub={
          summary.newThisQuarter > 0
            ? t("totalDelta", { count: summary.newThisQuarter })
            : t("totalNone")
        }
        tone={summary.newThisQuarter > 0 ? "up" : "muted"}
      />
      <Card
        label={t("active")}
        value={summary.activelyServiced}
        sub={t("activeOfTotal", { percent: activePct })}
      />
      <Card
        label={t("newlyOnboarded")}
        value={summary.newlyOnboarded30d}
        sub={t("newlyOnboardedSub")}
        tone={summary.newlyOnboarded30d > 0 ? "up" : "muted"}
      />
      <Card
        label={t("needsAttention")}
        value={summary.needsAttention}
        sub={t("needsAttentionSub")}
        tone={summary.needsAttention > 0 ? "danger" : "muted"}
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
  tone?: "up" | "danger" | "muted";
}) {
  const subColor =
    tone === "up"
      ? "text-success-500"
      : tone === "danger"
        ? "text-error-700"
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

"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { formatEUR } from "@/lib/utils/format";
import type { KpiSet } from "@/lib/api/dashboard.types";

type Tone = "green" | "blue" | "orange" | "red";

const toneStyles: Record<
  Tone,
  { glow: string; iconBg: string; iconText: string }
> = {
  green: {
    glow: "after:bg-primary-500",
    iconBg: "bg-primary-50",
    iconText: "text-primary-600",
  },
  blue: {
    glow: "after:bg-secondary-500",
    iconBg: "bg-secondary-50",
    iconText: "text-secondary-600",
  },
  orange: {
    glow: "after:bg-warning-500",
    iconBg: "bg-warning-50",
    iconText: "text-warning-700",
  },
  red: {
    glow: "after:bg-error-500",
    iconBg: "bg-error-50",
    iconText: "text-error-700",
  },
};

type DeltaTone = "up" | "down" | "neutral";
const deltaStyles: Record<DeltaTone, string> = {
  up: "bg-success-50 text-success-700",
  down: "bg-error-50 text-error-700",
  neutral: "bg-neutral-100 text-neutral-600",
};

function fmtPct(v: number, todayLabel: string) {
  const sign = v > 0 ? "▲" : v < 0 ? "▼" : "—";
  if (v === 0) return `— ${todayLabel}`;
  return `${sign} ${Math.abs(v).toFixed(1)}%`;
}

type CardProps = {
  tone: Tone;
  label: string;
  value: string | number;
  sub: string;
  delta: string;
  deltaTone: DeltaTone;
  icon: React.ReactNode;
};

function Card({ tone, label, value, sub, delta, deltaTone, icon }: CardProps) {
  const t = toneStyles[tone];
  return (
    <article
      className={cn(
        "relative flex flex-col gap-2.5 overflow-hidden rounded-lg border border-neutral-100 bg-white p-5 transition",
        "hover:-translate-y-0.5 hover:shadow-md",
        "after:pointer-events-none after:absolute after:right-0 after:top-0 after:h-20 after:w-20 after:rounded-full after:opacity-[.08] after:blur-2xl",
        t.glow,
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "grid h-9 w-9 place-items-center rounded-md",
            t.iconBg,
            t.iconText,
          )}
        >
          <span className="[&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:stroke-2">
            {icon}
          </span>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            deltaStyles[deltaTone],
          )}
        >
          {delta}
        </span>
      </div>
      <div>
        <div className="text-[12px] font-medium uppercase tracking-[0.03em] text-neutral-500">
          {label}
        </div>
        <div className="text-[28px] font-bold leading-tight tracking-tightest text-secondary-500">
          {value}
        </div>
        <div className="mt-0.5 text-[12px] text-neutral-500">{sub}</div>
      </div>
    </article>
  );
}

const userIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={9} cy={7} r={4} />
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const buildingIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path d="M3 21V7l8-4 8 4v14" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 9h2M13 9h2M9 13h2M13 13h2M9 17h2M13 17h2" strokeLinecap="round" />
  </svg>
);
const clockIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <circle cx={12} cy={12} r={10} />
    <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const docIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 2v6h6M16 13H8M16 17H8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function KpiGrid({ kpis }: { kpis: KpiSet }) {
  const t = useTranslations("dashboard");
  const today = t("today");

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        tone="green"
        label={t("kpi.activeClients")}
        value={kpis.activeClients.value}
        sub={
          kpis.activeClients.addedThisMonth
            ? t("kpi.activeClientsAdded", {
                count: kpis.activeClients.addedThisMonth,
              })
            : t("kpi.activeClientsNone")
        }
        delta={fmtPct(kpis.activeClients.deltaPct, today)}
        deltaTone={
          kpis.activeClients.deltaPct > 0
            ? "up"
            : kpis.activeClients.deltaPct < 0
              ? "down"
              : "neutral"
        }
        icon={userIcon}
      />
      <Card
        tone="blue"
        label={t("kpi.managedProperties")}
        value={kpis.managedProperties.value}
        sub={
          kpis.managedProperties.addedThisMonth
            ? t("kpi.managedPropertiesAdded", {
                count: kpis.managedProperties.addedThisMonth,
              })
            : t("kpi.managedPropertiesStable")
        }
        delta={fmtPct(kpis.managedProperties.deltaPct, today)}
        deltaTone={
          kpis.managedProperties.deltaPct > 0
            ? "up"
            : kpis.managedProperties.deltaPct < 0
              ? "down"
              : "neutral"
        }
        icon={buildingIcon}
      />
      <Card
        tone="orange"
        label={t("kpi.todayShifts")}
        value={kpis.todayShifts.value}
        sub={
          kpis.todayShifts.pendingCheckins
            ? t("kpi.todayShiftsPending", {
                count: kpis.todayShifts.pendingCheckins,
              })
            : t("kpi.todayShiftsAllDone")
        }
        delta={`— ${today}`}
        deltaTone="neutral"
        icon={clockIcon}
      />
      <Card
        tone="red"
        label={t("kpi.openInvoices")}
        value={formatEUR(kpis.openInvoices.valueCents)}
        sub={t("kpi.invoicesPending", {
          count: kpis.openInvoices.pendingCount,
        })}
        delta={
          kpis.openInvoices.overdueCount
            ? t("kpi.invoicesOverdue", {
                count: kpis.openInvoices.overdueCount,
              })
            : "—"
        }
        deltaTone={kpis.openInvoices.overdueCount ? "down" : "neutral"}
        icon={docIcon}
      />
    </div>
  );
}

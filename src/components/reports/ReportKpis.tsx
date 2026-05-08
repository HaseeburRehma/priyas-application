"use client";

import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/utils/i18n-format";
import type { ReportsKpis } from "@/lib/api/reports";

type Props = { kpis: ReportsKpis };

/** 4-card KPI strip with mini-charts. */
export function ReportKpis({ kpis }: Props) {
  const t = useTranslations("reports.kpi");
  const f = useFormat();
  const formatEUR = (cents: number) => f.currencyCents(cents);

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Revenue */}
      <KpiCard
        label={t("revenue")}
        value={formatEUR(kpis.revenueCents)}
        unit={t("netVat")}
        delta={`+${kpis.revenueDeltaPct.toFixed(1)}%`}
        deltaTone="up"
        deltaSub={t("revenueSub")}
        accent="primary"
        chart={<AreaSpark data={kpis.revenueSpark} color="#72A94F" />}
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <line x1={12} y1={1} x2={12} y2={23} />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        }
      />

      {/* Hours */}
      <KpiCard
        label={t("hours")}
        value={f.number(kpis.hours)}
        unit={t("hoursUnit")}
        delta={`+${kpis.hoursDeltaPct.toFixed(1)}%`}
        deltaTone="up"
        deltaSub={t("hoursSub", {
          count: kpis.activeStaff,
          avg: kpis.hoursPerWeekAvg.toFixed(1),
        })}
        accent="secondary"
        chart={<BarSpark data={kpis.hoursSpark} color="#16587C" />}
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <circle cx={12} cy={12} r={10} />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        }
      />

      {/* Completed shifts */}
      <KpiCard
        label={t("shifts")}
        value={f.number(kpis.shiftsCompleted)}
        unit={`/ ${f.number(kpis.shiftsTotal)}`}
        delta={`${kpis.shiftsCompletionPct.toFixed(1)}%`}
        deltaTone="up"
        deltaSub={t("shiftsSub", {
          redistributed: kpis.shiftsRedistributed,
        })}
        accent="success"
        chart={<LineSpark data={kpis.shiftsSpark} color="#2D9E6B" />}
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        }
      />

      {/* Satisfaction */}
      <KpiCard
        label={t("satisfaction")}
        value={kpis.satisfactionAvg.toFixed(1)}
        unit="/ 5.0"
        delta="±0.1"
        deltaTone="flat"
        deltaSub={t("satisfactionSub", {
          count: kpis.satisfactionReviews,
          nps: kpis.satisfactionNps,
        })}
        accent="warning"
        chart={
          <NpsBars
            value={kpis.satisfactionAvg}
            color="#F4A261"
          />
        }
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        }
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaTone,
  deltaSub,
  accent,
  chart,
  icon,
}: {
  label: string;
  value: string;
  unit: string;
  delta: string;
  deltaTone: "up" | "flat" | "down";
  deltaSub: string;
  accent: "primary" | "secondary" | "success" | "warning";
  chart: React.ReactNode;
  icon: React.ReactNode;
}) {
  const accentMap = {
    primary: "bg-primary-50 text-primary-700",
    secondary: "bg-secondary-50 text-secondary-700",
    success: "bg-success-50 text-success-700",
    warning: "bg-warning-50 text-warning-700",
  } as const;
  const deltaMap = {
    up: "bg-success-50 text-success-700",
    down: "bg-error-50 text-error-700",
    flat: "bg-neutral-100 text-neutral-600",
  } as const;
  return (
    <article className="flex flex-col gap-2 overflow-hidden rounded-lg border border-neutral-100 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
          {label}
        </span>
        <span className={`grid h-7 w-7 place-items-center rounded-md ${accentMap[accent]}`}>
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 text-secondary-500">
        <span className="text-[26px] font-bold tracking-[-0.02em]">{value}</span>
        <span className="text-[12px] font-medium text-neutral-500">{unit}</span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-neutral-500">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${deltaMap[deltaTone]}`}
        >
          {delta}
        </span>
        {deltaSub}
      </div>
      <div className="-mx-2 mt-auto h-9 overflow-hidden">{chart}</div>
    </article>
  );
}

/** Smooth area chart for the revenue card. */
function AreaSpark({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * 280;
    const y = 32 - (v / max) * 28;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M${points.join(" L")}`;
  const area = `${path} L280,34 L0,34 Z`;
  const id = `gr-${color.replace("#", "")}`;
  return (
    <svg viewBox="0 0 280 34" preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.3} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.8} />
    </svg>
  );
}

/** Vertical bars for the hours card. */
function BarSpark({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const w = 280 / (data.length * 1.4);
  return (
    <svg viewBox="0 0 280 34" preserveAspectRatio="none" className="h-full w-full">
      <g fill={color} opacity={0.85}>
        {data.map((v, i) => {
          const h = (v / max) * 28;
          const x = i * (w * 1.4) + 4;
          const y = 32 - h;
          return <rect key={i} x={x} y={y} width={w} height={Math.max(2, h)} rx={2} />;
        })}
      </g>
    </svg>
  );
}

/** Smooth line + end dot for the completion card. */
function LineSpark({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * 280;
    const y = 32 - (v / max) * 26;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points[points.length - 1]?.split(",") ?? ["280", "10"];
  return (
    <svg viewBox="0 0 280 34" preserveAspectRatio="none" className="h-full w-full">
      <path d={`M${points.join(" L")}`} fill="none" stroke={color} strokeWidth={2} />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </svg>
  );
}

/** Stacked rating bands for the satisfaction card. */
function NpsBars({ value, color }: { value: number; color: string }) {
  // Static visualisation matching the prototype.
  return (
    <svg viewBox="0 0 280 34" preserveAspectRatio="none" className="h-full w-full">
      <g>
        <rect x={0} y={10} width={52} height={14} fill="#F3C8C8" opacity={0.5} rx={2} />
        <rect x={56} y={10} width={60} height={14} fill="#EBCFB0" opacity={0.7} rx={2} />
        <rect x={120} y={10} width={90} height={14} fill="#BFDAA4" opacity={0.7} rx={2} />
        <rect x={214} y={10} width={66} height={14} fill={color} rx={2} />
      </g>
      <text
        x={247}
        y={21}
        fontFamily="JetBrains Mono"
        fontSize={9}
        fill="#fff"
        fontWeight={700}
        textAnchor="middle"
      >
        {value.toFixed(1)}★
      </text>
    </svg>
  );
}

"use client";

import { useTranslations } from "next-intl";
import type { WeeklyChartData } from "@/lib/api/dashboard.types";

const CHART_W = 700;
const CHART_H = 220;
const CHART_TOP = 20;
const CHART_BOTTOM = 180;
const X_LEFT = 40;
const BAR_WIDTH = 28;

/**
 * Pure-SVG bar chart matching the prototype's "Aufträge pro Woche" panel.
 * Two stacked bars per day: scheduled (light) behind completed (green).
 *
 * Computes a y-axis that snaps to a clean upper bound (10/20/30/50/100…).
 * Inline SVG keeps it server-renderable and ad-free of external chart libs.
 */
export function WeeklyChart({ data }: { data: WeeklyChartData }) {
  const t = useTranslations("dashboard.chart");
  const max = Math.max(
    10,
    ...data.days.map((d) => Math.max(d.completed, d.scheduled)),
  );
  // Snap to the next "nice" round number for the axis.
  const niceMax = niceCeil(max);
  const tickStep = niceMax / 3;

  const xFor = (idx: number) =>
    X_LEFT + 30 + idx * ((CHART_W - X_LEFT - 60) / data.days.length);
  const heightFor = (v: number) =>
    Math.round(((CHART_BOTTOM - CHART_TOP) * v) / niceMax);

  const completedTotal = data.completed;
  const scheduledTotal = data.scheduled;
  const completedRate =
    scheduledTotal > 0
      ? ((completedTotal / scheduledTotal) * 100).toFixed(1) + "%"
      : "—";

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-100 p-5">
        <div>
          <h3 className="text-[15px] font-semibold text-neutral-800">
            {t("title")}
          </h3>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            {t("subtitle", { week: data.weekLabel })}
          </div>
        </div>
        <div className="flex gap-1 rounded-sm bg-neutral-50 p-1 text-[12px]">
          <span className="rounded px-3 py-1.5 font-medium text-neutral-600">
            {t("tabDay")}
          </span>
          <span className="rounded bg-white px-3 py-1.5 font-medium text-secondary-500 shadow-xs">
            {t("tabWeek")}
          </span>
          <span className="rounded px-3 py-1.5 font-medium text-neutral-600">
            {t("tabMonth")}
          </span>
        </div>
      </header>

      {/* Stats row */}
      <div className="flex flex-wrap gap-6 px-5 pt-4">
        <Stat
          label={t("completed")}
          value={completedTotal}
          delta={data.completedDeltaPct}
          deltaSuffix={t("vsLastWeek")}
        />
        <Stat
          label={t("scheduled")}
          value={scheduledTotal}
          accent="muted"
          deltaText={t("completionRate", { rate: completedRate })}
        />
        <Stat
          label={t("hours")}
          value={`${data.hours}h`}
          delta={data.hoursDeltaPct}
          deltaSuffix={t("vsLastWeek")}
        />
      </div>

      {/* Chart */}
      <div className="px-5 pb-5 pt-4">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className="w-full"
          style={{ height: 220 }}
          role="img"
          aria-label="Wöchentliche Aufträge"
        >
          {/* Grid lines + Y labels */}
          {[3, 2, 1, 0].map((i) => {
            const y = CHART_TOP + ((CHART_BOTTOM - CHART_TOP) / 3) * (3 - i);
            const value = Math.round(tickStep * i);
            return (
              <g key={i}>
                <line
                  x1={X_LEFT}
                  y1={y}
                  x2={CHART_W}
                  y2={y}
                  stroke="#EEF2EC"
                  strokeDasharray="3 3"
                />
                <text
                  x={X_LEFT - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill="#9DA898"
                  fontSize={10}
                  fontFamily="JetBrains Mono"
                >
                  {value}
                </text>
              </g>
            );
          })}

          {/* Scheduled bars (background) */}
          {data.days.map((d, idx) => {
            const h = heightFor(d.scheduled);
            const x = xFor(idx);
            const y = CHART_BOTTOM - h;
            return (
              <rect
                key={`s-${idx}`}
                x={x}
                y={y}
                width={BAR_WIDTH}
                height={h}
                rx={4}
                fill="#EEF5E8"
              />
            );
          })}

          {/* Completed bars (foreground) */}
          {data.days.map((d, idx) => {
            const h = heightFor(d.completed);
            const x = xFor(idx);
            const y = CHART_BOTTOM - h;
            // Last two days (Sa/So) use the lighter accent if not yet
            // completed at full rate — matches the prototype's gradient feel.
            const isWeekend = idx >= 5;
            const fill =
              isWeekend && d.completed < d.scheduled ? "#A8CC87" : "#72A94F";
            return (
              <rect
                key={`c-${idx}`}
                x={x}
                y={y}
                width={BAR_WIDTH}
                height={h}
                rx={4}
                fill={fill}
              />
            );
          })}

          {/* X labels */}
          {data.days.map((d, idx) => (
            <text
              key={`x-${idx}`}
              x={xFor(idx) + BAR_WIDTH / 2}
              y={CHART_BOTTOM + 25}
              textAnchor="middle"
              fontFamily="Inter"
              fontSize={11}
              fill="#78857A"
            >
              {d.label}
            </text>
          ))}

          {/* Legend */}
          <g transform={`translate(${CHART_W - 220}, 14)`}>
            <rect x={0} y={0} width={10} height={10} rx={2} fill="#72A94F" />
            <text x={16} y={9} fontFamily="Inter" fontSize={10} fill="#414B40">
              {t("completed")}
            </text>
            <rect x={90} y={0} width={10} height={10} rx={2} fill="#EEF5E8" />
            <text x={106} y={9} fontFamily="Inter" fontSize={10} fill="#414B40">
              {t("scheduled")}
            </text>
          </g>
        </svg>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  delta,
  deltaText,
  deltaSuffix,
  accent = "success",
}: {
  label: string;
  value: string | number;
  delta?: number;
  deltaText?: string;
  deltaSuffix?: string;
  accent?: "success" | "muted";
}) {
  const text =
    deltaText ??
    (delta !== undefined
      ? `${delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} ${Math.abs(delta).toFixed(1)}% ${deltaSuffix ?? ""}`
      : "—");
  const color =
    accent === "muted"
      ? "text-neutral-500"
      : delta !== undefined && delta < 0
        ? "text-error-700"
        : "text-success-500";
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </div>
      <div className="text-[20px] font-bold tracking-[-0.01em] text-secondary-500">
        {value}
      </div>
      <div className={`text-[11px] font-semibold ${color}`}>{text}</div>
    </div>
  );
}

function niceCeil(n: number): number {
  if (n <= 10) return 10;
  if (n <= 20) return 20;
  if (n <= 30) return 30;
  if (n <= 50) return 50;
  if (n <= 100) return 100;
  return Math.ceil(n / 50) * 50;
}

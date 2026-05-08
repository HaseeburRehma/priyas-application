"use client";

import { useTranslations } from "next-intl";
import type { HoursByService } from "@/lib/api/reports";
import { useFormat } from "@/lib/utils/i18n-format";

const PALETTE = ["#72A94F", "#16587C", "#A8CC87", "#F4A261"];

type Props = {
  hoursByService: HoursByService[];
  totalHours: number;
  rangeLabel: string;
  billingRatePct: number;
  averageRateEur: number;
};

export function HoursDonut({
  hoursByService,
  totalHours,
  rangeLabel,
  billingRatePct,
  averageRateEur,
}: Props) {
  const t = useTranslations("reports.donut");
  const f = useFormat();
  const formatEUR = (cents: number) => f.currencyCents(cents);

  // Build SVG arc paths.
  const radius = 64;
  const innerRadius = 40;
  const cx = 90;
  const cy = 90;
  let cumulative = 0;
  const segments = hoursByService.map((row, i) => {
    const value = row.pct / 100;
    const start = cumulative;
    cumulative += value;
    const startAngle = start * Math.PI * 2 - Math.PI / 2;
    const endAngle = cumulative * Math.PI * 2 - Math.PI / 2;
    const large = value > 0.5 ? 1 : 0;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const xi1 = cx + innerRadius * Math.cos(endAngle);
    const yi1 = cy + innerRadius * Math.sin(endAngle);
    const xi2 = cx + innerRadius * Math.cos(startAngle);
    const yi2 = cy + innerRadius * Math.sin(startAngle);
    const path = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`,
      `L ${xi1} ${yi1}`,
      `A ${innerRadius} ${innerRadius} 0 ${large} 0 ${xi2} ${yi2}`,
      "Z",
    ].join(" ");
    return { ...row, path, color: PALETTE[i % PALETTE.length] ?? "#72A94F" };
  });

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="border-b border-neutral-100 p-5">
        <h3 className="text-[15px] font-semibold text-neutral-800">
          {t("title")}
        </h3>
        <div className="mt-0.5 text-[12px] text-neutral-500">
          {t("subtitle", { range: rangeLabel })}
        </div>
      </header>

      <div className="p-5">
        <div className="flex items-center gap-5">
          {/* Donut SVG */}
          <div className="relative flex-shrink-0">
            <svg width={180} height={180} viewBox="0 0 180 180">
              {segments.map((s, i) => (
                <path key={i} d={s.path} fill={s.color} />
              ))}
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-[20px] font-bold text-secondary-500">
                  {f.number(totalHours)}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
                  {t("totalHours")}
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <ul className="flex-1 space-y-2.5 text-[12px]">
            {segments.length === 0 && (
              <li className="text-neutral-500">—</li>
            )}
            {segments.map((s, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="truncate text-neutral-700">{s.serviceType}</span>
                </span>
                <span className="flex-shrink-0">
                  <span className="font-semibold text-neutral-800">
                    {f.number(Math.round(s.hours))}h
                  </span>
                  <span className="ml-1 text-neutral-500">
                    {s.pct.toFixed(0)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer KPIs */}
        <div className="mt-5 grid grid-cols-2 gap-5 border-t border-neutral-100 pt-4 text-[11px]">
          <div>
            <div className="font-semibold uppercase tracking-[0.05em] text-neutral-500">
              {t("billingRate")}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[20px] font-bold text-secondary-500">
                {billingRatePct.toFixed(1)}%
              </span>
              <span className="rounded-full bg-success-50 px-1.5 py-0.5 text-[10px] font-semibold text-success-700">
                +1.3pp
              </span>
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase tracking-[0.05em] text-neutral-500">
              {t("averageRate")}
            </div>
            <div className="mt-1 text-[20px] font-bold text-secondary-500">
              {formatEUR(averageRateEur * 100)}
              <span className="ml-1 text-[11px] font-medium text-neutral-500">
                {t("perHour")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useTranslations } from "next-intl";
import type { RevenueMonth } from "@/lib/api/reports";
import { formatEUR } from "@/lib/utils/format";

const W = 720;
const H = 240;
const PAD_LEFT = 32;

type Props = { months: RevenueMonth[] };

export function RevenueChart({ months }: Props) {
  const t = useTranslations("reports.revenueChart");

  // Find max + best + average for the metadata footer.
  const maxValue = Math.max(
    1,
    ...months.map((m) => Math.max(m.invoicedCents, m.collectedCents)),
  );
  const niceMax = niceCeil(maxValue / 100) * 100; // cents → euros for axis tick labels

  const completed = months.filter((m) => !m.forecast);
  const totalInvoiced =
    completed.reduce((s, m) => s + m.invoicedCents, 0) / 100;
  const avg = completed.length > 0 ? totalInvoiced / completed.length : 0;
  const best = completed.reduce<RevenueMonth | null>(
    (acc, m) => (acc && acc.invoicedCents > m.invoicedCents ? acc : m),
    null,
  );
  const forecast = months.find((m) => m.forecast);

  const barWidth = (W - PAD_LEFT) / months.length;
  const barW = barWidth * 0.55;

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 p-5">
        <div>
          <h3 className="text-[15px] font-semibold text-neutral-800">
            {t("title")}{" "}
            <span className="text-[11px] font-medium text-neutral-500">
              · {t("rolling")}
            </span>
          </h3>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            {t("subtitle")}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-700">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary-500" />
            {t("invoiced")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-secondary-500" />
            {t("collected")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warning-500/55" />
            {t("forecast")}
          </span>
        </div>
      </header>

      <div className="p-5">
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ width: "100%", height: H }}
          >
            {/* Y grid + labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
              const y = H - 8 - p * (H - 16);
              const value = p * niceMax;
              return (
                <g key={i}>
                  <line
                    x1={PAD_LEFT}
                    y1={y}
                    x2={W}
                    y2={y}
                    stroke="#EEF2EC"
                    strokeDasharray="3 4"
                  />
                  <text
                    x={PAD_LEFT - 6}
                    y={y + 3}
                    textAnchor="end"
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                    fill="#9DA898"
                  >
                    €{Math.round(value / 100 / 1000)}k
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {months.map((m, i) => {
              const x = PAD_LEFT + i * barWidth + (barWidth - barW) / 2;
              const h = (m.invoicedCents / Math.max(niceMax, 1)) * (H - 16);
              const y = H - 8 - h;
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(2, h)}
                    rx={3}
                    fill="#72A94F"
                    opacity={m.forecast ? 0.35 : 0.9}
                  />
                </g>
              );
            })}

            {/* Collected line */}
            <path
              d={
                "M" +
                months
                  .map((m, i) => {
                    const x = PAD_LEFT + i * barWidth + barWidth / 2;
                    const y =
                      H - 8 - (m.collectedCents / Math.max(niceMax, 1)) * (H - 16);
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(" L")
              }
              fill="none"
              stroke="#16587C"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {months.map((m, i) => {
              const x = PAD_LEFT + i * barWidth + barWidth / 2;
              const y = H - 8 - (m.collectedCents / Math.max(niceMax, 1)) * (H - 16);
              return <circle key={i} cx={x} cy={y} r={3.5} fill="#16587C" />;
            })}

            {/* X labels */}
            {months.map((m, i) => {
              const x = PAD_LEFT + i * barWidth + barWidth / 2;
              return (
                <text
                  key={i}
                  x={x}
                  y={H + 0}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#78857A"
                >
                  {m.label}
                </text>
              );
            })}
          </svg>
        </div>

        {/* Footer stats */}
        <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[11px]">
          <span className="font-semibold uppercase tracking-[0.05em] text-neutral-500">
            {t("bestMonth")}
          </span>
          <span className="text-secondary-500 font-bold">
            {best ? formatEUR(best.invoicedCents) : "—"}
            {best ? <span className="ml-1.5 text-[11px] font-medium text-neutral-500">{best.label}</span> : null}
          </span>
          <span className="font-semibold uppercase tracking-[0.05em] text-neutral-500">
            {t("avgMonth")}
          </span>
          <span className="text-secondary-500 font-bold">
            €{avg.toFixed(0)}
            <span className="ml-1.5 text-[11px] font-medium text-neutral-500">
              {t("rollingHint")}
            </span>
          </span>
          {forecast && (
            <>
              <span className="font-semibold uppercase tracking-[0.05em] text-neutral-500">
                {t("forecastNext")}
              </span>
              <span className="text-warning-700 font-bold">
                {formatEUR(forecast.invoicedCents)}
                <span className="ml-1.5 text-[11px] font-medium text-neutral-500">
                  {t("confidence", { pct: 63 })}
                </span>
              </span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function niceCeil(n: number): number {
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  if (n <= 25) return 25;
  if (n <= 50) return 50;
  if (n <= 100) return 100;
  if (n <= 200) return 200;
  return Math.ceil(n / 100) * 100;
}

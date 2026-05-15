"use client";

import { formatEUR } from "@/lib/billing/money";
import type { AlltagshilfeBudget } from "@/lib/api/invoices.types";

/**
 * Annual-budget tracker for an Alltagshilfe client. Shows used/remaining,
 * progress bar (green → amber → red as it depletes), and any threshold
 * alerts that have already fired.
 */
export function AlltagshilfeBudgetCard({
  budget,
}: {
  budget: AlltagshilfeBudget;
}) {
  const pct = budget.usage_percent;
  const tone =
    pct >= 100 ? "danger" : pct >= 90 ? "danger" : pct >= 80 ? "warning" : "ok";
  const barColor = {
    ok: "bg-success-500",
    warning: "bg-warning-500",
    danger: "bg-error-500",
  }[tone];
  const hoursPerYear =
    budget.budget_cents > 0 ? Math.round(budget.budget_cents / 3500) : 0; // €35/h baseline
  const hoursUsed = budget.budget_cents > 0
    ? Math.round((budget.used_cents / 3500) * 10) / 10
    : 0;

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-700">
            Entlastungsbetrag {budget.year}
          </h2>
          <p className="text-xs text-neutral-500">
            § 45b SGB XI · Jahresbudget
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            tone === "ok"
              ? "bg-success-50 text-success-700"
              : tone === "warning"
                ? "bg-warning-50 text-warning-700"
                : "bg-error-50 text-error-700"
          }`}
        >
          {pct}% verbraucht
        </span>
      </header>

      <div className="space-y-1">
        <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${Math.min(100, pct)}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <div className="flex justify-between text-xs text-neutral-500">
          <span>0 €</span>
          <span>{formatEUR(budget.budget_cents)}</span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <Stat label="Verbraucht" value={formatEUR(budget.used_cents)} />
        <Stat label="Reserviert" value={formatEUR(budget.reserved_cents)} sub="offene Rechnungen" />
        <Stat label="Verbleibend" value={formatEUR(budget.remaining_cents)} tone={tone} />
      </dl>
      <p className="mt-2 text-xs text-neutral-500">
        ≈ {hoursUsed}h von {hoursPerYear}h verbraucht (€35/h Basiskalkulation)
      </p>

      {(budget.alerted_80 || budget.alerted_90 || budget.alerted_100) && (
        <div className="mt-3 space-y-1 text-xs">
          {budget.alerted_80 && !budget.alerted_90 && (
            <p className="text-warning-700">⚠ 80% Schwelle erreicht.</p>
          )}
          {budget.alerted_90 && !budget.alerted_100 && (
            <p className="text-warning-800">⚠ 90% Schwelle erreicht.</p>
          )}
          {budget.alerted_100 && (
            <p className="text-error-700">
              ⛔ Jahresbudget ausgeschöpft. Weitere Abrechnungen sind nicht erstattungsfähig.
            </p>
          )}
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
  sub?: string;
  tone?: "ok" | "warning" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-error-700"
      : tone === "warning"
        ? "text-warning-700"
        : "text-neutral-800";
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className={`mt-0.5 font-mono text-base font-semibold ${color}`}>
        {value}
      </dd>
      {sub && <p className="text-[11px] text-neutral-400">{sub}</p>}
    </div>
  );
}

"use client";

import Link from "next/link";
import { routes } from "@/lib/constants/routes";
import type { InvoicesSummary } from "@/lib/api/invoices.types";
import type { AgingTotals } from "@/lib/billing/types";

function fmt(cents: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export function InvoiceKpiPanel({
  summary,
  aging,
}: {
  summary: InvoicesSummary;
  aging: AgingTotals;
}) {
  const ageBuckets: { key: keyof AgingTotals; label: string }[] = [
    { key: "current", label: "Aktuell" },
    { key: "0_30", label: "1–30" },
    { key: "30_60", label: "31–60" },
    { key: "60_90", label: "61–90" },
    { key: "90_plus", label: "90+" },
  ];

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-700">Forderungen</h2>
          <p className="text-xs text-neutral-500">
            Übersicht offener und bezahlter Rechnungen
          </p>
        </div>
        <Link
          href={routes.invoices}
          className="text-xs font-medium text-secondary-600 hover:text-secondary-800"
        >
          Alle Rechnungen →
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="Diesen Monat eingenommen"
          value={fmt(summary.collectedThisMonthCents)}
          tone="success"
        />
        <Tile
          label="Offen"
          value={fmt(summary.openAmountCents)}
          sub={`${summary.openCount} Rechnungen`}
        />
        <Tile
          label="Überfällig"
          value={fmt(summary.overdueAmountCents)}
          sub={`${summary.overdueCount} Rechnungen`}
          tone={summary.overdueCount > 0 ? "danger" : undefined}
        />
        <Tile
          label="Forecast 30 Tage"
          value={fmt(summary.forecast30dCents)}
        />
      </div>

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Altersstruktur
        </h3>
        <div className="mt-2 grid grid-cols-5 overflow-hidden rounded-md border border-neutral-200">
          {ageBuckets.map((b) => {
            const t = aging[b.key];
            return (
              <div
                key={b.key}
                className="border-r border-neutral-200 px-3 py-2 last:border-r-0"
              >
                <p className="text-[11px] uppercase text-neutral-500">{b.label}</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-neutral-700">
                  {fmt(t.amountCents)}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {t.count} {t.count === 1 ? "Rechn." : "Rechn."}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "danger";
}) {
  const ring =
    tone === "success"
      ? "ring-1 ring-success-100 bg-success-50"
      : tone === "danger"
        ? "ring-1 ring-error-100 bg-error-50"
        : "ring-1 ring-neutral-100 bg-neutral-50";
  return (
    <div className={`rounded-md px-3 py-2 ${ring}`}>
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold text-neutral-800">{value}</p>
      {sub && <p className="text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}

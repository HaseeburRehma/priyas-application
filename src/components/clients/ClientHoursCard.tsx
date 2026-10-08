"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { formatEUR } from "@/lib/billing/money";
import { daysUntil } from "@/lib/billing/contract";
import type { ClientBilling } from "@/lib/api/clients.types";
import type { ClientHoursMonth } from "@/lib/api/client-hours";

/**
 * Internal hours overview on the client page. For fixed-contract clients
 * it compares delivered hours against the contracted hours/month and
 * shows the effective hourly rate the flat fee works out to; for hourly
 * clients it shows what the delivered hours are worth. Never shown to
 * the customer — invoices for fixed clients only carry the flat fee.
 */
export function ClientHoursCard({
  billing,
  months,
}: {
  billing: ClientBilling;
  months: ClientHoursMonth[];
}) {
  const t = useTranslations("clients.hours");
  const isFixed = billing.mode === "fixed";
  const contracted = billing.contracted_hours_per_month ?? 0;
  const daysLeft = billing.contract_end ? daysUntil(billing.contract_end) : null;
  // Months before the contract started (or after it ended) have no
  // contracted hours to compare against — show "—" instead of a deficit.
  const startMonth = billing.contract_start?.slice(0, 7) ?? null;
  const endMonth = billing.contract_end?.slice(0, 7) ?? null;
  const inContract = (month: string) =>
    (!startMonth || month >= startMonth) && (!endMonth || month <= endMonth);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-700">{t("title")}</h2>
          <p className="text-xs text-neutral-500">{t("subtitle")}</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
          {isFixed
            ? t("modeFixed", { fee: formatEUR(billing.fixed_monthly_fee_cents ?? 0) })
            : billing.hourly_rate_cents != null
              ? t("modeHourly", { rate: formatEUR(billing.hourly_rate_cents) })
              : t("modeHourlyNoRate")}
        </span>
      </header>

      {isFixed && billing.contract_start && billing.contract_end && (
        <div
          className={cn(
            "mb-3 rounded-md px-3 py-2 text-xs",
            daysLeft != null && daysLeft < 0
              ? "bg-error-50 text-error-700"
              : daysLeft != null && daysLeft <= 30
                ? "bg-warning-50 text-warning-700"
                : "bg-neutral-50 text-neutral-600",
          )}
        >
          {t("term", {
            start: formatDate(billing.contract_start),
            end: formatDate(billing.contract_end),
            months: billing.contract_months ?? 0,
          })}
          {" · "}
          {daysLeft == null
            ? null
            : daysLeft < 0
              ? t("expiredAgo", { days: -daysLeft })
              : daysLeft === 0
                ? t("endsToday")
                : t("endsIn", { days: daysLeft })}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="py-1.5 pr-3 font-medium">{t("month")}</th>
              <th className="py-1.5 pr-3 text-right font-medium">{t("planned")}</th>
              <th className="py-1.5 pr-3 text-right font-medium">{t("actual")}</th>
              {isFixed && (
                <>
                  <th className="py-1.5 pr-3 text-right font-medium">{t("contracted")}</th>
                  <th className="py-1.5 pr-3 text-right font-medium">{t("difference")}</th>
                  <th className="py-1.5 text-right font-medium">{t("effectiveRate")}</th>
                </>
              )}
              {!isFixed && (
                <th className="py-1.5 text-right font-medium">{t("value")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => {
              const actualH = m.actualMinutes / 60;
              const covered = isFixed && inContract(m.month);
              const diff = actualH - contracted;
              const effective =
                covered && actualH > 0 && billing.fixed_monthly_fee_cents
                  ? Math.round(billing.fixed_monthly_fee_cents / actualH)
                  : null;
              return (
                <tr key={m.month} className="border-t border-neutral-100">
                  <td className="py-1.5 pr-3 text-neutral-700">
                    {formatMonth(m.month)}
                    {i === 0 && (
                      <span className="ml-1.5 text-[11px] text-neutral-400">{t("running")}</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-600">
                    {formatHours(m.plannedMinutes / 60)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums font-medium text-neutral-800">
                    {formatHours(actualH)}
                  </td>
                  {isFixed && (
                    <>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-600">
                        {covered ? formatHours(contracted) : "—"}
                      </td>
                      <td
                        className={cn(
                          "py-1.5 pr-3 text-right tabular-nums",
                          !covered
                            ? "text-neutral-400"
                            : diff > 0.01
                              ? "text-error-700"
                              : diff < -0.01
                                ? "text-warning-700"
                                : "text-neutral-600",
                        )}
                      >
                        {covered ? (
                          <>
                            {diff > 0 ? "+" : diff < 0 ? "−" : ""}
                            {formatHours(Math.abs(diff))}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-neutral-600">
                        {effective != null ? `${formatEUR(effective)}/h` : "—"}
                      </td>
                    </>
                  )}
                  {!isFixed && (
                    <td className="py-1.5 text-right tabular-nums text-neutral-600">
                      {billing.hourly_rate_cents != null
                        ? formatEUR(Math.round(actualH * billing.hourly_rate_cents))
                        : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-neutral-500">
        {isFixed ? t("footnoteFixed") : t("footnoteHourly")}
      </p>
    </section>
  );
}

function formatHours(h: number): string {
  return `${(Math.round(h * 100) / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} h`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function formatMonth(key: string): string {
  const [y, m] = key.split("-");
  return `${m}/${y}`;
}

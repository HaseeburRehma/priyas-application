"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatEUR } from "@/lib/billing/money";
import { routes } from "@/lib/constants/routes";
import type { AssignmentSummaryRow } from "@/lib/api/assignments";

export function AssignmentsPage({ rows }: { rows: AssignmentSummaryRow[] }) {
  const t = useTranslations("assignments");
  const active = rows.filter((r) => r.active);
  const archived = rows.filter((r) => !r.active);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-secondary-700">
            {t("title")}
          </h1>
          <p className="text-sm text-neutral-500">{t("subtitle")}</p>
        </div>
        <Link
          href={routes.assignmentNew}
          className="rounded-md bg-secondary-500 px-4 py-2 text-sm font-medium text-white hover:bg-secondary-600"
        >
          {t("new")}
        </Link>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-600">
          {t("activeSection", { n: active.length })}
        </h2>
        <Table rows={active} t={t} />
      </section>

      {archived.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-500">
            {t("archivedSection", { n: archived.length })}
          </h2>
          <Table rows={archived} t={t} muted />
        </section>
      )}
    </div>
  );
}

function Table({
  rows,
  t,
  muted = false,
}: {
  rows: AssignmentSummaryRow[];
  t: ReturnType<typeof useTranslations<"assignments">>;
  muted?: boolean;
}) {
  const FREQ_LABEL: Record<AssignmentSummaryRow["frequency"], string> = {
    weekly: t("freq.weekly"),
    biweekly: t("freq.biweekly"),
    monthly: t("freq.monthly"),
  };
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-500">
        {t("empty")}
      </div>
    );
  }
  return (
    <div className={`overflow-hidden rounded-lg border border-neutral-200 ${muted ? "opacity-70" : ""}`}>
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-3 py-2">{t("table.client")}</th>
            <th className="px-3 py-2">{t("table.property")}</th>
            <th className="px-3 py-2 text-right">{t("table.hours")}</th>
            <th className="px-3 py-2 text-right">{t("table.rate")}</th>
            <th className="px-3 py-2 text-right">{t("table.total")}</th>
            <th className="px-3 py-2 text-right">{t("table.staff")}</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const total = Math.round(
              r.hours_per_period * r.effective_rate_cents,
            );
            return (
              <tr
                key={r.assignment_id}
                className="border-t border-neutral-100 hover:bg-neutral-50"
              >
                <td className="px-3 py-2">{r.client_name}</td>
                <td className="px-3 py-2">{r.property_name}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {r.hours_per_period.toFixed(2)}h{" "}
                  <span className="text-xs text-neutral-400">
                    {FREQ_LABEL[r.frequency]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatEUR(r.effective_rate_cents)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold">
                  {formatEUR(total)}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.staff_count > 0 ? (
                    <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs text-success-700">
                      {t("staffAllocated", {
                        hours: Number(r.allocated_hours).toFixed(1),
                      })}
                    </span>
                  ) : (
                    <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs text-warning-700">
                      {t("staffMissing")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={routes.assignment(r.assignment_id)}
                    className="text-secondary-600 hover:text-secondary-800"
                  >
                    {t("details")} →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

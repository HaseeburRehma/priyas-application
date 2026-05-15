import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PermissionError, requirePermission } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import { loadAssignmentDetail } from "@/lib/api/assignments";
import { formatEUR } from "@/lib/billing/money";

export const metadata: Metadata = { title: "Auftrag" };
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    await requirePermission("property.read");
  } catch (err) {
    if (err instanceof PermissionError) redirect(routes.dashboard);
    throw err;
  }
  const detail = await loadAssignmentDetail(id);
  if (!detail) notFound();

  const total = Math.round(detail.hours_per_period * detail.effective_rate_cents);

  return (
    <div className="space-y-6">
      <nav className="text-xs text-neutral-500">
        <Link href={routes.assignments} className="hover:text-neutral-700">
          Aufträge
        </Link>{" "}
        / <span className="text-neutral-700">{detail.property_name}</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-secondary-700">
          {detail.property_name}
        </h1>
        <p className="text-sm text-neutral-500">
          Kunde:{" "}
          <Link href={routes.client(detail.client_id)} className="text-secondary-600 hover:underline">
            {detail.client_name}
          </Link>
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Geplante Stunden" value={`${detail.hours_per_period.toFixed(2)}h`} sub={detail.frequency} />
        <Kpi label="Stundensatz" value={formatEUR(detail.effective_rate_cents)} />
        <Kpi label="Periode-Summe" value={formatEUR(total)} highlight />
        <Kpi
          label="Variance (30 Tage)"
          value={`${detail.breakdown.varianceMinutes >= 0 ? "+" : ""}${(detail.breakdown.varianceMinutes / 60).toFixed(2)}h`}
          sub={detail.breakdown.varianceMinutes >= 0 ? "Mehr" : "Weniger"}
        />
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white">
        <header className="border-b border-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-700">
          Personalverteilung (letzte 30 Tage)
        </header>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2">Mitarbeiter</th>
              <th className="px-3 py-2 text-right">Geplant</th>
              <th className="px-3 py-2 text-right">Erfasst</th>
              <th className="px-3 py-2 text-right">Variance</th>
              <th className="px-3 py-2 text-right">Wert</th>
            </tr>
          </thead>
          <tbody>
            {detail.breakdown.staff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                  Noch keine Mitarbeiter zugeordnet.
                </td>
              </tr>
            )}
            {detail.breakdown.staff.map((s) => {
              const variance = s.actualMinutes - s.plannedMinutes;
              return (
                <tr key={s.employeeId} className="border-t border-neutral-100">
                  <td className="px-3 py-2">{s.employeeName}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {(s.plannedMinutes / 60).toFixed(2)}h
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {(s.actualMinutes / 60).toFixed(2)}h
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      variance >= 0 ? "text-warning-600" : "text-success-600"
                    }`}
                  >
                    {variance >= 0 ? "+" : ""}
                    {(variance / 60).toFixed(2)}h
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatEUR(s.amountCents)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-200 bg-neutral-50 font-semibold">
              <td className="px-3 py-2">Gesamt</td>
              <td className="px-3 py-2 text-right font-mono">
                {detail.breakdown.plannedHours.toFixed(2)}h
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {detail.breakdown.actualHours.toFixed(2)}h
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {detail.breakdown.varianceMinutes >= 0 ? "+" : ""}
                {(detail.breakdown.varianceMinutes / 60).toFixed(2)}h
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {formatEUR(detail.breakdown.actualAmountCents)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        highlight ? "border-secondary-300 bg-secondary-50" : "border-neutral-200 bg-white"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-neutral-800">{value}</p>
      {sub && <p className="text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

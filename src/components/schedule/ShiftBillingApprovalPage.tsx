"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { routes } from "@/lib/constants/routes";
import { useFormat } from "@/lib/utils/i18n-format";
import {
  approveShiftBillingAction,
  rejectShiftBillingAction,
} from "@/app/actions/shift-billing";
import type { PendingBillingShift } from "@/lib/api/shift-billing";

function minutesToHours(min: number): string {
  return (min / 60).toFixed(2).replace(/\.00$/, "");
}

/**
 * Queue of completed shifts still `billing_status = 'pending'`. This is the
 * step that was missing between time tracking and invoicing — shifts sat
 * here forever with no way to flip to 'approved', so "New invoice" never
 * found anything to bill. Approve locks in the hours (defaulting to the
 * real check-in/check-out duration); reject requires a reason and keeps
 * the shift out of future invoice runs.
 */
export function ShiftBillingApprovalPage({ shifts }: { shifts: PendingBillingShift[] }) {
  const t = useTranslations("shiftBilling");
  const router = useRouter();
  const f = useFormat();
  const [pending, start] = useTransition();
  const [minutesById, setMinutesById] = useState<Record<string, number>>(() =>
    Object.fromEntries(shifts.map((s) => [s.id, s.actualMinutes ?? s.scheduledMinutes])),
  );
  const [rejecting, setRejecting] = useState<Record<string, string>>({});

  const grouped = useMemo(() => {
    const byClient = new Map<string, { clientName: string; rows: PendingBillingShift[] }>();
    for (const s of shifts) {
      const g = byClient.get(s.clientId) ?? { clientName: s.clientName, rows: [] };
      g.rows.push(s);
      byClient.set(s.clientId, g);
    }
    return Array.from(byClient.values()).sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [shifts]);

  function approve(shiftId: string) {
    start(async () => {
      const minutes = minutesById[shiftId];
      const r = await approveShiftBillingAction(shiftId, minutes);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("approveSuccess", { hours: minutesToHours(r.data.billableMinutes) }));
      router.refresh();
    });
  }

  function reject(shiftId: string) {
    const reason = rejecting[shiftId]?.trim();
    if (!reason) {
      toast.error(t("reasonRequired"));
      return;
    }
    start(async () => {
      const r = await rejectShiftBillingAction(shiftId, reason);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("rejectSuccess"));
      router.refresh();
    });
  }

  return (
    <>
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <Link href={routes.schedule} className="hover:text-neutral-700">
          {t("breadcrumbSchedule")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbCurrent")}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
          </h1>
          <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
        </div>
        <Link href={routes.invoiceNew} className="btn btn--ghost border border-neutral-200 bg-white">
          {t("toInvoice")}
        </Link>
      </div>

      {shifts.length === 0 ? (
        <div className="rounded-lg border border-neutral-100 bg-white p-8 text-center text-[13px] text-neutral-500">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.clientName} className="rounded-lg border border-neutral-100 bg-white">
              <h2 className="border-b border-neutral-100 px-5 py-3 text-[14px] font-semibold text-neutral-800">
                {group.clientName}
              </h2>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
                    <th className="px-5 py-2 font-medium">{t("colProperty")}</th>
                    <th className="px-5 py-2 font-medium">{t("colEmployee")}</th>
                    <th className="px-5 py-2 font-medium">{t("colDate")}</th>
                    <th className="px-5 py-2 font-medium">{t("colScheduled")}</th>
                    <th className="px-5 py-2 font-medium">{t("colActual")}</th>
                    <th className="px-5 py-2 font-medium">{t("colBillable")}</th>
                    <th className="px-5 py-2 font-medium text-right">{t("colAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((s) => (
                    <tr key={s.id} className="border-t border-neutral-50">
                      <td className="px-5 py-3">{s.propertyName}</td>
                      <td className="px-5 py-3">{s.employeeName ?? "—"}</td>
                      <td className="px-5 py-3">{f.date(s.startsAt)}</td>
                      <td className="px-5 py-3 text-neutral-500">
                        {minutesToHours(s.scheduledMinutes)} {t("hoursSuffix")}
                      </td>
                      <td className="px-5 py-3 text-neutral-500">
                        {s.actualMinutes != null
                          ? `${minutesToHours(s.actualMinutes)} ${t("hoursSuffix")}`
                          : t("noCheckIn")}
                      </td>
                      <td className="px-5 py-3">
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          className="input w-24"
                          value={minutesToHours(minutesById[s.id] ?? 0)}
                          onChange={(e) =>
                            setMinutesById((m) => ({
                              ...m,
                              [s.id]: Math.round(Number(e.target.value) * 60),
                            }))
                          }
                        />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {rejecting[s.id] !== undefined ? (
                            <>
                              <input
                                type="text"
                                placeholder={t("reasonPlaceholder")}
                                className="input w-40"
                                value={rejecting[s.id]}
                                onChange={(e) =>
                                  setRejecting((r) => ({ ...r, [s.id]: e.target.value }))
                                }
                              />
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => reject(s.id)}
                                className="btn btn--danger"
                              >
                                {t("confirmReject")}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setRejecting((r) => {
                                    const next = { ...r };
                                    delete next[s.id];
                                    return next;
                                  })
                                }
                                className="btn btn--ghost border border-neutral-200"
                              >
                                {t("cancelReject")}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => setRejecting((r) => ({ ...r, [s.id]: "" }))}
                                className="btn btn--ghost border border-neutral-200"
                              >
                                {t("reject")}
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => approve(s.id)}
                                className="btn btn--primary"
                              >
                                {t("approve")}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

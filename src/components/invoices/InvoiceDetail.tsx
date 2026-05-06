"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { formatEUR } from "@/lib/utils/format";
import {
  lexwareSyncAction,
  markInvoicePaidAction,
  markInvoiceSentAction,
} from "@/app/actions/invoices";
import type { InvoiceDetail as Detail } from "@/lib/api/invoices.types";

const statusStyles: Record<Detail["status"], string> = {
  draft: "bg-neutral-100 text-neutral-700",
  sent: "bg-secondary-50 text-secondary-700",
  paid: "bg-success-50 text-success-700",
  overdue: "bg-error-50 text-error-700",
  cancelled: "bg-neutral-100 text-neutral-500",
};

type Props = {
  detail: Detail;
  canSend: boolean;
  canMarkPaid: boolean;
  canLexware: boolean;
};

export function InvoiceDetail({
  detail,
  canSend,
  canMarkPaid,
  canLexware,
}: Props) {
  const t = useTranslations("invoices.detail");
  const tStatus = useTranslations("invoices.status");
  const router = useRouter();
  const [pending, start] = useTransition();

  function run<T>(
    fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    successMsg: string,
  ) {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(successMsg);
      router.refresh();
    });
  }

  return (
    <>
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          Übersicht
        </Link>
        <span className="text-neutral-400">/</span>
        <Link href={routes.invoices} className="hover:text-neutral-700">
          {t("breadcrumbInvoices")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700 font-mono">
          {detail.invoice_number}
        </span>
      </nav>

      {/* Header */}
      <section className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-[24px] font-bold text-secondary-500">
            {detail.invoice_number}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-neutral-500">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.02em]",
                statusStyles[detail.status],
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {tStatus(detail.status)}
            </span>
            <span>
              {t("issuedOn")}: {format(new Date(detail.issue_date), "yyyy-MM-dd")}
            </span>
            {detail.due_date && (
              <span>
                {t("dueOn")}: {format(new Date(detail.due_date), "yyyy-MM-dd")}
              </span>
            )}
            {detail.paid_at && (
              <span className="text-success-700">
                {t("paidOn")}: {format(new Date(detail.paid_at), "yyyy-MM-dd")}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSend && detail.status === "draft" && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => markInvoiceSentAction(detail.id), t("markSentSuccess"))
              }
              className="btn btn--tertiary"
            >
              {t("actionMarkSent")}
            </button>
          )}
          {canMarkPaid && detail.status !== "paid" && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => markInvoicePaidAction(detail.id), t("markPaidSuccess"))
              }
              className="btn btn--primary"
            >
              {t("actionMarkPaid")}
            </button>
          )}
          {canLexware && !detail.lexware_id && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => lexwareSyncAction(detail.id), t("syncSuccess"))
              }
              className="btn btn--ghost border border-neutral-200 bg-white"
            >
              {t("actionLexware")}
            </button>
          )}
          <a
            href={`/api/invoices/${detail.id}/pdf`}
            className="btn btn--ghost border border-neutral-200 bg-white"
          >
            {t("actionDownloadPdf")}
          </a>
        </div>
      </section>

      {/* Body grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          {/* Line items */}
          <section className="rounded-lg border border-neutral-100 bg-white">
            <header className="border-b border-neutral-100 p-5">
              <h3 className="text-[15px] font-semibold text-neutral-800">
                {t("items")}
              </h3>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>Description</Th>
                    <Th align="right">{t("qty")}</Th>
                    <Th align="right">{t("rate")}</Th>
                    <Th align="right">{t("lineTotal")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-neutral-500">
                        —
                      </td>
                    </tr>
                  )}
                  {detail.items.map((it, idx) => (
                    <tr key={it.id} className="border-b border-neutral-100 last:border-b-0">
                      <td className="px-5 py-3 align-middle font-mono text-[12px] text-neutral-500">
                        {String(idx + 1).padStart(2, "0")}
                      </td>
                      <td className="px-5 py-3 align-middle text-[13px] text-neutral-800">
                        {it.description}
                      </td>
                      <td className="px-5 py-3 text-right align-middle font-mono text-[12px] text-neutral-700">
                        {it.quantity}
                      </td>
                      <td className="px-5 py-3 text-right align-middle font-mono text-[12px] text-neutral-700">
                        {formatEUR(it.unit_price_cents)}
                      </td>
                      <td className="px-5 py-3 text-right align-middle font-mono text-[13px] font-semibold text-secondary-500">
                        {formatEUR(it.unit_price_cents * Number(it.quantity))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} />
                    <td className="px-5 py-2 text-right text-[12px] text-neutral-500">
                      {t("subtotal")}
                    </td>
                    <td className="px-5 py-2 text-right font-mono text-[13px] text-neutral-700">
                      {formatEUR(detail.subtotal_cents)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} />
                    <td className="px-5 py-2 text-right text-[12px] text-neutral-500">
                      {t("tax", { rate: 19 })}
                    </td>
                    <td className="px-5 py-2 text-right font-mono text-[13px] text-neutral-700">
                      {formatEUR(detail.tax_cents)}
                    </td>
                  </tr>
                  <tr className="border-t border-neutral-100">
                    <td colSpan={3} />
                    <td className="px-5 py-3 text-right text-[12px] font-bold uppercase text-neutral-700">
                      {t("total")}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-[16px] font-bold text-secondary-500">
                      {formatEUR(detail.total_cents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {detail.notes && (
            <section className="rounded-lg border border-neutral-100 bg-white p-5">
              <p className="text-[13px] leading-[1.55] text-neutral-700">
                {detail.notes}
              </p>
            </section>
          )}
        </div>

        {/* Side */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-lg border border-neutral-100 bg-white p-5">
            <h3 className="mb-2 text-[13px] font-semibold text-neutral-800">
              {t("statusTitle")}
            </h3>
            <div className="text-[12px] text-neutral-600">
              {detail.lexware_id ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700">
                  ✓ {t("lexwareSynced")}
                </span>
              ) : (
                <span className="text-neutral-500">{t("lexwareNotSynced")}</span>
              )}
            </div>
            {detail.lexware_id && (
              <div className="mt-2 font-mono text-[11px] text-neutral-500">
                Lexware ID: {detail.lexware_id}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-neutral-100 bg-white p-5">
            <header className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-neutral-800">
                {t("clientTitle")}
              </h3>
              <Link
                href={routes.client(detail.client.id)}
                className="text-[12px] font-medium text-secondary-600 hover:underline"
              >
                {t("viewClient")}
              </Link>
            </header>
            <div className="text-[13px]">
              <div className="font-semibold text-neutral-800">
                {detail.client.display_name}
              </div>
              {detail.client.email && (
                <div className="mt-0.5 text-[12px] text-neutral-500">
                  {detail.client.email}
                </div>
              )}
              {detail.client.phone && (
                <div className="text-[12px] text-neutral-500">
                  {detail.client.phone}
                </div>
              )}
              {detail.client.tax_id && (
                <div className="mt-2 font-mono text-[11px] text-neutral-500">
                  VAT {detail.client.tax_id}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "border-b border-neutral-200 bg-neutral-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

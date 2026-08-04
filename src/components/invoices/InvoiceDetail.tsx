"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { useFormat } from "@/lib/utils/i18n-format";
import {
  lexwareSyncAction,
  markInvoicePaidAction,
  markInvoiceSentAction,
} from "@/app/actions/invoices";
import {
  pullPaymentsAction,
  retrySyncInvoiceAction,
} from "@/app/actions/lexware-reconcile";
import type { InvoiceDetail as Detail } from "@/lib/api/invoices.types";

const statusStyles: Record<Detail["status"], string> = {
  draft: "bg-neutral-100 text-neutral-700",
  sent: "bg-warning-50 text-warning-700",
  paid: "bg-success-50 text-success-700",
  overdue: "bg-error-50 text-error-700",
  cancelled: "bg-neutral-100 text-neutral-500",
};

type Props = {
  detail: Detail;
  canSend: boolean;
  canMarkPaid: boolean;
  canLexware: boolean;
  canEdit: boolean;
};

export function InvoiceDetail({
  detail,
  canSend,
  canMarkPaid,
  canLexware,
  canEdit,
}: Props) {
  const t = useTranslations("invoices.detail");
  const tRec = useTranslations("invoices.detail.reconciliation");
  const tStatus = useTranslations("invoices.status");
  const f = useFormat();
  const formatEUR = (cents: number) => f.currencyCents(cents);
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
          {t("breadcrumbDashboard")}
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

      {/* Status banner — mirrors the prototype's full-width alert at
       *  the top of the detail page. Visible whenever the invoice
       *  needs attention (overdue + partially-paid). Paid / Sent /
       *  Draft suppress the banner so the page header stays compact. */}
      <StatusBanner detail={detail} />

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
              {t("issuedOn")}: {f.date(detail.issue_date)}
            </span>
            {detail.due_date && (
              <span>
                {t("dueOn")}: {f.date(detail.due_date)}
              </span>
            )}
            {detail.paid_at && (
              <span className="text-success-700">
                {t("paidOn")}: {f.date(detail.paid_at)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Edit — only on drafts. Hidden once the invoice is sent
              because line edits then would diverge from what Lexware
              and the customer already saw. */}
          {canEdit && detail.status === "draft" && (
            <Link
              href={routes.invoiceEdit(detail.id)}
              className="btn btn--ghost border border-neutral-200 bg-white"
            >
              {t("actionEdit")}
            </Link>
          )}
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
          {/* Retry sync is offered after a failed attempt — same RBAC,
              but using the new reconcile action that stamps attempt
              counts + last_error so the UI history makes sense. */}
          {canLexware && detail.lexware_sync_status === "failed" && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => retrySyncInvoiceAction(detail.id),
                  "Lexware-Sync wiederholt.",
                )
              }
              className="btn btn--ghost border border-warning-300 bg-warning-50 text-warning-700"
              title={detail.lexware_last_error ?? undefined}
            >
              {t("actionLexware")} — Wiederholen
            </button>
          )}
          {/* Pull payments — only useful once the invoice is synced. */}
          {canLexware && detail.lexware_id && detail.status !== "paid" && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await pullPaymentsAction();
                  if (!r.ok) return r;
                  return {
                    ok: true as const,
                    data: { id: detail.id, summary: r.data },
                  };
                }, "Lexware-Zahlungen abgeglichen.")
              }
              className="btn btn--ghost border border-neutral-200 bg-white"
            >
              Lexware-Zahlungen abrufen
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
            {/* Reconciliation history — shown when at least one push has
                been attempted (success or failure). Helps the manager
                understand "why isn't this synced?" without digging into
                the audit log. */}
            {detail.lexware_attempts > 0 && (
              <dl className="mt-3 space-y-1 border-t border-neutral-100 pt-2 text-[11px]">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-neutral-500">{tRec("attempts")}</dt>
                  <dd className="font-mono text-neutral-700">
                    {detail.lexware_attempts}
                  </dd>
                </div>
                {detail.lexware_last_attempt_at && (
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-neutral-500">{tRec("lastAttempt")}</dt>
                    <dd className="font-mono text-neutral-700">
                      {f.dateTime(detail.lexware_last_attempt_at)}
                    </dd>
                  </div>
                )}
                {detail.lexware_last_error && (
                  <div className="mt-2 rounded-md bg-error-50 px-2 py-1.5 text-[11px] text-error-700">
                    <span className="font-semibold">{tRec("errorPrefix")}</span>{" "}
                    {detail.lexware_last_error}
                  </div>
                )}
              </dl>
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

/**
 * Top-of-page banner that's only rendered for invoices needing
 * attention. Three tones:
 *  - overdue  → red gradient + alert icon (the prototype's hero variant)
 *  - partial  → amber + dollar icon  ("partially paid · €X open")
 *  - hidden   → returns null for draft / sent / paid / cancelled
 */
function StatusBanner({ detail }: { detail: Detail }) {
  const t = useTranslations("invoices.detail.banner");
  const f = useFormat();

  if (detail.status === "overdue") {
    const daysOverdue =
      detail.due_date
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(detail.due_date).getTime()) / 86_400_000,
            ),
          )
        : 0;
    return (
      <div className="mb-5 flex items-center gap-4 rounded-lg border border-error-100 border-l-4 border-l-error-500 bg-gradient-to-br from-white to-error-50 px-6 py-4">
        <span className="grid h-[42px] w-[42px] flex-shrink-0 place-items-center rounded-md bg-error-500 text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1={12} y1={9} x2={12} y2={13} />
            <line x1={12} y1={17} x2={12.01} y2={17} />
          </svg>
        </span>
        <div className="flex-1">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-error-700">
            {t("overdueTitle")}
          </h2>
          <p className="mt-0.5 text-[13px] text-neutral-700">
            {t.rich("overdueBody", {
              days: daysOverdue,
              b: (c) => <b className="font-bold text-error-700">{c}</b>,
            })}
          </p>
        </div>
      </div>
    );
  }

  // Partially paid → amber callout.
  const isPartial = detail.paid_amount_cents > 0 && detail.paid_amount_cents < detail.total_cents;
  if (isPartial && detail.status !== "paid") {
    const outstanding = detail.total_cents - detail.paid_amount_cents;
    return (
      <div className="mb-5 flex items-center gap-4 rounded-lg border border-warning-500 border-l-4 bg-warning-50 px-6 py-4">
        <span className="grid h-[42px] w-[42px] flex-shrink-0 place-items-center rounded-md bg-warning-500 text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <line x1={12} y1={1} x2={12} y2={23} />
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
        </span>
        <div className="flex-1">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-warning-700">
            {t("partialTitle")}
          </h2>
          <p className="mt-0.5 text-[13px] text-neutral-700">
            {t.rich("partialBody", {
              amount: f.currencyCents(outstanding),
              b: (c) => <b className="font-bold text-warning-700">{c}</b>,
            })}
          </p>
        </div>
      </div>
    );
  }
  return null;
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

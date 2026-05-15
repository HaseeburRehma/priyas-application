"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { generateMonthlyInvoicesAction } from "@/app/actions/lexware-monthly-invoices";
import type {
  GenerateMonthlyResult,
  LastRunSummary,
} from "@/lib/lexware/monthly";

type Props = {
  lastRun: LastRunSummary;
};

/**
 * Admin-only panel — preview + manually trigger the Lexware monthly billing
 * run. The "Generate now" button confirms with the dry-run summary first.
 */
export function LexwareMonthlyPanel({ lastRun }: Props) {
  const t = useTranslations("lexware");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<GenerateMonthlyResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Default to the *previous* month — that's what the cron bills.
  const now = new Date();
  const previewYear =
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const previewMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;

  const fmtEur = (cents: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));

  const monthLabel = (y: number, m: number) =>
    new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
    }).format(new Date(y, m, 1));

  function runPreview() {
    startTransition(async () => {
      const res = await generateMonthlyInvoicesAction({
        year: previewYear,
        month: previewMonth,
        dryRun: true,
      });
      setPreview(res);
      setConfirmOpen(true);
    });
  }

  function runGenerate() {
    startTransition(async () => {
      const res = await generateMonthlyInvoicesAction({
        year: previewYear,
        month: previewMonth,
        dryRun: false,
      });
      setPreview(res);
      setConfirmOpen(false);
      if (res.ok) {
        toast.success(
          `${res.generated} ${t("clientsToInvoice")} · ${fmtEur(
            Math.round(res.totalEur * 100),
          )}`,
        );
      } else {
        toast.error(
          res.errors[0]?.reason ?? t("errors"),
        );
      }
    });
  }

  return (
    <section className="mt-5 rounded-lg border border-neutral-100 bg-white p-5">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-secondary-500">
            {t("title")}
          </h2>
          <p className="text-[12px] text-neutral-500">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={runPreview}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {t("previewButton")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={runPreview}
            className="rounded-md bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {t("generateButton")}
          </button>
        </div>
      </header>

      <p className="text-[12px] text-neutral-500">
        {t("lastRun")}:{" "}
        {lastRun
          ? `${fmtDate(lastRun.at)} · ${monthLabel(
              lastRun.year,
              lastRun.month,
            )} · ${lastRun.generated} / ${lastRun.skipped} ${t(
              "alreadyInvoiced",
            )}`
          : t("never")}
      </p>

      {confirmOpen && preview && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-neutral-100 bg-white p-5 shadow-xl">
            <h3 className="mb-2 text-[16px] font-bold text-secondary-500">
              {t("dryRunResults")}
            </h3>
            <p className="mb-3 text-[12px] text-neutral-500">
              {monthLabel(previewYear, previewMonth)}
            </p>
            <dl className="mb-4 space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t("clientsToInvoice")}</dt>
                <dd className="font-medium">{preview.generated}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t("alreadyInvoiced")}</dt>
                <dd className="font-medium">{preview.skipped}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">{t("totalAmount")}</dt>
                <dd className="font-semibold">
                  {fmtEur(Math.round(preview.totalEur * 100))}
                </dd>
              </div>
              {preview.errors.length > 0 && (
                <div className="flex justify-between text-error-700">
                  <dt>{t("errors")}</dt>
                  <dd className="font-medium">{preview.errors.length}</dd>
                </div>
              )}
            </dl>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
              >
                {t("cancelButton")}
              </button>
              <button
                type="button"
                onClick={runGenerate}
                disabled={pending || preview.generated === 0}
                className="rounded-md bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {t("confirmGenerate")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

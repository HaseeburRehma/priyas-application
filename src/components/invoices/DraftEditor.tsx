"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { routes } from "@/lib/constants/routes";
import { formatEUR } from "@/lib/billing/money";
import { summarize } from "@/lib/billing/money";
import {
  cancelInvoiceAction,
  issueInvoiceAction,
  updateDraftInvoiceAction,
} from "@/app/actions/invoice-draft";
import type { InvoiceDetail } from "@/lib/api/invoices.types";

type EditableItem = {
  id?: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
};

export function DraftEditor({ detail }: { detail: InvoiceDetail }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [items, setItems] = useState<EditableItem[]>(
    detail.items.map((it) => ({
      id: it.id,
      description: it.description,
      quantity: it.quantity,
      unit_price_cents: it.unit_price_cents,
      tax_rate: it.tax_rate,
    })),
  );
  const [notes, setNotes] = useState(detail.notes ?? "");
  const [dueDate, setDueDate] = useState(detail.due_date ?? "");
  const [sendEmail, setSendEmail] = useState(false);
  const [exportTarget, setExportTarget] = useState(
    detail.export_target !== "internal",
  );

  const totals = useMemo(
    () =>
      summarize(
        items.map((it) => ({
          quantity: it.quantity,
          unitPriceCents: it.unit_price_cents,
          taxRatePercent: it.tax_rate,
        })),
      ),
    [items],
  );

  function setItem(idx: number, patch: Partial<EditableItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  }
  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        description: "",
        quantity: 1,
        unit_price_cents: 0,
        tax_rate: detail.invoice_kind === "alltagshilfe" ? 0 : 19,
      },
    ]);
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function save() {
    start(async () => {
      const r = await updateDraftInvoiceAction({
        invoiceId: detail.id,
        notes: notes.trim() ? notes.trim() : null,
        dueDate: dueDate || null,
        items: items.map((it) => ({
          id: it.id,
          description: it.description,
          quantity: it.quantity,
          unit_price_cents: it.unit_price_cents,
          tax_rate: it.tax_rate,
        })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Gespeichert.");
      router.refresh();
    });
  }

  function issue() {
    start(async () => {
      // Persist edits first.
      const upd = await updateDraftInvoiceAction({
        invoiceId: detail.id,
        notes: notes.trim() ? notes.trim() : null,
        dueDate: dueDate || null,
        items: items.map((it) => ({
          id: it.id,
          description: it.description,
          quantity: it.quantity,
          unit_price_cents: it.unit_price_cents,
          tax_rate: it.tax_rate,
        })),
      });
      if (!upd.ok) {
        toast.error(upd.error);
        return;
      }
      const r = await issueInvoiceAction({
        invoiceId: detail.id,
        sendEmail,
        exportToTarget: exportTarget,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Rechnung ausgestellt.");
      router.push(routes.invoice(detail.id));
    });
  }

  function cancel() {
    if (!confirm("Entwurf wirklich verwerfen?")) return;
    start(async () => {
      const r = await cancelInvoiceAction(detail.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Verworfen.");
      router.push(routes.invoices);
    });
  }

  const isAH = detail.invoice_kind === "alltagshilfe";

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href={routes.invoice(detail.id)} className="text-xs text-neutral-500 hover:text-neutral-700">
          ← Zurück
        </Link>
        <h1 className="text-2xl font-semibold text-secondary-700">
          Entwurf · {detail.invoice_number}
        </h1>
        <p className="text-sm text-neutral-500">
          {detail.client.display_name} ·{" "}
          {isAH ? "Alltagshilfe (steuerfrei § 4 Nr. 16 UStG)" : "Reguläre Rechnung (19 % USt)"}
        </p>
      </header>

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Positionen</h2>
          <button
            type="button"
            onClick={addItem}
            className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
          >
            + Position
          </button>
        </div>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="py-1">Beschreibung</th>
              <th className="py-1 text-right w-20">Menge</th>
              <th className="py-1 text-right w-32">Einzelpreis</th>
              <th className="py-1 text-right w-16">% MwSt</th>
              <th className="py-1 text-right w-32">Summe</th>
              <th className="py-1 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} className="border-t border-neutral-100">
                <td className="py-2">
                  <input
                    value={it.description}
                    onChange={(e) => setItem(idx, { description: e.target.value })}
                    className="w-full rounded border border-neutral-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-secondary-300"
                  />
                </td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={it.quantity}
                    onChange={(e) =>
                      setItem(idx, { quantity: Number(e.target.value) || 0 })
                    }
                    className="w-20 rounded border border-neutral-200 px-2 py-1 text-right"
                  />
                </td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={(it.unit_price_cents / 100).toFixed(2)}
                    onChange={(e) =>
                      setItem(idx, {
                        unit_price_cents: Math.max(0, Math.round(Number(e.target.value) * 100)),
                      })
                    }
                    className="w-28 rounded border border-neutral-200 px-2 py-1 text-right"
                  />
                </td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={it.tax_rate}
                    onChange={(e) =>
                      setItem(idx, { tax_rate: Number(e.target.value) || 0 })
                    }
                    className="w-14 rounded border border-neutral-200 px-2 py-1 text-right"
                    disabled={isAH}
                    title={isAH ? "Alltagshilfe ist steuerfrei" : ""}
                  />
                </td>
                <td className="py-2 text-right font-mono text-neutral-700">
                  {formatEUR(Math.round(it.quantity * it.unit_price_cents))}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-error-500 hover:text-error-700"
                    aria-label="Position entfernen"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-neutral-400">
                  Noch keine Positionen.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 text-sm">
              <td colSpan={4} className="pt-3 text-right text-neutral-500">Zwischensumme</td>
              <td className="pt-3 text-right font-mono">{formatEUR(totals.subtotalCents)}</td>
              <td />
            </tr>
            <tr className="text-sm">
              <td colSpan={4} className="pt-1 text-right text-neutral-500">USt</td>
              <td className="pt-1 text-right font-mono">{formatEUR(totals.taxCents)}</td>
              <td />
            </tr>
            <tr className="text-base font-semibold">
              <td colSpan={4} className="pt-2 text-right">Gesamt</td>
              <td className="pt-2 text-right font-mono">{formatEUR(totals.totalCents)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="text-neutral-600">Fälligkeitsdatum</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-secondary-300"
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Notizen / Zahlungsbedingungen</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-secondary-300"
          />
        </label>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
          />
          E-Mail an Kunde versenden ({detail.client.billing_email ?? detail.client.email ?? "keine E-Mail hinterlegt"})
        </label>
        {detail.export_target !== "internal" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={exportTarget}
              onChange={(e) => setExportTarget(e.target.checked)}
            />
            Sofort an externes System ({detail.export_target}) übertragen
          </label>
        )}
      </section>

      <footer className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-neutral-200 bg-white px-4 py-3 sm:mx-0 sm:rounded-md sm:border sm:bg-white/95 sm:px-3 sm:py-2 backdrop-blur">
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="rounded-md border border-error-300 px-3 py-1.5 text-sm text-error-600 hover:bg-error-50 disabled:opacity-50"
        >
          Verwerfen
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          Speichern
        </button>
        <button
          type="button"
          onClick={issue}
          disabled={pending || items.length === 0}
          className="rounded-md bg-secondary-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-secondary-600 disabled:opacity-50"
        >
          Rechnung ausstellen
        </button>
      </footer>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import {
  deletePropertyClosureAction,
  upsertPropertyClosureAction,
} from "@/app/actions/property-closures";
import type { PropertyClosure } from "@/lib/api/property-closures";

type Props = {
  propertyId: string;
  closures: PropertyClosure[];
  canEdit: boolean;
};

const REASONS = [
  "public_holiday",
  "tenant_closed",
  "renovation",
  "weather",
  "other",
] as const;
type Reason = (typeof REASONS)[number];

type Draft = {
  id?: string;
  start_date: string;
  end_date: string;
  reason: Reason;
  notes: string;
};

const blank = (): Draft => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    start_date: today,
    end_date: today,
    reason: "public_holiday",
    notes: "",
  };
};

const REASON_STYLE: Record<Reason, string> = {
  public_holiday: "bg-secondary-50 text-secondary-700",
  tenant_closed: "bg-warning-50 text-warning-700",
  renovation: "bg-neutral-100 text-neutral-700",
  weather: "bg-tertiary-200 text-secondary-700",
  other: "bg-neutral-100 text-neutral-700",
};

export function ClosuresCard({ propertyId, closures, canEdit }: Props) {
  const t = useTranslations("properties.closures");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editor, setEditor] = useState<Draft | null>(null);

  function openNew() {
    setEditor(blank());
  }
  function openEdit(c: PropertyClosure) {
    setEditor({
      id: c.id,
      start_date: c.start_date,
      end_date: c.end_date,
      reason: c.reason,
      notes: c.notes ?? "",
    });
  }

  function save() {
    if (!editor) return;
    start(async () => {
      const r = await upsertPropertyClosureAction({
        id: editor.id,
        property_id: propertyId,
        start_date: editor.start_date,
        end_date: editor.end_date,
        reason: editor.reason,
        notes: editor.notes,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("saved"));
      setEditor(null);
      router.refresh();
    });
  }

  function remove(c: PropertyClosure) {
    if (!window.confirm(t("confirmDelete"))) return;
    start(async () => {
      const r = await deletePropertyClosureAction(c.id, propertyId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("deleted"));
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 p-5">
        <div>
          <h3 className="text-[15px] font-semibold text-neutral-800">
            {t("title")}
          </h3>
          <p className="mt-0.5 text-[12px] text-neutral-500">
            {t("subtitle")}
          </p>
        </div>
        {canEdit && (
          <button type="button" onClick={openNew} className="btn btn--primary">
            {t("add")}
          </button>
        )}
      </header>

      <div className="p-5">
        {closures.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-200 p-6 text-center text-[13px] text-neutral-500">
            {t("empty")}
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {closures.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] text-neutral-800">
                      {format(new Date(c.start_date), "yyyy-MM-dd")}
                      {c.start_date !== c.end_date && (
                        <> → {format(new Date(c.end_date), "yyyy-MM-dd")}</>
                      )}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]",
                        REASON_STYLE[c.reason],
                      )}
                    >
                      {t(`reasons.${c.reason}` as never)}
                    </span>
                  </div>
                  {c.notes && (
                    <p className="mt-1 text-[12px] leading-[1.5] text-neutral-600">
                      {c.notes}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="btn btn--ghost border border-neutral-200 bg-white text-[12px]"
                    >
                      {t("edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      disabled={pending}
                      className="btn btn--ghost border border-error-300 text-error-700 hover:bg-error-50 text-[12px]"
                    >
                      {t("remove")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editor && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => !pending && setEditor(null)}
        >
          <div
            className="w-full max-w-[480px] rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="border-b border-neutral-100 p-5">
              <h4 className="text-[16px] font-semibold text-neutral-800">
                {editor.id ? t("editTitle") : t("addTitle")}
              </h4>
            </header>
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-neutral-700">
                  {t("startDate")}
                </span>
                <input
                  type="date"
                  className="input"
                  value={editor.start_date}
                  onChange={(e) =>
                    setEditor((s) => s && { ...s, start_date: e.target.value })
                  }
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-neutral-700">
                  {t("endDate")}
                </span>
                <input
                  type="date"
                  className="input"
                  value={editor.end_date}
                  onChange={(e) =>
                    setEditor((s) => s && { ...s, end_date: e.target.value })
                  }
                />
              </label>
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className="text-[13px] font-medium text-neutral-700">
                  {t("reason")}
                </span>
                <select
                  className="input"
                  value={editor.reason}
                  onChange={(e) =>
                    setEditor((s) => s && { ...s, reason: e.target.value as Reason })
                  }
                >
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(`reasons.${r}` as never)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className="text-[13px] font-medium text-neutral-700">
                  {t("notes")}
                </span>
                <textarea
                  rows={3}
                  className="input min-h-[72px]"
                  value={editor.notes}
                  onChange={(e) =>
                    setEditor((s) => s && { ...s, notes: e.target.value })
                  }
                />
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t border-neutral-100 p-4">
              <button
                type="button"
                onClick={() => setEditor(null)}
                disabled={pending}
                className="btn btn--ghost border border-neutral-200"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="btn btn--primary"
              >
                {pending ? "…" : t("save")}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}

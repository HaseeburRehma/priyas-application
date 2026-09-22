"use client";

/**
 * Feature-update #17 · Quick-job dialog.
 *
 * A minimal form for one-time cleanings that don't warrant creating a
 * full customer record: pick a staff member, pick a date, write a
 * short description, enter hours, save. Invoicing is handled manually
 * by Priya's team so there's no property_id / Lexware wiring here.
 *
 * Reuses /api/shifts/options for the employee picker (same endpoint
 * PlanShiftDialog uses) so we don't spin up a bespoke loader for
 * three field values.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { createOneOffJobAction } from "@/app/actions/one-off-jobs";
import type { ShiftOptionsResponse } from "@/app/api/shifts/options/route";

type Props = {
  open: boolean;
  onClose: () => void;
  /** ISO date to prefill; defaults to today. */
  defaultDate?: string;
};

export function QuickJobDialog({ open, onClose, defaultDate }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [employees, setEmployees] = useState<
    ShiftOptionsResponse["employees"]
  >([]);
  const [form, setForm] = useState({
    employee_id: "",
    performed_on: defaultDate ?? new Date().toISOString().slice(0, 10),
    description: "",
    hours: "1.0",
    invoice_note: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch employees when the dialog opens; PlanShiftDialog uses the
  // same endpoint, so a warm React Query cache from a prior visit
  // will make this near-instant.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/shifts/options", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as ShiftOptionsResponse;
      if (!cancelled) setEmployees(json.employees);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Body scroll lock + Escape to close, same pattern as InviteEmployeeDialog.
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      const res = await createOneOffJobAction({
        employee_id: form.employee_id,
        performed_on: form.performed_on,
        description: form.description,
        hours: Number(form.hours),
        invoice_note: form.invoice_note || undefined,
      });
      if (!res.ok) {
        if (res.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.fieldErrors)) {
            if (Array.isArray(v) && v[0]) flat[k] = v[0];
          }
          setErrors(flat);
        }
        toast.error(res.error);
        return;
      }
      toast.success("Quick-Job gespeichert");
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <div>
            <h2 className="text-[15px] font-semibold text-secondary-500">
              Quick-Job anlegen
            </h2>
            <p className="text-[12px] text-neutral-500">
              Einmaliger Auftrag ohne Kundenanlage
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
          >
            ✕
          </button>
        </header>

        <div className="grid grid-cols-1 gap-3 p-5">
          <Field label="Mitarbeiter*in" error={errors.employee_id} required>
            <select
              className="input"
              value={form.employee_id}
              onChange={(e) => set("employee_id", e.target.value)}
              disabled={pending}
            >
              <option value="">— auswählen —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Datum" error={errors.performed_on} required>
              <input
                type="date"
                className="input"
                value={form.performed_on}
                onChange={(e) => set("performed_on", e.target.value)}
                disabled={pending}
              />
            </Field>
            <Field label="Stunden" error={errors.hours} required>
              <input
                type="number"
                step="0.25"
                min={0.25}
                max={24}
                className="input"
                value={form.hours}
                onChange={(e) => set("hours", e.target.value)}
                disabled={pending}
              />
            </Field>
          </div>

          <Field label="Beschreibung" error={errors.description} required>
            <textarea
              rows={3}
              className="input min-h-[80px]"
              placeholder="z. B. Grundreinigung Praxis Dr. Müller, Essen"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              disabled={pending}
            />
          </Field>

          <Field label="Rechnungsnotiz (optional)" error={errors.invoice_note}>
            <input
              type="text"
              className="input"
              placeholder="z. B. Barzahlung, Rechnung an Herrn Müller"
              value={form.invoice_note}
              onChange={(e) => set("invoice_note", e.target.value)}
              disabled={pending}
            />
          </Field>
        </div>

        <footer className="flex justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={pending}
            className={cn(
              "rounded-md bg-primary-500 px-4 py-1.5 text-[13px] font-semibold text-white shadow-xs transition",
              "hover:bg-primary-600 disabled:opacity-60",
            )}
          >
            {pending ? "Speichern…" : "Speichern"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[12px]">
      <span className="mb-1 block font-medium text-neutral-700">
        {label}
        {required && <span className="ml-0.5 text-error-500">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-error-600">{error}</span>}
    </label>
  );
}

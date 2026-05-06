"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { createShiftAction } from "@/app/actions/shifts";
import type { ShiftOptionsResponse } from "@/app/api/shifts/options/route";

type Props = {
  open: boolean;
  onClose: () => void;
  /** ISO date string (yyyy-MM-dd). Optional default. */
  defaultDate?: string;
  /** Pre-select a property (e.g. when launched from a property detail page). */
  defaultPropertyId?: string;
};

/**
 * Modal dialog for creating a shift. Loads the property + employee picker
 * options on mount and posts via the server action. On success the parent
 * page is refreshed so the new shift appears in the calendar grid.
 */
export function PlanShiftDialog({
  open,
  onClose,
  defaultDate,
  defaultPropertyId,
}: Props) {
  const t = useTranslations("schedule.dialog");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [options, setOptions] = useState<ShiftOptionsResponse | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState(() => {
    const date = defaultDate ?? format(new Date(), "yyyy-MM-dd");
    return {
      property_id: defaultPropertyId ?? "",
      employee_id: "",
      date,
      start_time: "09:00",
      end_time: "11:00",
      notes: "",
    };
  });

  // Lock background scroll while open + handle Esc to close.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Fetch options once when first opened.
  useEffect(() => {
    if (!open || options) return;
    let cancelled = false;
    fetch("/api/shifts/options", { cache: "no-store" })
      .then((r) => r.json() as Promise<ShiftOptionsResponse>)
      .then((data) => {
        if (cancelled) return;
        setOptions(data);
        setForm((f) => ({
          ...f,
          property_id:
            f.property_id || defaultPropertyId || data.properties[0]?.id || "",
        }));
      })
      .catch(() => {
        if (!cancelled) toast.error(t("saveError"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, options, t, defaultPropertyId]);

  if (!open) return null;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    if (form.end_time <= form.start_time) {
      setErrors({ ends_at: t("endAfterStart") });
      return;
    }
    start(async () => {
      const startsAt = new Date(`${form.date}T${form.start_time}:00`);
      const endsAt = new Date(`${form.date}T${form.end_time}:00`);
      const result = await createShiftAction({
        property_id: form.property_id,
        employee_id: form.employee_id || null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        notes: form.notes,
      });
      if (!result.ok) {
        if (result.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(result.fieldErrors)) {
            if (Array.isArray(v) && v[0]) flat[k] = v[0];
          }
          setErrors(flat);
        }
        toast.error(result.error || t("saveError"));
        return;
      }
      toast.success(t("saveSuccess"));
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-xl border border-neutral-100 bg-white shadow-lg sm:rounded-xl">
        <header className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 pb-4 pt-5">
          <div>
            <h2 className="text-[18px] font-bold text-secondary-500">
              {t("title")}
            </h2>
            <p className="mt-0.5 text-[12px] text-neutral-500">
              {t("subtitle")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("cancel")}
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <form onSubmit={submit} className="flex flex-col overflow-y-auto" noValidate>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            {/* Property */}
            <Field
              label={t("property")}
              required
              error={errors.property_id}
              className="md:col-span-2"
            >
              <select
                className="input"
                required
                value={form.property_id}
                onChange={(e) => update("property_id", e.target.value)}
                disabled={!options}
              >
                {!options && <option>{t("loadingOptions")}</option>}
                {options && (
                  <option value="" disabled>
                    {t("propertyPlaceholder")}
                  </option>
                )}
                {options?.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.client_name}
                  </option>
                ))}
              </select>
            </Field>

            {/* Employee */}
            <Field
              label={t("employee")}
              error={errors.employee_id}
              className="md:col-span-2"
            >
              <select
                className="input"
                value={form.employee_id}
                onChange={(e) => update("employee_id", e.target.value)}
                disabled={!options}
              >
                <option value="">{t("noEmployee")}</option>
                {options?.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </option>
                ))}
              </select>
            </Field>

            {/* Date */}
            <Field label={t("date")} required error={errors.starts_at}>
              <input
                type="date"
                className="input"
                required
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
              />
            </Field>

            {/* Start + end time */}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("startTime")} required>
                <input
                  type="time"
                  className="input"
                  required
                  value={form.start_time}
                  onChange={(e) => update("start_time", e.target.value)}
                />
              </Field>
              <Field
                label={t("endTime")}
                required
                error={errors.ends_at}
              >
                <input
                  type="time"
                  className="input"
                  required
                  value={form.end_time}
                  onChange={(e) => update("end_time", e.target.value)}
                />
              </Field>
            </div>

            {/* Notes */}
            <Field
              label={t("notes")}
              error={errors.notes}
              className="md:col-span-2"
            >
              <textarea
                className="input min-h-[88px]"
                placeholder={t("notesPlaceholder")}
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
            </Field>
          </div>

          <footer className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-neutral-100 bg-white px-6 py-4">
            <button
              type="button"
              className="btn btn--ghost border border-neutral-200"
              onClick={onClose}
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={pending || !options}
              className={cn("btn btn--primary", pending && "opacity-80")}
            >
              {pending ? t("saving") : t("save")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] font-medium text-neutral-700">
        {label}
        {required && <span className="ml-1 text-error-500">*</span>}
      </span>
      {children}
      {error && <span className="text-[12px] text-error-700">{error}</span>}
    </label>
  );
}

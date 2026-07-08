"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
  /**
   * Pre-select an employee — set when the dialog was opened by dragging a
   * staff member from the roster onto a calendar cell. When set, the
   * property list is filtered to properties compatible with this
   * employee's `service_type` instead of auto-picking the first property,
   * so the drag can't silently pair an Alltagshilfe-only carer with a
   * Priya's property (or vice versa).
   */
  defaultEmployeeId?: string;
  /** Hour-of-day (0–23) from the dropped calendar cell, seeds start_time. */
  defaultHour?: number;
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
  defaultEmployeeId,
  defaultHour,
}: Props) {
  const t = useTranslations("schedule.dialog");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [options, setOptions] = useState<ShiftOptionsResponse | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * Picks the property to pre-select: an explicit default wins, then — as
   * long as no employee was pre-selected via drag (that path needs an
   * explicit, service-line-compatible choice, not an arbitrary first
   * property) — falls back to the first property once options are loaded.
   */
  const resolvePropertyId = useCallback(
    (opts: ShiftOptionsResponse | null): string => {
      if (defaultPropertyId) return defaultPropertyId;
      if (defaultEmployeeId || !opts) return "";
      return opts.properties[0]?.id || "";
    },
    [defaultPropertyId, defaultEmployeeId],
  );

  function buildInitialForm(opts: ShiftOptionsResponse | null) {
    const date = defaultDate ?? format(new Date(), "yyyy-MM-dd");
    const startHour = defaultHour ?? 9;
    return {
      property_id: resolvePropertyId(opts),
      employee_id: defaultEmployeeId ?? "",
      date,
      start_time: `${String(startHour).padStart(2, "0")}:00`,
      end_time: `${String(startHour + 2).padStart(2, "0")}:00`,
      notes: "",
    };
  }
  const [form, setForm] = useState(() => buildInitialForm(null));

  // This component never unmounts while the parent keeps it in the tree
  // (it just renders null when `!open`), so the `useState` initializer
  // above only runs on first mount — without this effect, a second
  // drag-drop (or a second "+ Plan shift" click with a different set of
  // defaults) would keep showing the *first* open's prefilled
  // employee/date/time/property instead of the new one. Re-seed on every
  // closed→open transition instead, using `options` if already cached
  // from a previous open (the fetch effect below only runs once).
  useEffect(() => {
    if (!open) return;
    setForm(buildInitialForm(options));
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate, defaultPropertyId, defaultEmployeeId, defaultHour]);

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

  // Fetch options once when first opened (cached across later opens).
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
          property_id: f.property_id || resolvePropertyId(data),
        }));
      })
      .catch(() => {
        if (!cancelled) toast.error(t("saveError"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, options, t, resolvePropertyId]);

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
      onKeyDown={(e) => {
        // Keyboard parity for the backdrop dismiss. We re-dispatch the
        // click on the same element so the existing onClick logic
        // (which checks e.target === e.currentTarget) runs unchanged.
        if (e.key === "Escape") (e.currentTarget as HTMLElement).click();
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
              {options && defaultEmployeeId && !form.property_id && (
                <p className="mb-1.5 text-[11px] text-primary-700">
                  {t("pickPropertyForEmployee", {
                    name:
                      options.employees.find((e) => e.id === defaultEmployeeId)
                        ?.full_name ?? "",
                  })}
                </p>
              )}
              <select
                className="input"
                required
                value={form.property_id}
                onChange={(e) => {
                  const newPropertyId = e.target.value;
                  update("property_id", newPropertyId);
                  // Only clear the employee if they're not eligible for the
                  // newly-picked property's service line. Blindly clearing
                  // here would wipe out an employee pre-selected by dragging
                  // them onto the grid the moment the user picks a property
                  // (the very next required step of that same flow).
                  const newProp = options?.properties.find(
                    (p) => p.id === newPropertyId,
                  );
                  const newClientType =
                    newProp?.client_customer_type ?? "commercial";
                  const currentEmp = options?.employees.find(
                    (emp) => emp.id === form.employee_id,
                  );
                  const stillEligible =
                    currentEmp &&
                    (newClientType === "alltagshilfe"
                      ? currentEmp.service_type === "alltagshilfe" ||
                        currentEmp.service_type === "both"
                      : currentEmp.service_type === "priya" ||
                        currentEmp.service_type === "both");
                  if (!stillEligible) update("employee_id", "");
                }}
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
                    {p.client_customer_type === "alltagshilfe" ? " · Alltagshilfe" : ""}
                  </option>
                ))}
              </select>
            </Field>

            {/* Employee — filtered to those qualified for the selected property's service line */}
            <Field
              label={t("employee")}
              error={errors.employee_id}
              className="md:col-span-2"
            >
              {(() => {
                const selectedProp = options?.properties.find(
                  (p) => p.id === form.property_id,
                );
                const clientType = selectedProp?.client_customer_type ?? "commercial";
                const eligibleEmployees = options?.employees.filter((emp) => {
                  if (clientType === "alltagshilfe") {
                    return emp.service_type === "alltagshilfe" || emp.service_type === "both";
                  }
                  // Priya / residential / commercial → priya or both
                  return emp.service_type === "priya" || emp.service_type === "both";
                });
                const isAlltags = clientType === "alltagshilfe";
                return (
                  <>
                    {options && isAlltags && (
                      <p className="mb-1.5 text-[11px] text-error-700">
                        Nur qualifiziertes Pflegepersonal (Alltagshilfe) wird angezeigt.
                      </p>
                    )}
                    <select
                      className="input"
                      value={form.employee_id}
                      onChange={(e) => update("employee_id", e.target.value)}
                      disabled={!options}
                    >
                      <option value="">{t("noEmployee")}</option>
                      {eligibleEmployees?.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.full_name}
                        </option>
                      ))}
                    </select>
                  </>
                );
              })()}
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

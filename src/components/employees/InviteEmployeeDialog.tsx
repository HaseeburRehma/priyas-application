"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { createEmployeeAction } from "@/app/actions/employees";

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Modal for inviting a new employee. RBAC-gated server-side. */
export function InviteEmployeeDialog({ open, onClose }: Props) {
  const t = useTranslations("employees.form");
  const tDialog = useTranslations("employees.dialog");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    hire_date: "",
    weekly_hours: "40",
    hourly_rate_eur: "",
    status: "active" as "active" | "on_leave" | "inactive",
    notes: "",
  });

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

  if (!open) return null;

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      const result = await createEmployeeAction({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        hire_date: form.hire_date,
        weekly_hours: Number(form.weekly_hours || 40),
        hourly_rate_eur:
          form.hourly_rate_eur === "" ? "" : Number(form.hourly_rate_eur),
        status: form.status,
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
      toast.success(tDialog("createSuccess"));
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-xl border border-neutral-100 bg-white shadow-lg sm:rounded-xl">
        <header className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 pb-4 pt-5">
          <div>
            <h2 className="text-[18px] font-bold text-secondary-500">
              {t("createTitle")}
            </h2>
            <p className="mt-0.5 text-[12px] text-neutral-500">
              {tDialog("createSubtitle")}
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
            <Field
              label={t("fullName")}
              required
              error={errors.full_name}
              className="md:col-span-2"
            >
              <input
                className="input"
                required
                value={form.full_name}
                onChange={(e) => update("full_name", e.target.value)}
              />
            </Field>
            <Field label={t("email")} error={errors.email}>
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </Field>
            <Field label={t("phone")} error={errors.phone}>
              <input
                className="input"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </Field>
            <Field label={t("hireDate")} error={errors.hire_date}>
              <input
                type="date"
                className="input"
                value={form.hire_date}
                onChange={(e) => update("hire_date", e.target.value)}
              />
            </Field>
            <Field label={t("status")} error={errors.status}>
              <select
                className="input"
                value={form.status}
                onChange={(e) =>
                  update(
                    "status",
                    e.target.value as "active" | "on_leave" | "inactive",
                  )
                }
              >
                <option value="active">Active</option>
                <option value="on_leave">On leave</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <Field
              label={t("weeklyHours")}
              error={errors.weekly_hours}
            >
              <input
                type="number"
                min={0}
                max={80}
                step={0.5}
                className="input"
                value={form.weekly_hours}
                onChange={(e) => update("weekly_hours", e.target.value)}
              />
            </Field>
            <Field
              label={t("hourlyRate")}
              error={errors.hourly_rate_eur}
            >
              <input
                type="number"
                min={0}
                step={0.5}
                className="input"
                value={form.hourly_rate_eur}
                onChange={(e) => update("hourly_rate_eur", e.target.value)}
              />
            </Field>
          </div>

          <footer className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-neutral-100 bg-white px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn--ghost border border-neutral-200"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className={cn("btn btn--primary", pending && "opacity-80")}
            >
              {pending ? tDialog("saving") : t("save")}
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

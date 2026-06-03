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
  const tFields = useTranslations("employees.dialog.fields");
  const tAuthRole = useTranslations("employees.authRole");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    // Legacy combined name — auto-derived from first+last on submit.
    full_name: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address_line1: "",
    postal_code: "",
    city: "",
    date_of_birth: "",
    nationality: "Deutsch",
    salary_type: "hourly" as "hourly" | "monthly",
    hourly_rate_eur: "",
    monthly_salary_eur: "",
    weekly_hours: "40",
    vacation_days_per_year: "24",
    contract_start: "",
    hire_date: "",
    status: "active" as "active" | "on_leave" | "inactive",
    role: "employee" as "admin" | "dispatcher" | "employee",
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
    // Auto-derive full_name from first+last so the legacy field stays
    // populated for the audit log, reports, and exports that still
    // reference it. The operator only edits the split halves.
    const fullName =
      form.full_name.trim() ||
      `${form.first_name.trim()} ${form.last_name.trim()}`.trim();
    start(async () => {
      const result = await createEmployeeAction({
        full_name: fullName,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        address_line1: form.address_line1,
        postal_code: form.postal_code,
        city: form.city,
        date_of_birth: form.date_of_birth,
        nationality: form.nationality,
        salary_type: form.salary_type,
        monthly_salary_eur:
          form.salary_type === "monthly" && form.monthly_salary_eur !== ""
            ? Number(form.monthly_salary_eur)
            : "",
        vacation_days_per_year:
          form.vacation_days_per_year === ""
            ? ""
            : Number(form.vacation_days_per_year),
        contract_start: form.contract_start || form.hire_date,
        hire_date: form.hire_date || form.contract_start,
        weekly_hours: Number(form.weekly_hours || 40),
        hourly_rate_eur:
          form.salary_type === "hourly" && form.hourly_rate_eur !== ""
            ? Number(form.hourly_rate_eur)
            : "",
        status: form.status,
        role: form.role,
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
      // Surface the invite-email outcome explicitly. The employees row
      // is always created; the magic-link email is best-effort.
      if (result.data.inviteStatus === "sent") {
        toast.success(tDialog("createWithInvite"));
      } else if (result.data.inviteStatus === "failed") {
        toast.message(
          tDialog("createNoInvite", { reason: result.data.inviteError ?? "" }),
        );
      } else {
        toast.success(tDialog("createSuccess"));
      }
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
            {/* Section: identity ------------------------------------- */}
            <Field label={tFields("vorname")} required error={errors.first_name}>
              <input
                className="input"
                required
                value={form.first_name}
                onChange={(e) => update("first_name", e.target.value)}
              />
            </Field>
            <Field label={tFields("name")} required error={errors.last_name}>
              <input
                className="input"
                required
                value={form.last_name}
                onChange={(e) => update("last_name", e.target.value)}
              />
            </Field>
            <Field label={tFields("address")} error={errors.address_line1} className="md:col-span-2">
              <input
                className="input"
                value={form.address_line1}
                onChange={(e) => update("address_line1", e.target.value)}
              />
            </Field>
            <Field label={tFields("plz")} error={errors.postal_code}>
              <input
                className="input"
                value={form.postal_code}
                onChange={(e) => update("postal_code", e.target.value)}
              />
            </Field>
            <Field label={tFields("city")} error={errors.city}>
              <input
                className="input"
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
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
            <Field label={tFields("dob")} error={errors.date_of_birth}>
              <input
                type="date"
                className="input"
                value={form.date_of_birth}
                onChange={(e) => update("date_of_birth", e.target.value)}
              />
            </Field>
            <Field label={tFields("nationality")} error={errors.nationality}>
              <input
                className="input"
                value={form.nationality}
                onChange={(e) => update("nationality", e.target.value)}
              />
            </Field>

            {/* Section: compensation --------------------------------- */}
            <Field label={tFields("salaryType")} error={errors.salary_type}>
              <select
                className="input"
                value={form.salary_type}
                onChange={(e) =>
                  update("salary_type", e.target.value as "hourly" | "monthly")
                }
              >
                <option value="hourly">{tFields("hourly")}</option>
                <option value="monthly">{tFields("monthly")}</option>
              </select>
            </Field>
            {form.salary_type === "hourly" ? (
              <Field label={tFields("hourlyRate")} error={errors.hourly_rate_eur}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={form.hourly_rate_eur}
                  onChange={(e) => update("hourly_rate_eur", e.target.value)}
                />
              </Field>
            ) : (
              <Field label={tFields("monthlySalary")} required error={errors.monthly_salary_eur}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  required
                  value={form.monthly_salary_eur}
                  onChange={(e) => update("monthly_salary_eur", e.target.value)}
                />
              </Field>
            )}
            <Field label={tFields("weeklyHours")} error={errors.weekly_hours}>
              <input
                type="number"
                step="0.5"
                min="0"
                className="input"
                value={form.weekly_hours}
                onChange={(e) => update("weekly_hours", e.target.value)}
              />
            </Field>
            <Field label={tFields("vacation")} error={errors.vacation_days_per_year}>
              <input
                type="number"
                step="1"
                min="0"
                max="60"
                className="input"
                value={form.vacation_days_per_year}
                onChange={(e) =>
                  update("vacation_days_per_year", e.target.value)
                }
              />
            </Field>
            <Field label={tFields("contractStart")} error={errors.contract_start}>
              <input
                type="date"
                className="input"
                value={form.contract_start}
                onChange={(e) => update("contract_start", e.target.value)}
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
            <Field label={t("role")} error={errors.role}>
              <select
                className="input"
                value={form.role}
                onChange={(e) =>
                  update(
                    "role",
                    e.target.value as "admin" | "dispatcher" | "employee",
                  )
                }
              >
                <option value="employee">{tAuthRole("employee")}</option>
                <option value="dispatcher">{tAuthRole("dispatcher")}</option>
                <option value="admin">{tAuthRole("admin")}</option>
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

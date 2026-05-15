"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import {
  archiveEmployeeAction,
  updateEmployeeAction,
  updateEmployeeRoleAction,
} from "@/app/actions/employees";

type AuthRole = "admin" | "dispatcher" | "employee";

type Initial = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  hire_date: string | null;
  weekly_hours: number;
  hourly_rate_eur: number | null;
  status: "active" | "on_leave" | "inactive";
  auth_role: AuthRole | null;
  profile_id: string | null;
};

type Props = {
  initial: Initial;
  canUpdate: boolean;
  canArchive: boolean;
  currentUserId: string | null;
};

export function EmployeeDetailActions({
  initial,
  canUpdate,
  canArchive,
  currentUserId,
}: Props) {
  const t = useTranslations("employees.detail");
  const tForm = useTranslations("employees.form");
  const tDialog = useTranslations("employees.dialog");
  const tRole = useTranslations("employees.role");
  const tAuthRole = useTranslations("employees.authRole");
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pending, start] = useTransition();

  // The role button must be hidden when the current admin/dispatcher
  // is looking at their *own* profile — the DB trigger
  // trg_prevent_self_role_escalation would reject the write anyway.
  const isSelf =
    currentUserId !== null &&
    initial.profile_id !== null &&
    currentUserId === initial.profile_id;
  const canChangeRole = canUpdate && !isSelf && initial.profile_id !== null;

  function archive() {
    if (!confirm(t("deleteConfirm"))) return;
    start(async () => {
      const r = await archiveEmployeeAction(initial.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("deleteSuccess"));
      setMoreOpen(false);
      router.replace(routes.employees);
      router.refresh();
    });
  }

  /**
   * Download this employee's monthly working-time CSV. Hits
   * /api/reports/working-time which the manager-only canReachRoute
   * guard already protects. Default month = current; managers can
   * adjust via URL if they want a historical period.
   */
  function downloadWorkingTime() {
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const url = `/api/reports/working-time?month=${month}&employee=${initial.id}`;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <>
      <div className="ml-auto flex flex-shrink-0 items-center gap-2">
        <Link
          href={routes.chat}
          className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
          title={t("message")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M21 12a7.5 7.5 0 01-11.2 6.5L4 20l1.5-5.2A7.5 7.5 0 1121 12z" />
          </svg>
        </Link>
        <Link
          href={routes.schedule}
          className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
          title={t("schedule")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <rect x={3} y={5} width={18} height={16} rx={2} />
            <path d="M3 9h18M8 3v4M16 3v4" />
          </svg>
        </Link>
        {canUpdate && (
          <Link
            href={routes.training}
            className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
            title={t("assignTraining")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </Link>
        )}
        {canUpdate && (
          <button
            type="button"
            onClick={downloadWorkingTime}
            className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
            title={t("downloadHours")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </button>
        )}
        {canChangeRole && (
          <button
            type="button"
            onClick={() => setRoleOpen(true)}
            className="btn btn--tertiary"
            title={tRole("change")}
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
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
              <circle cx={9} cy={7} r={4} />
              <path d="M17 11l2 2 4-4" />
            </svg>
            {tRole("change")}
          </button>
        )}
        {canUpdate && (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="btn btn--tertiary"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            {t("edit")}
          </button>
        )}
        {canArchive && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((s) => !s)}
              className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"
              aria-label={t("moreActions")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <circle cx={12} cy={5} r={1} />
                <circle cx={12} cy={12} r={1} />
                <circle cx={12} cy={19} r={1} />
              </svg>
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-11 z-30 w-[200px] overflow-hidden rounded-md border border-neutral-100 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={archive}
                  disabled={pending}
                  className="block w-full px-4 py-2 text-left text-[13px] text-error-700 transition hover:bg-error-50"
                >
                  {t("delete")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {editOpen && (
        <EditDialog
          initial={initial}
          onClose={() => setEditOpen(false)}
          tForm={tForm}
          tDialog={tDialog}
          onSaved={() => {
            setEditOpen(false);
            router.refresh();
          }}
        />
      )}

      {roleOpen && (
        <RoleDialog
          employeeId={initial.id}
          fullName={initial.full_name}
          currentRole={initial.auth_role}
          onClose={() => setRoleOpen(false)}
          tForm={tForm}
          tDialog={tDialog}
          tRole={tRole}
          tAuthRole={tAuthRole}
          onSaved={() => {
            setRoleOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function RoleDialog({
  employeeId,
  fullName,
  currentRole,
  onClose,
  onSaved,
  tForm,
  tDialog,
  tRole,
  tAuthRole,
}: {
  employeeId: string;
  fullName: string;
  currentRole: AuthRole | null;
  onClose: () => void;
  onSaved: () => void;
  tForm: ReturnType<typeof useTranslations>;
  tDialog: ReturnType<typeof useTranslations>;
  tRole: ReturnType<typeof useTranslations>;
  tAuthRole: ReturnType<typeof useTranslations>;
}) {
  const [pending, start] = useTransition();
  const [role, setRole] = useState<AuthRole>(currentRole ?? "employee");

  useEffect(() => {
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
  }, [onClose]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await updateEmployeeRoleAction({
        employeeId,
        role,
      });
      if (!r.ok) {
        // The server returns the sentinel "self-role-change" for both
        // our pre-check and the trigger's 42501 — surface a friendly
        // localised message in either case.
        if (r.error === "self-role-change") {
          toast.error(tRole("changeSelf"));
        } else {
          toast.error(r.error || tForm("saveError"));
        }
        return;
      }
      toast.success(tRole("changeSuccess"));
      onSaved();
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
      <div className="flex max-h-[92vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-xl border border-neutral-100 bg-white shadow-lg sm:rounded-xl">
        <header className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 pb-4 pt-5">
          <div>
            <h2 className="text-[18px] font-bold text-secondary-500">
              {tRole("changeTitle")}
            </h2>
            <p className="mt-0.5 text-[12px] text-neutral-500">
              {tRole("changeConfirm", { name: fullName })}
            </p>
          </div>
          <button
            type="button"
            aria-label={tForm("cancel")}
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-50"
          >
            <span aria-hidden>✕</span>
          </button>
        </header>

        <form onSubmit={submit} className="flex flex-col" noValidate>
          <div className="p-6">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-neutral-700">
                {tForm("role")}
              </span>
              <select
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as AuthRole)}
              >
                <option value="employee">{tAuthRole("employee")}</option>
                <option value="dispatcher">{tAuthRole("dispatcher")}</option>
                <option value="admin">{tAuthRole("admin")}</option>
              </select>
            </label>
          </div>

          <footer className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-neutral-100 bg-white px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn--ghost border border-neutral-200"
            >
              {tForm("cancel")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className={cn("btn btn--primary", pending && "opacity-80")}
            >
              {pending ? tDialog("saving") : tForm("save")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function EditDialog({
  initial,
  onClose,
  onSaved,
  tForm,
  tDialog,
}: {
  initial: Initial;
  onClose: () => void;
  onSaved: () => void;
  tForm: ReturnType<typeof useTranslations>;
  tDialog: ReturnType<typeof useTranslations>;
}) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    full_name: initial.full_name,
    email: initial.email ?? "",
    phone: initial.phone ?? "",
    hire_date: initial.hire_date ? initial.hire_date.slice(0, 10) : "",
    weekly_hours: String(initial.weekly_hours ?? 40),
    hourly_rate_eur:
      initial.hourly_rate_eur != null ? String(initial.hourly_rate_eur) : "",
    status: initial.status,
    notes: "",
  });

  useEffect(() => {
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
  }, [onClose]);

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
      const r = await updateEmployeeAction({
        id: initial.id,
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
      if (!r.ok) {
        if (r.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(r.fieldErrors)) {
            if (Array.isArray(v) && v[0]) flat[k] = v[0];
          }
          setErrors(flat);
        }
        toast.error(r.error || tForm("saveError"));
        return;
      }
      toast.success(tDialog("saveSuccess"));
      onSaved();
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
              {tForm("editTitle")}
            </h2>
          </div>
          <button
            type="button"
            aria-label={tForm("cancel")}
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-50"
          >
            <span aria-hidden>✕</span>
          </button>
        </header>

        <form
          onSubmit={submit}
          className="flex flex-col overflow-y-auto"
          noValidate
        >
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            <Field
              label={tForm("fullName")}
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
            <Field label={tForm("email")} error={errors.email}>
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </Field>
            <Field label={tForm("phone")} error={errors.phone}>
              <input
                className="input"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </Field>
            <Field label={tForm("hireDate")} error={errors.hire_date}>
              <input
                type="date"
                className="input"
                value={form.hire_date}
                onChange={(e) => update("hire_date", e.target.value)}
              />
            </Field>
            <Field label={tForm("status")} error={errors.status}>
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
              label={tForm("weeklyHours")}
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
              label={tForm("hourlyRate")}
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
              {tForm("cancel")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className={cn("btn btn--primary", pending && "opacity-80")}
            >
              {pending ? tDialog("saving") : tForm("save")}
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

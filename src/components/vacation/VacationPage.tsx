"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { useFormat } from "@/lib/utils/i18n-format";
import {
  cancelVacationRequestAction,
  createVacationRequestAction,
  reviewVacationRequestAction,
} from "@/app/actions/vacation";
import type {
  VacationData,
  VacationRequest,
  VacationStatus,
} from "@/lib/api/vacation";

const TABS: Array<"all" | VacationStatus> = [
  "all",
  "pending",
  "approved",
  "rejected",
];

const statusStyles: Record<VacationStatus, string> = {
  pending: "bg-warning-50 text-warning-700",
  approved: "bg-success-50 text-success-700",
  rejected: "bg-error-50 text-error-700",
  cancelled: "bg-neutral-100 text-neutral-600",
  suggested: "bg-blue-50 text-blue-700",
};

type Props = { data: VacationData };

export function VacationPage({ data }: Props) {
  const t = useTranslations("vacation");
  const tStatus = useTranslations("vacation.status");
  const tTabs = useTranslations("vacation.tabs");
  const tTable = useTranslations("vacation.table");
  const router = useRouter();
  const f = useFormat();
  const [tab, setTab] = useState<"all" | VacationStatus>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [pending, start] = useTransition();

  const filtered = data.requests.filter(
    (r) => tab === "all" || r.status === tab,
  );

  function review(id: string, approve: boolean) {
    start(async () => {
      const r = await reviewVacationRequestAction({
        id,
        approve,
        reviewer_note: "",
      });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(approve ? t("approved") : t("rejected"));
        router.refresh();
      }
    });
  }

  function cancel(id: string) {
    if (!confirm(t("cancel") + "?")) return;
    start(async () => {
      const r = await cancelVacationRequestAction(id);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(t("cancelled"));
        router.refresh();
      }
    });
  }

  return (
    <>
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbCurrent")}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
          </h1>
          <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
        </div>
        {data.myEmployeeId && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="btn btn--primary"
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
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t("newRequest")}
          </button>
        )}
      </div>

      {/* Balance card */}
      {data.myEmployeeId && (
        <section className="mb-5 rounded-lg border border-neutral-100 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[20px] font-bold text-secondary-500">
                {data.balance.total - data.balance.used} / {data.balance.total}
              </div>
              <div className="text-[12px] text-neutral-500">
                {t("balance", {
                  used: data.balance.used,
                  total: data.balance.total,
                  remaining: data.balance.total - data.balance.used,
                })}
              </div>
            </div>
            <div className="h-2 max-w-[260px] flex-1 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-primary-500"
                style={{
                  width: `${(data.balance.used / Math.max(1, data.balance.total)) * 100}%`,
                }}
              />
            </div>
          </div>
        </section>
      )}

      {/* Tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
              tab === k
                ? "border-primary-500 bg-tertiary-200 text-primary-700"
                : "border-neutral-200 bg-white text-neutral-700",
            )}
          >
            {tTabs(k)}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                tab === k
                  ? "bg-primary-500 text-white"
                  : "bg-neutral-100 text-neutral-600",
              )}
            >
              {k === "all"
                ? data.requests.length
                : data.requests.filter((r) => r.status === k).length}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <section className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <Th>{tTable("employee")}</Th>
                <Th>{tTable("period")}</Th>
                <Th align="right">{tTable("days")}</Th>
                <Th>{tTable("reason")}</Th>
                <Th>{tTable("status")}</Th>
                <Th align="right">{tTable("actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-[13px] text-neutral-500"
                  >
                    {tTable("empty")}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-neutral-100 last:border-b-0"
                >
                  <td className="px-5 py-3 align-middle text-[13px] font-semibold text-neutral-800">
                    {r.employee_name}
                  </td>
                  <td className="px-5 py-3 align-middle font-mono text-[12px] text-neutral-700">
                    {f.date(r.start_date)}
                    {" – "}
                    {f.date(r.end_date)}
                  </td>
                  <td className="px-5 py-3 text-right align-middle font-mono text-[13px] font-semibold text-secondary-500">
                    {r.days}
                  </td>
                  <td className="px-5 py-3 align-middle text-[12px] text-neutral-600">
                    {r.reason ?? "—"}
                  </td>
                  <td className="px-5 py-3 align-middle">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                        statusStyles[r.status],
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {tStatus(r.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3 align-middle">
                    <RowActions
                      request={r}
                      canApprove={data.canApprove}
                      isOwn={r.employee_id === data.myEmployeeId}
                      onApprove={() => review(r.id, true)}
                      onReject={() => review(r.id, false)}
                      onCancel={() => cancel(r.id)}
                      pending={pending}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {formOpen && data.myEmployeeId && (
        <RequestForm
          employeeId={data.myEmployeeId}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function RowActions({
  request,
  canApprove,
  isOwn,
  onApprove,
  onReject,
  onCancel,
  pending,
}: {
  request: VacationRequest;
  canApprove: boolean;
  isOwn: boolean;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const t = useTranslations("vacation");
  const showApproveReject = canApprove && request.status === "pending";
  const showCancel = isOwn && request.status === "pending";
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {showApproveReject && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={onApprove}
            className="rounded-md border border-success-500 bg-success-50 px-2.5 py-1 text-[11px] font-semibold text-success-700 transition hover:bg-success-50/80"
          >
            {t("approve")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onReject}
            className="rounded-md border border-error-500 bg-error-50 px-2.5 py-1 text-[11px] font-semibold text-error-700 transition hover:bg-error-50/80"
          >
            {t("reject")}
          </button>
        </>
      )}
      {showCancel && (
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-md border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {t("cancel")}
        </button>
      )}
    </div>
  );
}

function RequestForm({
  employeeId,
  onClose,
  onSaved,
}: {
  employeeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("vacation.form");
  const tPage = useTranslations("vacation");
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    start: "",
    end: "",
    reason: "",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      const r = await createVacationRequestAction({
        employee_id: employeeId,
        start_date: form.start,
        end_date: form.end,
        reason: form.reason,
      });
      if (!r.ok) {
        if (r.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(r.fieldErrors)) {
            if (Array.isArray(v) && v[0]) flat[k] = v[0];
          }
          setErrors(flat);
        }
        toast.error(r.error || t("saveError"));
        return;
      }
      toast.success(tPage("submitted"));
      onSaved();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div className="flex max-h-[92vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-xl border border-neutral-100 bg-white shadow-lg sm:rounded-xl">
        <header className="flex items-start justify-between border-b border-neutral-100 px-6 pb-4 pt-5">
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
            onClick={onClose}
            aria-label={tPage("cancel")}
            className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 hover:bg-neutral-50"
          >
            <span aria-hidden>✕</span>
          </button>
        </header>
        <form onSubmit={submit} className="overflow-y-auto" noValidate>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            <Field label={t("startDate")} required error={errors.start_date}>
              <input
                type="date"
                className="input"
                required
                value={form.start}
                onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
              />
            </Field>
            <Field label={t("endDate")} required error={errors.end_date}>
              <input
                type="date"
                className="input"
                required
                value={form.end}
                onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
              />
            </Field>
            <Field label={t("reason")} className="md:col-span-2">
              <textarea
                rows={3}
                className="input min-h-[80px]"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </Field>
          </div>
          <footer className="flex items-center justify-end gap-3 border-t border-neutral-100 bg-white px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn--ghost border border-neutral-200"
            >
              {tPage("cancel")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className={cn("btn btn--primary", pending && "opacity-80")}
            >
              {pending ? t("saving") : t("submit")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "border-b border-neutral-200 bg-neutral-50 px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
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

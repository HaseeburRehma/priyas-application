"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  deleteKeyAction,
  issueKeyAction,
  returnKeyAction,
} from "@/app/actions/property-keys";
import type { PropertyKeyRow } from "@/lib/api/property-keys";

type Employee = { id: string; full_name: string };

/**
 * Per-property key register (spec §4.2). Lists every key issued for the
 * property and lets project managers issue new ones or mark a key returned.
 * Returned keys stay in the table so the audit trail is preserved.
 */
export function PropertyKeysCard({
  propertyId,
  keys,
  employees,
  canEdit,
  canDelete,
}: {
  propertyId: string;
  keys: PropertyKeyRow[];
  employees: Employee[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("properties.keys");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showIssue, setShowIssue] = useState(false);

  const active = keys.filter((k) => k.is_active);
  const historical = keys.filter((k) => !k.is_active);

  function onReturned(id: string) {
    if (!confirm(t("returnConfirm"))) return;
    start(async () => {
      const r = await returnKeyAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("returnSuccess"));
      router.refresh();
    });
  }

  function onDeleted(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    start(async () => {
      const r = await deleteKeyAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("deleteSuccess"));
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-neutral-800">
            {t("title")}
          </h2>
          <p className="text-[12px] text-neutral-500">{t("subtitle")}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowIssue((v) => !v)}
            className="rounded-md border border-secondary-300 px-3 py-1 text-[12px] font-medium text-secondary-700 hover:bg-secondary-50"
          >
            {showIssue ? t("cancel") : t("issueNew")}
          </button>
        )}
      </header>

      {showIssue && canEdit && (
        <IssueKeyForm
          propertyId={propertyId}
          employees={employees}
          onIssued={() => {
            setShowIssue(false);
            router.refresh();
          }}
        />
      )}

      <div className="p-5">
        <Section title={t("active", { count: active.length })}>
          {active.length === 0 ? (
            <Empty text={t("emptyActive")} />
          ) : (
            <KeyTable
              rows={active}
              tone="active"
              canReturn={canEdit}
              canDelete={canDelete}
              pending={pending}
              onReturn={onReturned}
              onDelete={onDeleted}
            />
          )}
        </Section>

        {historical.length > 0 && (
          <div className="mt-5">
            <Section title={t("history", { count: historical.length })}>
              <KeyTable
                rows={historical}
                tone="returned"
                canReturn={false}
                canDelete={canDelete}
                pending={pending}
                onReturn={() => {}}
                onDelete={onDeleted}
              />
            </Section>
          </div>
        )}
      </div>
    </section>
  );
}

function IssueKeyForm({
  propertyId,
  employees,
  onIssued,
}: {
  propertyId: string;
  employees: Employee[];
  onIssued: () => void;
}) {
  const t = useTranslations("properties.keys");
  const [pending, start] = useTransition();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [keyLabel, setKeyLabel] = useState("");
  const [notes, setNotes] = useState("");

  function submit() {
    if (!employeeId) {
      toast.error(t("selectEmployee"));
      return;
    }
    if (!keyLabel.trim()) {
      toast.error(t("labelRequired"));
      return;
    }
    start(async () => {
      const r = await issueKeyAction({
        propertyId,
        employeeId,
        keyLabel: keyLabel.trim(),
        notes: notes.trim() || null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("issueSuccess"));
      setKeyLabel("");
      setNotes("");
      onIssued();
    });
  }

  return (
    <div className="grid gap-3 border-b border-neutral-100 bg-neutral-50 p-4 sm:grid-cols-[1.5fr_1.5fr_2fr_auto]">
      <label className="block text-[13px]">
        <span className="text-neutral-600">{t("employee")}</span>
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-secondary-300"
        >
          {employees.length === 0 ? (
            <option value="">—</option>
          ) : (
            employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
              </option>
            ))
          )}
        </select>
      </label>
      <label className="block text-[13px]">
        <span className="text-neutral-600">{t("keyLabel")}</span>
        <input
          value={keyLabel}
          onChange={(e) => setKeyLabel(e.target.value)}
          placeholder={t("keyLabelPlaceholder")}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-secondary-300"
        />
      </label>
      <label className="block text-[13px]">
        <span className="text-neutral-600">{t("notes")}</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-secondary-300"
        />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="self-end rounded-md bg-secondary-500 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-secondary-600 disabled:opacity-50"
      >
        {pending ? t("issuing") : t("submit")}
      </button>
    </div>
  );
}

function KeyTable({
  rows,
  tone,
  canReturn,
  canDelete,
  pending,
  onReturn,
  onDelete,
}: {
  rows: PropertyKeyRow[];
  tone: "active" | "returned";
  canReturn: boolean;
  canDelete: boolean;
  pending: boolean;
  onReturn: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("properties.keys");
  return (
    <div className={tone === "returned" ? "opacity-70" : ""}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <th className="py-2">{t("col.employee")}</th>
            <th className="py-2">{t("col.label")}</th>
            <th className="py-2">{t("col.issued")}</th>
            <th className="py-2">{t("col.returned")}</th>
            <th className="py-2">{t("col.notes")}</th>
            <th className="py-2 text-right">{t("col.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((k) => (
            <tr key={k.id} className="border-b border-neutral-50">
              <td className="py-2">{k.employee_name}</td>
              <td className="py-2 font-mono text-[12px]">{k.key_label}</td>
              <td className="py-2">{formatDE(k.issued_at)}</td>
              <td className="py-2">
                {k.returned_at ? (
                  formatDE(k.returned_at)
                ) : (
                  <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700">
                    {t("stillOut")}
                  </span>
                )}
              </td>
              <td className="py-2 text-neutral-500">{k.notes ?? "—"}</td>
              <td className="py-2 text-right space-x-2">
                {canReturn && k.is_active && (
                  <button
                    type="button"
                    onClick={() => onReturn(k.id)}
                    disabled={pending}
                    className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11px] hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {t("markReturned")}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(k.id)}
                    disabled={pending}
                    className="rounded-md border border-error-300 px-2 py-0.5 text-[11px] text-error-600 hover:bg-error-50 disabled:opacity-50"
                  >
                    {t("delete")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center text-[12px] text-neutral-500">
      {text}
    </div>
  );
}

function formatDE(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import {
  deleteClientContactAction,
  upsertClientContactAction,
} from "@/app/actions/client-contacts";
import type { ClientContact } from "@/lib/api/client-contacts";

type Props = {
  clientId: string;
  contacts: ClientContact[];
  canEdit: boolean;
};

type Draft = {
  id?: string;
  full_name: string;
  role: string;
  email: string;
  phone: string;
  is_primary: boolean;
  notes: string;
};

const blank = (): Draft => ({
  full_name: "",
  role: "",
  email: "",
  phone: "",
  is_primary: false,
  notes: "",
});

export function ContactsCard({ clientId, contacts, canEdit }: Props) {
  const t = useTranslations("clients.contacts");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editor, setEditor] = useState<Draft | null>(null);

  function openNew() {
    setEditor(blank());
  }

  function openEdit(c: ClientContact) {
    setEditor({
      id: c.id,
      full_name: c.full_name,
      role: c.role ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      is_primary: c.is_primary,
      notes: c.notes ?? "",
    });
  }

  function save() {
    if (!editor) return;
    if (editor.full_name.trim().length < 2) {
      toast.error(t("errorName"));
      return;
    }
    start(async () => {
      const r = await upsertClientContactAction({
        id: editor.id,
        client_id: clientId,
        full_name: editor.full_name.trim(),
        role: editor.role,
        email: editor.email,
        phone: editor.phone,
        is_primary: editor.is_primary,
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

  function remove(c: ClientContact) {
    if (!window.confirm(t("confirmDelete", { name: c.full_name }))) return;
    start(async () => {
      const r = await deleteClientContactAction(c.id, clientId);
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
          <button
            type="button"
            onClick={openNew}
            className="btn btn--primary"
          >
            {t("add")}
          </button>
        )}
      </header>

      <div className="p-5">
        {contacts.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-200 p-6 text-center text-[13px] text-neutral-500">
            {t("empty")}
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-neutral-800">
                      {c.full_name}
                    </span>
                    {c.is_primary && (
                      <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase text-primary-700">
                        {t("primary")}
                      </span>
                    )}
                    {c.role && (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700">
                        {c.role}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-neutral-500">
                    {c.email && <span>✉️ {c.email}</span>}
                    {c.phone && <span>📞 {c.phone}</span>}
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
            className="w-full max-w-[520px] rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="border-b border-neutral-100 p-5">
              <h4 className="text-[16px] font-semibold text-neutral-800">
                {editor.id ? t("editTitle") : t("addTitle")}
              </h4>
            </header>
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
              <Field label={t("fullName")} required className="md:col-span-2">
                <input
                  className="input"
                  value={editor.full_name}
                  onChange={(e) =>
                    setEditor((s) => s && { ...s, full_name: e.target.value })
                  }
                />
              </Field>
              <Field label={t("role")}>
                <input
                  className="input"
                  placeholder={t("rolePlaceholder")}
                  value={editor.role}
                  onChange={(e) =>
                    setEditor((s) => s && { ...s, role: e.target.value })
                  }
                />
              </Field>
              <Field label={t("phone")}>
                <input
                  className="input"
                  type="tel"
                  value={editor.phone}
                  onChange={(e) =>
                    setEditor((s) => s && { ...s, phone: e.target.value })
                  }
                />
              </Field>
              <Field label={t("email")} className="md:col-span-2">
                <input
                  className="input"
                  type="email"
                  value={editor.email}
                  onChange={(e) =>
                    setEditor((s) => s && { ...s, email: e.target.value })
                  }
                />
              </Field>
              <Field label={t("notes")} className="md:col-span-2">
                <textarea
                  rows={3}
                  className="input min-h-[72px]"
                  value={editor.notes}
                  onChange={(e) =>
                    setEditor((s) => s && { ...s, notes: e.target.value })
                  }
                />
              </Field>
              <label className="flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  checked={editor.is_primary}
                  onChange={(e) =>
                    setEditor(
                      (s) => s && { ...s, is_primary: e.target.checked },
                    )
                  }
                  className="h-4 w-4"
                />
                <span className="text-[13px] text-neutral-700">
                  {t("markPrimary")}
                </span>
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
                disabled={pending || editor.full_name.trim().length < 2}
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

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
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
    </label>
  );
}

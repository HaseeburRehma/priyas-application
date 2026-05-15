"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { updateClientAction } from "@/app/actions/clients";
import type { ClientDetail } from "@/lib/api/clients.types";

type Props = { detail: ClientDetail };

type FormState = {
  display_name: string;
  contact_name: string;
  email: string;
  phone: string;
  tax_id: string;
  notes: string;
  insurance_provider: string;
  insurance_number: string;
  care_level: string;
};

/**
 * Edit form for an existing client. Mirrors `CreateClientForm` and reuses
 * `updateClientSchema` (server-side via `updateClientAction`). Hydrates
 * fields from the loaded `ClientDetail`, then submits the same shape the
 * action expects.
 */
export function EditClientForm({ detail }: Props) {
  const t = useTranslations("clients.form");
  const tEdit = useTranslations("clients.edit");
  const tPick = useTranslations("clients.picker");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>({
    display_name: detail.display_name ?? "",
    contact_name: detail.contact_name ?? "",
    email: detail.email ?? "",
    phone: detail.phone ?? "",
    tax_id: detail.tax_id ?? "",
    notes: detail.notes ?? "",
    insurance_provider: detail.insurance_provider ?? "",
    insurance_number: detail.insurance_number ?? "",
    care_level: detail.care_level ? String(detail.care_level) : "1",
  });

  function field<K extends keyof FormState>(key: K) {
    return {
      value: form[key],
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => setForm((f) => ({ ...f, [key]: e.target.value })),
      "aria-invalid": Boolean(errors[key]),
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      const payload =
        detail.customer_type === "alltagshilfe"
          ? {
              id: detail.id,
              customer_type: "alltagshilfe" as const,
              display_name: form.display_name,
              contact_name: form.contact_name,
              email: form.email,
              phone: form.phone,
              tax_id: form.tax_id,
              notes: form.notes,
              insurance_provider: form.insurance_provider,
              insurance_number: form.insurance_number,
              care_level: Number(form.care_level),
            }
          : {
              id: detail.id,
              customer_type: detail.customer_type,
              display_name: form.display_name,
              contact_name: form.contact_name,
              email: form.email,
              phone: form.phone,
              tax_id: form.tax_id,
              notes: form.notes,
            };
      const result = await updateClientAction(payload);
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
      toast.success(tEdit("saveSuccess"));
      router.replace(routes.client(detail.id));
      router.refresh();
    });
  }

  const isAlltags = detail.customer_type === "alltagshilfe";

  return (
    <form onSubmit={submit} className="grid place-items-center py-4" noValidate>
      <div className="w-full max-w-[680px] rounded-xl border border-neutral-100 bg-white p-7 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-primary-700">
            {tEdit("subtitle")}
          </span>
          <Link
            href={routes.client(detail.id)}
            className="text-[12px] text-neutral-500 hover:text-neutral-800"
          >
            ← {tEdit("back")}
          </Link>
        </div>

        <h1 className="mb-5 text-[22px] font-bold text-secondary-500">
          {tEdit("title")} ·{" "}
          <span className={isAlltags ? "text-error-700" : "text-primary-700"}>
            {isAlltags ? tPick("alltagsTitle") : tPick("priyaTitle")}
          </span>
        </h1>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t("displayName")} required error={errors.display_name}>
            <input className="input" required {...field("display_name")} />
          </Field>
          <Field label={t("contactName")} error={errors.contact_name}>
            <input className="input" {...field("contact_name")} />
          </Field>
          <Field label={t("email")} error={errors.email}>
            <input type="email" className="input" {...field("email")} />
          </Field>
          <Field label={t("phone")} error={errors.phone}>
            <input className="input" {...field("phone")} />
          </Field>
          {!isAlltags && (
            <Field label={t("taxId")} error={errors.tax_id}>
              <input className="input" {...field("tax_id")} />
            </Field>
          )}
          {isAlltags && (
            <>
              <Field
                label={t("insuranceProvider")}
                required
                error={errors.insurance_provider}
              >
                <input className="input" required {...field("insurance_provider")} />
              </Field>
              <Field
                label={t("insuranceNumber")}
                required
                error={errors.insurance_number}
              >
                <input className="input" required {...field("insurance_number")} />
              </Field>
              <Field label={t("careLevel")} required error={errors.care_level}>
                <select className="input" required {...field("care_level")}>
                  {[1, 2, 3, 4, 5].map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>

        <Field label={t("notes")} className="mt-4" error={errors.notes}>
          <textarea
            rows={3}
            className="input min-h-[88px]"
            {...field("notes")}
          />
        </Field>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Link
            href={routes.client(detail.id)}
            className="btn btn--ghost border border-neutral-200"
          >
            {tEdit("cancel")}
          </Link>
          <button
            type="submit"
            disabled={pending}
            className={cn(
              "btn",
              isAlltags ? "btn--danger" : "btn--primary",
              pending && "opacity-80",
            )}
          >
            {pending ? "…" : tEdit("save")}
          </button>
        </div>
      </div>
    </form>
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

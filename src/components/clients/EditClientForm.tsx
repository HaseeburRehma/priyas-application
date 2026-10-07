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
import { contractEndDate } from "@/lib/billing/contract";

type Props = { detail: ClientDetail };

type FormState = {
  display_name: string;
  // Feature-update #1
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  tax_id: string;
  address_line1: string;
  postal_code: string;
  city: string;
  country: string;
  notes: string;
  insurance_provider: string;
  insurance_number: string;
  care_level: string;
  // Kept as plain string (like care_level) so it works with the generic
  // `field()` helper below; cast to the real union at submit time.
  export_target: string;
  // Feature-update #4 + #12 — booleans/arrays kept out of `field()`
  // because the helper is typed for text inputs; edited via setForm().
  key_object: boolean;
  recommended_weekdays: number[];
  // Billing (Priya clients only). Money/number inputs kept as strings.
  billing_mode: string;
  hourly_rate_eur: string;
  fixed_monthly_fee_eur: string;
  contracted_hours_per_month: string;
  contract_months: string;
  contract_start: string;
};

const centsToEur = (c: number | null) => (c != null ? (c / 100).toFixed(2) : "");

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
    // Feature-update #1/#4/#12: read from the loader — fall back to
    // safe defaults if the loader hasn't been extended yet (defensive
    // against a stale server bundle).
    company_name: (detail as { company_name?: string | null }).company_name ?? "",
    contact_name: detail.contact_name ?? "",
    email: detail.email ?? "",
    phone: detail.phone ?? "",
    tax_id: detail.tax_id ?? "",
    address_line1: detail.address_line1 ?? "",
    postal_code: detail.postal_code ?? "",
    city: detail.city ?? "",
    country: detail.country ?? "",
    notes: detail.notes ?? "",
    insurance_provider: detail.insurance_provider ?? "",
    insurance_number: detail.insurance_number ?? "",
    care_level: detail.care_level ? String(detail.care_level) : "1",
    export_target: detail.export_target,
    key_object: (detail as { key_object?: boolean | null }).key_object ?? false,
    recommended_weekdays:
      (detail as { recommended_weekdays?: number[] | null }).recommended_weekdays ?? [],
    billing_mode: detail.billing.mode,
    hourly_rate_eur: centsToEur(detail.billing.hourly_rate_cents),
    fixed_monthly_fee_eur: centsToEur(detail.billing.fixed_monthly_fee_cents),
    contracted_hours_per_month:
      detail.billing.contracted_hours_per_month != null
        ? String(detail.billing.contracted_hours_per_month)
        : "",
    contract_months:
      detail.billing.contract_months != null ? String(detail.billing.contract_months) : "12",
    contract_start: detail.billing.contract_start ?? "",
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

  function billingPayload() {
    const contractStart = form.contract_start || undefined;
    if (form.billing_mode === "fixed") {
      return {
        billing_mode: "fixed" as const,
        fixed_monthly_fee_cents: Math.round(Number(form.fixed_monthly_fee_eur || "0") * 100),
        contracted_hours_per_month: Number(form.contracted_hours_per_month || "0"),
        contract_months: Number(form.contract_months || "0"),
        contract_start: contractStart,
      };
    }
    return {
      billing_mode: "hourly" as const,
      agreed_hourly_rate_cents: form.hourly_rate_eur
        ? Math.round(Number(form.hourly_rate_eur) * 100)
        : undefined,
      contract_start: contractStart,
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      // Feature-update #1/#4/#12: pass the new fields through on every
      // variant so an edit that doesn't touch them still preserves the
      // stored value (validator has defaults that would otherwise wipe
      // key_object → false and recommended_weekdays → []).
      const shared = {
        display_name: form.display_name,
        company_name: form.company_name,
        contact_name: form.contact_name,
        email: form.email,
        phone: form.phone,
        tax_id: form.tax_id,
        address_line1: form.address_line1,
        postal_code: form.postal_code,
        city: form.city,
        country: form.country,
        notes: form.notes,
        key_object: form.key_object,
        recommended_weekdays: form.recommended_weekdays,
      };
      const payload =
        detail.customer_type === "alltagshilfe"
          ? {
              id: detail.id,
              customer_type: "alltagshilfe" as const,
              ...shared,
              insurance_provider: form.insurance_provider,
              insurance_number: form.insurance_number,
              care_level: Number(form.care_level),
            }
          : {
              id: detail.id,
              customer_type: detail.customer_type,
              ...shared,
              export_target: form.export_target as "internal" | "lexware",
              ...billingPayload(),
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
  const isFixed = !isAlltags && form.billing_mode === "fixed";
  const monthsNum = Number(form.contract_months);
  const contractEnd =
    isFixed && form.contract_start && Number.isInteger(monthsNum) && monthsNum >= 1 && monthsNum <= 120
      ? contractEndDate(form.contract_start, monthsNum)
      : null;

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
          <Field
            label={t("fields.address")}
            error={errors.address_line1}
            className="md:col-span-2"
          >
            <input
              className="input"
              placeholder={t("fields.addressPlaceholder")}
              {...field("address_line1")}
            />
          </Field>
          <Field label={t("fields.plz")} error={errors.postal_code}>
            <input className="input" {...field("postal_code")} />
          </Field>
          <Field label={t("fields.city")} error={errors.city}>
            <input className="input" {...field("city")} />
          </Field>
          <Field label={t("fields.country")} error={errors.country}>
            <input className="input" {...field("country")} />
          </Field>
          {!isAlltags && (
            <Field label={t("exportTarget")} error={errors.export_target}>
              <select className="input" {...field("export_target")}>
                <option value="internal">{t("exportTargetInternal")}</option>
                <option value="lexware">{t("exportTargetLexware")}</option>
              </select>
            </Field>
          )}
          {!isAlltags && (
            <>
              <Field label={t("fields.billingMode")} required error={errors.billing_mode}>
                <select className="input" {...field("billing_mode")}>
                  <option value="hourly">{t("fields.billingHourly")}</option>
                  <option value="fixed">{t("fields.billingFixed")}</option>
                </select>
              </Field>
              <Field
                label={t("fields.contractStart")}
                required={isFixed}
                error={errors.contract_start}
              >
                <input type="date" className="input" {...field("contract_start")} />
              </Field>
              {isFixed ? (
                <>
                  <Field
                    label={t("fields.fixedFee")}
                    required
                    error={errors.fixed_monthly_fee_cents}
                  >
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="input"
                      {...field("fixed_monthly_fee_eur")}
                    />
                  </Field>
                  <Field
                    label={t("fields.contractedHours")}
                    required
                    error={errors.contracted_hours_per_month}
                  >
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      className="input"
                      {...field("contracted_hours_per_month")}
                    />
                  </Field>
                  <Field
                    label={t("fields.contractMonths")}
                    required
                    error={errors.contract_months}
                  >
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="120"
                      className="input"
                      {...field("contract_months")}
                    />
                    {contractEnd && (
                      <span className="text-[11px] text-neutral-500">
                        {t("fields.contractEndsOn", {
                          date: contractEnd.split("-").reverse().join("."),
                        })}
                      </span>
                    )}
                  </Field>
                </>
              ) : (
                <Field label={t("fields.agreedRate")} error={errors.agreed_hourly_rate_cents}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    {...field("hourly_rate_eur")}
                  />
                </Field>
              )}
            </>
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

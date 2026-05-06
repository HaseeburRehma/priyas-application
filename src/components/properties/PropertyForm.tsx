"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import {
  createPropertyAction,
  updatePropertyAction,
} from "@/app/actions/properties";

type ClientOption = { id: string; display_name: string };

type Props = {
  mode: "create" | "edit";
  clients: ClientOption[];
  initial?: {
    id: string;
    client_id: string;
    name: string;
    address_line1: string;
    address_line2: string | null;
    postal_code: string;
    city: string;
    country: string;
    size_sqm: number | null;
    notes: string | null;
    floor: string | null;
    building_section: string | null;
    access_code: string | null;
    allergies: string | null;
    restricted_areas: string | null;
    safety_regulations: string | null;
  };
};

export function PropertyForm({ mode, clients, initial }: Props) {
  const t = useTranslations("properties.form");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    client_id: initial?.client_id ?? clients[0]?.id ?? "",
    name: initial?.name ?? "",
    address_line1: initial?.address_line1 ?? "",
    address_line2: initial?.address_line2 ?? "",
    postal_code: initial?.postal_code ?? "",
    city: initial?.city ?? "",
    country: initial?.country ?? "DE",
    size_sqm: initial?.size_sqm != null ? String(initial.size_sqm) : "",
    notes: initial?.notes ?? "",
    floor: initial?.floor ?? "",
    building_section: initial?.building_section ?? "",
    access_code: initial?.access_code ?? "",
    allergies: initial?.allergies ?? "",
    restricted_areas: initial?.restricted_areas ?? "",
    safety_regulations: initial?.safety_regulations ?? "",
  });

  function field<K extends keyof typeof form>(key: K) {
    return {
      value: form[key],
      onChange: (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => setForm((f) => ({ ...f, [key]: e.target.value })),
      "aria-invalid": Boolean(errors[key]),
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    start(async () => {
      const payload = {
        ...(mode === "edit" && initial ? { id: initial.id } : {}),
        client_id: form.client_id,
        name: form.name,
        address_line1: form.address_line1,
        address_line2: form.address_line2,
        postal_code: form.postal_code,
        city: form.city,
        country: form.country || "DE",
        size_sqm: form.size_sqm === "" ? "" : Number(form.size_sqm),
        notes: form.notes,
        floor: form.floor,
        building_section: form.building_section,
        access_code: form.access_code,
        allergies: form.allergies,
        restricted_areas: form.restricted_areas,
        safety_regulations: form.safety_regulations,
      };
      const action =
        mode === "edit" ? updatePropertyAction : createPropertyAction;
      const result = await action(payload);
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
      router.replace(routes.property(result.data.id));
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid place-items-center py-4" noValidate>
      <div className="w-full max-w-[820px] rounded-xl border border-neutral-100 bg-white p-7 shadow-sm">
        <Link
          href={routes.properties}
          className="mb-3 inline-flex items-center gap-1 text-[12px] text-neutral-500 hover:text-neutral-800"
        >
          ← {t("back")}
        </Link>
        <h1 className="mb-1 text-[22px] font-bold text-secondary-500">
          {mode === "create" ? t("createTitle") : t("editTitle")}
        </h1>
        <p className="mb-5 text-[13px] text-neutral-500">
          {mode === "create" ? t("createSubtitle") : ""}
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t("client")} required error={errors.client_id} className="md:col-span-2">
            <select className="input" required {...field("client_id")}>
              <option value="" disabled>
                {t("clientPlaceholder")}
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("name")} required error={errors.name} className="md:col-span-2">
            <input
              className="input"
              required
              placeholder={t("namePlaceholder")}
              {...field("name")}
            />
          </Field>
          <Field label={t("addressLine1")} required error={errors.address_line1} className="md:col-span-2">
            <input className="input" required {...field("address_line1")} />
          </Field>
          <Field label={t("addressLine2")} error={errors.address_line2} className="md:col-span-2">
            <input className="input" {...field("address_line2")} />
          </Field>
          <Field label={t("postalCode")} required error={errors.postal_code}>
            <input className="input" required {...field("postal_code")} />
          </Field>
          <Field label={t("city")} required error={errors.city}>
            <input className="input" required {...field("city")} />
          </Field>
          <Field label={t("country")} error={errors.country}>
            <input className="input" maxLength={2} {...field("country")} />
          </Field>
          <Field label={t("size")} error={errors.size_sqm}>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              {...field("size_sqm")}
            />
          </Field>
          <Field label={t("floor")} error={errors.floor}>
            <input className="input" {...field("floor")} />
          </Field>
          <Field label={t("buildingSection")} error={errors.building_section}>
            <input className="input" {...field("building_section")} />
          </Field>
          <Field label={t("accessCode")} error={errors.access_code} className="md:col-span-2">
            <input
              className="input"
              type="text"
              autoComplete="off"
              placeholder={t("accessCodePlaceholder")}
              {...field("access_code")}
            />
          </Field>
        </div>

        <div className="mt-5 rounded-md border border-neutral-100 bg-neutral-50 p-4">
          <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-neutral-700">
            {t("safetySection")}
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t("allergies")} error={errors.allergies}>
              <textarea
                rows={2}
                className="input min-h-[64px]"
                placeholder={t("allergiesPlaceholder")}
                {...field("allergies")}
              />
            </Field>
            <Field label={t("restrictedAreas")} error={errors.restricted_areas}>
              <textarea
                rows={2}
                className="input min-h-[64px]"
                placeholder={t("restrictedAreasPlaceholder")}
                {...field("restricted_areas")}
              />
            </Field>
            <Field
              label={t("safetyRegulations")}
              error={errors.safety_regulations}
              className="md:col-span-2"
            >
              <textarea
                rows={3}
                className="input min-h-[80px]"
                placeholder={t("safetyRegulationsPlaceholder")}
                {...field("safety_regulations")}
              />
            </Field>
          </div>
        </div>

        <Field label={t("notes")} className="mt-4" error={errors.notes}>
          <textarea rows={3} className="input min-h-[96px]" {...field("notes")} />
        </Field>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Link
            href={routes.properties}
            className="btn btn--ghost border border-neutral-200"
          >
            {t("cancel")}
          </Link>
          <button
            type="submit"
            disabled={pending}
            className={cn("btn btn--primary", pending && "opacity-80")}
          >
            {pending ? "…" : mode === "create" ? t("save") : t("saveUpdate")}
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

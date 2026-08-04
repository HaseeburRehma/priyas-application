"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { createClientAction } from "@/app/actions/clients";
import type { ClientCustomerType } from "@/lib/api/clients.types";

type Props = { type: ClientCustomerType };

const RHYTHM_OPTIONS: Array<{ value: "weekly" | "biweekly" | "monthly" | "on_demand"; label: string }> = [
  { value: "weekly",    label: "Wöchentlich" },
  { value: "biweekly",  label: "14-tägig" },
  { value: "monthly",   label: "Monatlich" },
  { value: "on_demand", label: "Auf Abruf" },
];

/**
 * Onboarding intake for one new client. The field list mirrors the
 * exact spec the operations team supplied on 18 May:
 *
 *   • Priya regular  → Vorname, Name, Adresse, Rechnungsadresse,
 *                       E-Mail, Telefon, Rhythmus, geschätzte Stunden,
 *                       vereinbarter Stundensatz, Vertragsbeginn,
 *                       Sonstiges.
 *   • Alltagshilfe   → Vorname, Name, Adresse, E-Mail, Geburtsdatum,
 *                       Krankenkasse, Versicherten-Nr, Pflegegrad,
 *                       Abtretungserklärung (Ja/Nein), Rhythmus,
 *                       geschätzte Stunden, Vertrag unterschrieben?
 *                       (Ja/Nein), Sonstiges.
 *
 * Validation lives in `src/lib/validators/clients.ts`. `display_name`
 * stays in the model (everything else references it) but is auto-derived
 * client-side from `first_name + last_name` so the operator never has to
 * fill it twice.
 */
export function CreateClientForm({ type }: Props) {
  const t = useTranslations("clients.form");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isAlltags = type === "alltagshilfe";

  // Default cleaning rhythm in line with each service line's most common
  // contract: weekly for Priya, biweekly for Alltagshilfe.
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    contact_name: "",
    email: "",
    phone: "",
    tax_id: "",

    address_line1: "",
    address_line2: "",
    postal_code: "",
    city: "",

    billing_different: false,
    billing_address_line1: "",
    billing_address_line2: "",
    billing_postal_code: "",
    billing_city: "",

    cleaning_rhythm: isAlltags ? "biweekly" : ("weekly" as
      | "weekly"
      | "biweekly"
      | "monthly"
      | "on_demand"),
    estimated_hours_per_visit: "2.0",
    agreed_hourly_rate_eur: isAlltags ? "" : "35.00",
    contract_start: new Date().toISOString().slice(0, 10),

    date_of_birth: "",
    insurance_provider: "",
    insurance_number: "",
    care_level: "1",
    abtretungserklaerung: false,
    contract_docs_signed: false,

    // Alltagshelfer intake wizard fields (Priya spec, 4 Aug 2026).
    // All UI-optional; only sent when populated.
    salutation: "" as "" | "herr" | "frau",
    customer_number: "",
    payer_type: (isAlltags ? "care_fund" : "") as
      | ""
      | "care_fund"
      | "private_pay"
      | "insurance"
      | "commercial",
    legal_rep_name: "",
    legal_rep_phone: "",
    desired_services: [] as string[],
    billing_type: (isAlltags ? "paragraph_45b" : "") as
      | ""
      | "paragraph_45b"
      | "paragraph_39"
      | "both",
    preferred_hours_per_week: "",
    preferred_days: [] as Array<
      "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
    >,
    preferred_times: "",
    conversation_notes: "",

    notes: "",
  });

  function toggleArrayItem<T extends string>(key: keyof typeof form, item: T) {
    setForm((f) => {
      const arr = (f[key] as unknown as T[]) ?? [];
      const next = arr.includes(item)
        ? arr.filter((x) => x !== item)
        : [...arr, item];
      return { ...f, [key]: next };
    });
  }

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function input<K extends keyof typeof form>(key: K) {
    return {
      value: form[key] as string,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => setField(key, e.target.value as (typeof form)[K]),
      "aria-invalid": Boolean(errors[key]),
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    // Derive display_name from the split fields. Trim defensively because
    // the validator treats "" as "missing" not "default".
    const displayName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();

    const sharedBase = {
      display_name: displayName,
      first_name: form.first_name,
      last_name: form.last_name,
      contact_name: form.contact_name,
      email: form.email,
      phone: form.phone,
      tax_id: form.tax_id,
      address_line1: form.address_line1,
      address_line2: form.address_line2,
      postal_code: form.postal_code,
      city: form.city,
      country: "DE",
      notes: form.notes,
    };

    start(async () => {
      const payload = isAlltags
        ? {
            ...sharedBase,
            customer_type: "alltagshilfe" as const,
            date_of_birth: form.date_of_birth,
            insurance_provider: form.insurance_provider,
            insurance_number: form.insurance_number,
            care_level: Number(form.care_level),
            abtretungserklaerung: form.abtretungserklaerung,
            cleaning_rhythm: form.cleaning_rhythm,
            estimated_hours_per_visit: Number(form.estimated_hours_per_visit),
            contract_docs_signed: form.contract_docs_signed,
            // --- New intake fields (only sent when set) ------------------
            salutation: form.salutation || undefined,
            customer_number: form.customer_number || undefined,
            payer_type: form.payer_type || undefined,
            legal_rep_name: form.legal_rep_name || undefined,
            legal_rep_phone: form.legal_rep_phone || undefined,
            desired_services:
              form.desired_services.length > 0 ? form.desired_services : undefined,
            billing_type: form.billing_type || undefined,
            preferred_hours_per_week: form.preferred_hours_per_week
              ? Number(form.preferred_hours_per_week)
              : undefined,
            preferred_days:
              form.preferred_days.length > 0 ? form.preferred_days : undefined,
            preferred_times: form.preferred_times || undefined,
            conversation_notes: form.conversation_notes || undefined,
          }
        : {
            ...sharedBase,
            customer_type: type,
            // Optional billing-address fields go through as empty strings
            // when "billing differs" is unticked — the validator accepts
            // those as "use service address".
            billing_address_line1: form.billing_different
              ? form.billing_address_line1
              : "",
            billing_address_line2: form.billing_different
              ? form.billing_address_line2
              : "",
            billing_postal_code: form.billing_different
              ? form.billing_postal_code
              : "",
            billing_city: form.billing_different ? form.billing_city : "",
            billing_country: form.billing_different ? "DE" : "",
            cleaning_rhythm: form.cleaning_rhythm,
            estimated_hours_per_visit: Number(form.estimated_hours_per_visit),
            agreed_hourly_rate_cents: Math.round(
              Number(form.agreed_hourly_rate_eur || "0") * 100,
            ),
            contract_start: form.contract_start,
          };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await createClientAction(payload as any);
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
      router.replace(routes.client(result.data.id));
      router.refresh();
    });
  }

  // Branding helpers — switching `isAlltags` flips the page from green
  // (Priya regular) to red (Day-care) per the design spec without
  // duplicating any layout. Both flows share the same wizard skeleton.
  const accentRing = isAlltags ? "ring-error-100" : "ring-primary-100";
  const accentBg   = isAlltags ? "bg-error-50"    : "bg-primary-50";
  const accentText = isAlltags ? "text-error-700" : "text-primary-700";
  const accentBtn  = isAlltags ? "bg-error-500 hover:bg-error-600" : "bg-primary-500 hover:bg-primary-600";
  const heading    = isAlltags ? t("banner.headingAlltagshilfe") : t("banner.headingPriya");
  const subhead    = isAlltags ? t("banner.subheadAlltagshilfe") : t("banner.subheadPriya");

  return (
    <form
      onSubmit={submit}
      className="mx-auto w-full max-w-[1180px] px-4 py-4 sm:px-6"
      noValidate
    >
      {/* Page header — title + branded chip + Save draft */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <nav className="text-[12px] text-neutral-500">
            <Link href={routes.dashboard} className="hover:text-neutral-700">
              Übersicht
            </Link>
            {" / "}
            <Link href={routes.clients} className="hover:text-neutral-700">
              Kunden
            </Link>
            {" / "}
            <Link href={routes.clientNew} className="hover:text-neutral-700">
              Kunden anlegen
            </Link>
            {" / "}
            <span className="text-neutral-700">
              {isAlltags ? "Pflege-Stammdaten" : "Priya-Stammdaten"}
            </span>
          </nav>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-[24px] font-bold tracking-tightest text-secondary-500">
            {heading}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em]",
                accentBg,
                accentText,
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isAlltags ? "bg-error-500" : "bg-primary-500",
                )}
              />
              {isAlltags ? t("summary.alltagshilfeShort") : t("summary.priyasShort")}
            </span>
          </h1>
          <p className="mt-1 text-[13px] text-neutral-500">{subhead}</p>
        </div>
        <button
          type="button"
          className="btn btn--ghost border border-neutral-200 bg-white text-[12px]"
          title={t("actions.saveDraftTitle")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          {t("actions.saveDraft")}
        </button>
      </header>

      {/* Stepper -------------------------------------------------------- */}
      <ol
        className={cn(
          "mb-5 grid grid-cols-3 gap-2 rounded-lg border bg-white p-3 shadow-xs ring-1",
          accentRing,
          isAlltags ? "border-error-100" : "border-primary-100",
        )}
      >
        <StepperItem
          n={1}
          state="done"
          label={`${t("stepper.step")} 1`}
          sub={t("stepper.serviceType")}
          isAlltags={isAlltags}
        />
        <StepperItem
          n={2}
          state="active"
          label={`${t("stepper.step")} 2`}
          sub={isAlltags ? t("stepper.masterDataAlltagshilfe") : t("stepper.masterData")}
          isAlltags={isAlltags}
        />
        <StepperItem
          n={3}
          state="future"
          label={`${t("stepper.step")} 3`}
          sub={t("stepper.confirmation")}
          isAlltags={isAlltags}
        />
      </ol>

      {/* Service-context banner ---------------------------------------- */}
      <section
        className={cn(
          "mb-5 flex flex-wrap items-start justify-between gap-3 rounded-lg border-l-4 p-4",
          isAlltags
            ? "border-error-500 bg-error-50/40"
            : "border-primary-500 bg-primary-50/40",
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "grid h-10 w-10 flex-shrink-0 place-items-center rounded-md",
              isAlltags ? "bg-error-100 text-error-700" : "bg-primary-100 text-primary-700",
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              {isAlltags ? (
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              ) : (
                <>
                  <path d="M12 2l1.7 4.3L18 7l-3 3.3L15.7 15 12 12.8 8.3 15 9 10.3 6 7l4.3-.7L12 2z" />
                  <path d="M20 20l-2-1m-2-2l-2-1" />
                </>
              )}
            </svg>
          </div>
          <div>
            <div className={cn("text-[11px] font-bold uppercase tracking-[0.05em]", accentText)}>
              <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle", isAlltags ? "bg-error-500" : "bg-primary-500")} />
              {isAlltags ? t("banner.alltagsTag") : t("banner.priyaTag")}
            </div>
            <div className="mt-0.5 text-[15px] font-semibold text-neutral-800">
              {isAlltags ? t("banner.alltagsTitle") : t("banner.priyaTitle")}
            </div>
            <p className="mt-1 max-w-prose text-[12px] text-neutral-600">
              {isAlltags
                ? `${t("banner.alltagsSub")}`
                : `${t("banner.priyaSub")}`}
            </p>
          </div>
        </div>
        <Link
          href={routes.clientNew}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Servicetyp ändern
        </Link>
      </section>

      {/* Two-column body: form + summary side panel ------------------- */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          {/* --- Section 1: Person -------------------------------------- */}
          <section className="rounded-lg border border-neutral-100 bg-white p-5 shadow-xs">
            <header className="mb-4 flex items-start gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-neutral-50 text-neutral-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx={12} cy={7} r={4} />
                </svg>
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-neutral-800">
                  Kontaktdaten
                </h2>
                <p className="text-[12px] text-neutral-500">
                  {isAlltags ? t("sectionTitles.contactSubAlltagshilfe") : t("sectionTitles.contactSub")}
                </p>
              </div>
            </header>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {isAlltags && (
                <>
                  <Field label={t("fields.salutation")} className="md:col-span-2">
                    <div className="flex gap-2">
                      {(["herr", "frau"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setField("salutation", s)}
                          className={cn(
                            "flex-1 rounded-md border px-3 py-2 text-[13px] font-medium transition",
                            form.salutation === s
                              ? "border-error-500 bg-error-50 text-error-700 ring-1 ring-error-200"
                              : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                          )}
                        >
                          {t(`fields.salutation_${s}` as never)}
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              )}
              <Field label={t("fields.vorname")} required error={errors.first_name}>
                <input className="input" required {...input("first_name")} />
              </Field>
              <Field label={t("fields.name")} required error={errors.last_name}>
                <input className="input" required {...input("last_name")} />
              </Field>
              {isAlltags && (
                <Field
                  label={t("fields.customerNumber")}
                  hint={t("fields.customerNumberHint")}
                  error={errors.customer_number}
                >
                  <input
                    className="input font-mono"
                    placeholder="z. B. K-2026-001"
                    {...input("customer_number")}
                  />
                </Field>
              )}
              <Field
                label={t("fields.address")}
                required
                error={errors.address_line1}
                className="md:col-span-2"
              >
                <input
                  className="input"
                  required
                  placeholder={t("fields.addressPlaceholder")}
                  {...input("address_line1")}
                />
              </Field>
              <Field label={t("fields.plz")} required error={errors.postal_code}>
                <input
                  className="input"
                  required
                  placeholder="z. B. 10117"
                  {...input("postal_code")}
                />
              </Field>
              <Field label={t("fields.city")} required error={errors.city}>
                <input
                  className="input"
                  required
                  placeholder="z. B. Berlin"
                  {...input("city")}
                />
              </Field>
              {!isAlltags && (
                <Field
                  label={t("fields.billingAddress")}
                  hint={t("fields.billingAddressHint")}
                  error={errors.billing_address_line1}
                  className="md:col-span-2"
                >
                  <input
                    className="input"
                    placeholder={t("fields.billingAddressPlaceholder")}
                    {...input("billing_address_line1")}
                    onFocus={() => setField("billing_different", true)}
                  />
                </Field>
              )}
              <Field label={t("email")} error={errors.email}>
                <input type="email" className="input" {...input("email")} />
              </Field>
              {!isAlltags ? (
                <Field label={t("phone")} hint={t("fields.phoneHint")} error={errors.phone}>
                  <div className="flex items-stretch">
                    <span className="inline-flex items-center rounded-l-sm border border-r-0 border-neutral-200 bg-neutral-50 px-2 text-[12px] text-neutral-600">
                      🇩🇪 +49
                    </span>
                    <input
                      className="input rounded-l-none"
                      placeholder="30 4419 8201"
                      {...input("phone")}
                    />
                  </div>
                </Field>
              ) : (
                <Field label={t("fields.dateOfBirth")} required error={errors.date_of_birth}>
                  <input type="date" className="input" required {...input("date_of_birth")} />
                </Field>
              )}
            </div>
          </section>

          {/* --- Section 2: Care & Insurance (Alltagshilfe only) ------ */}
          {isAlltags && (
            <section className="rounded-lg border border-neutral-100 bg-white p-5 shadow-xs">
              <header className="mb-4 flex items-start gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-md bg-error-50 text-error-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-neutral-800">{t("section.careInsurance")}</h2>
                  <p className="text-[12px] text-neutral-500">{t("section.careInsuranceSub")}</p>
                </div>
              </header>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={t("fields.insuranceProvider")} required error={errors.insurance_provider}>
                  <select className="input" required {...input("insurance_provider")}>
                    <option value="">— bitte wählen —</option>
                    {[
                      "AOK Nordost",
                      "Barmer",
                      "Techniker Krankenkasse",
                      "DAK-Gesundheit",
                      "IKK classic",
                      "BKK Mobil Oil",
                      "Knappschaft",
                      "Andere",
                    ].map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={t("fields.insuranceNumber")}
                  required
                  hint={t("fields.insuranceNumberHint")}
                  error={errors.insurance_number}
                >
                  <input
                    className="input font-mono"
                    placeholder={t("fields.insuranceNumberPlaceholder")}
                    required
                    {...input("insurance_number")}
                  />
                </Field>
              </div>

              {/* Pflegegrad: 5-button selector matching the design spec */}
              <div className="mt-5">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-neutral-700">
                    Pflegegrad <span className="text-error-500">*</span>
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    Aktueller Bescheid der Pflegekasse
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    { v: "1", label: t("fields.pflegegradLevels.1") },
                    { v: "2", label: t("fields.pflegegradLevels.2") },
                    { v: "3", label: t("fields.pflegegradLevels.3") },
                    { v: "4", label: t("fields.pflegegradLevels.4") },
                    { v: "5", label: t("fields.pflegegradLevels.5") },
                  ].map((opt) => {
                    const active = form.care_level === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setField("care_level", opt.v)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-md border px-3 py-3 text-center transition",
                          active
                            ? "border-error-500 bg-error-50 text-error-700 ring-1 ring-error-200"
                            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                        )}
                      >
                        <span className="text-[20px] font-bold leading-none">{opt.v}</span>
                        <span className="text-[10px] font-medium uppercase tracking-[0.04em]">
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {errors.care_level && (
                  <p className="mt-1.5 text-[12px] text-error-700">{errors.care_level}</p>
                )}
              </div>

              {/* Abtretungserklärung */}
              <div className="mt-5">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-neutral-700">
                    Abtretungserklärung liegt vor <span className="text-error-500">*</span>
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    Pflicht für die Direkt-Abrechnung mit der Krankenkasse
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <YesNoTile
                    selected={form.abtretungserklaerung === true}
                    onClick={() => setField("abtretungserklaerung", true)}
                    title={t("fields.abtretungserklaerungYesTitle")}
                    sub={t("fields.abtretungserklaerungYesSub")}
                    tone="ok"
                  />
                  <YesNoTile
                    selected={form.abtretungserklaerung === false}
                    onClick={() => setField("abtretungserklaerung", false)}
                    title={t("fields.abtretungserklaerungNoTitle")}
                    sub={t("fields.abtretungserklaerungNoSub")}
                    tone="neutral"
                  />
                </div>
                {!form.abtretungserklaerung && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-warning-300 bg-warning-50/60 p-3 text-[12px] text-warning-800">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 flex-shrink-0">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      <line x1={12} y1={9} x2={12} y2={13} />
                      <line x1={12} y1={17} x2={12.01} y2={17} />
                    </svg>
                    <div>
                      {t.rich("abtretungWarning", {
                        b: (chunks) => <strong>{chunks}</strong>,
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* --- Section 2c: Alltagshelfer intake wizard fields -------- */}
          {isAlltags && (
            <section className="rounded-lg border border-neutral-100 bg-white p-5 shadow-xs">
              <header className="mb-4 flex items-start gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-md bg-error-50 text-error-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <rect x={3} y={4} width={18} height={18} rx={2} />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-neutral-800">
                    {t("section.intakeAlltagshelfer")}
                  </h2>
                  <p className="text-[12px] text-neutral-500">
                    {t("section.intakeAlltagshelferSub")}
                  </p>
                </div>
              </header>

              {/* Payer + billing type row */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={t("fields.payerType")} error={errors.payer_type}>
                  <select className="input" {...input("payer_type")}>
                    <option value="">— {t("fields.payerTypePlaceholder")} —</option>
                    <option value="care_fund">{t("payer.care_fund.label")}</option>
                    <option value="insurance">{t("payer.insurance.label")}</option>
                    <option value="private_pay">{t("payer.private_pay.label")}</option>
                    <option value="commercial">{t("payer.commercial.label")}</option>
                  </select>
                </Field>
                <Field
                  label={t("fields.billingType")}
                  hint={t("fields.billingTypeHint")}
                  error={errors.billing_type}
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(
                      [
                        "paragraph_45b",
                        "paragraph_39",
                        "both",
                      ] as const
                    ).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setField("billing_type", v)}
                        className={cn(
                          "rounded-md border px-2 py-2 text-[12px] font-medium transition",
                          form.billing_type === v
                            ? "border-error-500 bg-error-50 text-error-700 ring-1 ring-error-200"
                            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                        )}
                      >
                        {t(`fields.billingType_${v}` as never)}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              {/* Legal representative */}
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field
                  label={t("fields.legalRepName")}
                  hint={t("fields.legalRepHint")}
                  error={errors.legal_rep_name}
                >
                  <input
                    className="input"
                    placeholder={t("fields.legalRepNamePlaceholder")}
                    {...input("legal_rep_name")}
                  />
                </Field>
                <Field label={t("fields.legalRepPhone")} error={errors.legal_rep_phone}>
                  <input
                    className="input"
                    placeholder="+49 30 …"
                    {...input("legal_rep_phone")}
                  />
                </Field>
              </div>

              {/* Desired services multi-select — chips */}
              <div className="mt-5">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-neutral-700">
                    {t("fields.desiredServices")}
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    {t("fields.desiredServicesHint")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "shopping",
                      "cooking",
                      "cleaning",
                      "laundry",
                      "companionship",
                      "walks",
                      "doctor_visits",
                      "authority_visits",
                      "reading",
                      "conversation",
                    ] as const
                  ).map((svc) => {
                    const active = form.desired_services.includes(svc);
                    return (
                      <button
                        key={svc}
                        type="button"
                        onClick={() => toggleArrayItem("desired_services", svc)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
                          active
                            ? "border-error-500 bg-error-50 text-error-700"
                            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                        )}
                      >
                        {t(`fields.desiredServices_${svc}` as never)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preferred plan: hours per week + preferred days + times */}
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field
                  label={t("fields.preferredHoursPerWeek")}
                  hint={t("fields.preferredHoursHint")}
                  error={errors.preferred_hours_per_week}
                >
                  <div className="flex items-stretch gap-2">
                    <input
                      type="number"
                      min="0"
                      max="168"
                      step="0.5"
                      className="input flex-1"
                      placeholder="z. B. 4"
                      {...input("preferred_hours_per_week")}
                    />
                    <span className="inline-flex items-center rounded-sm border border-neutral-200 bg-neutral-50 px-3 text-[12px] text-neutral-600">
                      h / Woche
                    </span>
                  </div>
                </Field>
                <Field label={t("fields.preferredTimes")} error={errors.preferred_times}>
                  <input
                    className="input"
                    placeholder={t("fields.preferredTimesPlaceholder")}
                    {...input("preferred_times")}
                  />
                </Field>
              </div>

              <div className="mt-5">
                <div className="mb-2 text-[13px] font-medium text-neutral-700">
                  {t("fields.preferredDays")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
                  ).map((day) => {
                    const active = form.preferred_days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleArrayItem("preferred_days", day)}
                        className={cn(
                          "grid h-9 w-11 place-items-center rounded-md border text-[12px] font-semibold uppercase tracking-[0.04em] transition",
                          active
                            ? "border-error-500 bg-error-50 text-error-700"
                            : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50",
                        )}
                      >
                        {t(`fields.day_${day}` as never)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Conversation notes (intake meeting record) */}
              <div className="mt-5">
                <Field
                  label={t("fields.conversationNotes")}
                  hint={t("fields.conversationNotesHint")}
                  error={errors.conversation_notes}
                >
                  <textarea
                    rows={4}
                    className="input min-h-[110px]"
                    placeholder={t("fields.conversationNotesPlaceholder")}
                    {...input("conversation_notes")}
                  />
                </Field>
              </div>
            </section>
          )}

          {/* --- Section 3: Service plan ------------------------------- */}
          <section className="rounded-lg border border-neutral-100 bg-white p-5 shadow-xs">
            <header className="mb-4 flex items-start gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-neutral-50 text-neutral-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <rect x={3} y={5} width={18} height={16} rx={2} />
                  <path d="M3 9h18M8 3v4M16 3v4" />
                </svg>
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-neutral-800">
                  {isAlltags ? t("sectionTitles.serviceAlltagshilfe") : t("sectionTitles.service")}
                </h2>
                <p className="text-[12px] text-neutral-500">
                  {isAlltags
                    ? t("sectionTitles.serviceSubAlltagshilfe")
                    : t("sectionTitles.serviceSub")}
                </p>
              </div>
            </header>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t("fields.rhythm")} required error={errors.cleaning_rhythm}>
                <select className="input" required {...input("cleaning_rhythm")}>
                  {RHYTHM_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("fields.estimatedHours")}
                hint={t("fields.estimatedHoursHint")}
                required
                error={errors.estimated_hours_per_visit}
              >
                <div className="flex items-stretch gap-2">
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    className="input flex-1"
                    placeholder="z. B. 3"
                    required
                    {...input("estimated_hours_per_visit")}
                  />
                  <span className="inline-flex items-center rounded-sm border border-neutral-200 bg-neutral-50 px-3 text-[12px] text-neutral-600">
                    {t("fields.hoursPerVisitUnit")}
                  </span>
                </div>
              </Field>
              {!isAlltags && (
                <>
                  <Field
                    label={t("fields.agreedRate")}
                    hint={t("fields.agreedRateHint")}
                    required
                    error={errors.agreed_hourly_rate_cents}
                  >
                    <div className="flex items-stretch">
                      <span className="inline-flex items-center rounded-l-sm border border-r-0 border-neutral-200 bg-neutral-50 px-3 text-[12px] text-neutral-600">
                        €
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="input rounded-l-none"
                        placeholder={t("fields.agreedRatePlaceholder")}
                        required
                        {...input("agreed_hourly_rate_eur")}
                      />
                    </div>
                  </Field>
                  <Field label={t("fields.contractStart")} required error={errors.contract_start}>
                    <input type="date" className="input" required {...input("contract_start")} />
                  </Field>
                </>
              )}
              {isAlltags && (
                <Field
                  label={t("fields.contractDocsSignedQ")}
                  hint={t("fields.contractDocsSignedHint")}
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <YesNoTile
                      selected={form.contract_docs_signed === true}
                      onClick={() => setField("contract_docs_signed", true)}
                      title={t("fields.contractDocsSignedYesTitle")}
                      sub={t("fields.contractDocsSignedYesSub")}
                      tone="ok"
                      compact
                    />
                    <YesNoTile
                      selected={form.contract_docs_signed === false}
                      onClick={() => setField("contract_docs_signed", false)}
                      title={t("fields.contractDocsSignedNoTitle")}
                      sub={t("fields.contractDocsSignedNoSub")}
                      tone="neutral"
                      compact
                    />
                  </div>
                </Field>
              )}
            </div>
          </section>

          {/* --- Section 4: Other notes -------------------------------- */}
          <section className="rounded-lg border border-neutral-100 bg-white p-5 shadow-xs">
            <header className="mb-4 flex items-start gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-neutral-50 text-neutral-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-neutral-800">
                  {isAlltags ? t("sectionTitles.otherAlltagshilfe") : t("sectionTitles.other")}
                </h2>
                <p className="text-[12px] text-neutral-500">
                  Interne Notiz — nur das Team sieht diese
                </p>
              </div>
            </header>
            <Field
              label={isAlltags ? t("fields.notesAlltagshilfeLabel") : t("fields.notesPriyaLabel")}
              error={errors.notes}
            >
              <textarea
                rows={4}
                className="input min-h-[110px]"
                placeholder={
                  isAlltags
                    ? "z. B. eingeschränkte Mobilität; Diabetiker; Schlüssel bei Nachbarin Frau Schmidt; Hörgerät für Kommunikation nötig…"
                    : "z. B. Schlüssel beim Hausmeister abgeben; Allergien gegen Reinigungsmittel; nur Vormittags möglich…"
                }
                {...input("notes")}
              />
            </Field>
          </section>

          {/* --- Footer actions ---------------------------------------- */}
          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border sm:shadow-sm">
            <p className="text-[11px] text-neutral-500">
              {t("actions.requiredHint")} <span className="text-error-500">*</span> {t("actions.auditedHint")}
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={routes.clientNew}
                className="rounded-sm border border-neutral-200 bg-white px-3 py-1.5 text-[13px] text-neutral-700 hover:bg-neutral-50"
              >
                ← {t("actions.back")}
              </Link>
              <button
                type="button"
                className="rounded-sm border border-neutral-200 bg-white px-3 py-1.5 text-[13px] text-neutral-700 hover:bg-neutral-50"
                title={t("actions.saveDraftTitle")}
              >
                {t("actions.saveDraft")}
              </button>
              <button
                type="submit"
                disabled={pending}
                className={cn(
                  "rounded-sm px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition disabled:opacity-60",
                  accentBtn,
                )}
              >
                {pending ? t("actions.saving") : `${t("actions.continueConfirm")} →`}
              </button>
            </div>
          </div>
        </div>

        {/* ============ Summary side panel =========================== */}
        <aside className="space-y-4">
          <section className="rounded-lg border border-neutral-100 bg-white p-5 shadow-xs">
            <h3 className="text-[15px] font-semibold text-neutral-800">{t("summary.title")}</h3>
            <p className="mt-1 text-[12px] text-neutral-500">
              {isAlltags
                ? "Die Angaben werden in den Pflegevertrag und den ersten Monatsbericht übernommen."
                : "Die Angaben werden in den Vertrag und die erste Rechnung übernommen."}
            </p>
            <dl className="mt-4 space-y-2 text-[12px]">
              <SummaryRow label={t("stepper.serviceType")}>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em]",
                    accentBg,
                    accentText,
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", isAlltags ? "bg-error-500" : "bg-primary-500")} />
                  {isAlltags ? t("summary.alltagshilfeShort") : t("summary.priyasShort")}
                </span>
              </SummaryRow>
              <SummaryRow label={t("summary.invoice")}>
                <span>{isAlltags ? t("summary.invoiceAlltagshilfe") : t("summary.invoicePriya")}</span>
              </SummaryRow>
              <SummaryRow label={t("summary.vat")}>
                <span>{isAlltags ? t("summary.vatAlltagshilfe") : t("summary.vatPriya")}</span>
              </SummaryRow>
              {isAlltags ? (
                <SummaryRow label={t("fields.pflegegrad")}>
                  <span>{form.care_level}</span>
                </SummaryRow>
              ) : (
                <SummaryRow label={t("summary.rate")}>
                  <span>
                    {form.agreed_hourly_rate_eur
                      ? `€ ${Number(form.agreed_hourly_rate_eur).toFixed(2)}/Std`
                      : "—"}
                  </span>
                </SummaryRow>
              )}
              <SummaryRow label={isAlltags ? t("summary.careInterval") : t("summary.rhythm")}>
                <span>
                  {RHYTHM_OPTIONS.find((o) => o.value === form.cleaning_rhythm)?.label ?? "—"}
                </span>
              </SummaryRow>
            </dl>
          </section>

          <section className="rounded-lg border border-neutral-100 bg-white p-5 shadow-xs">
            <h3 className="text-[13px] font-semibold text-neutral-800">
              Was passiert nach dem Speichern?
            </h3>
            <ul className="mt-3 space-y-2 text-[12px]">
              {(isAlltags
                ? [
                    ["Der Pflegekunde erscheint in der Kundenliste rot markiert.", true],
                    ["Nur qualifiziertes Pflegepersonal kann zugewiesen werden.", true],
                    [
                      `Erstberatung: ${form.contract_docs_signed ? "Vertrag bereits unterzeichnet — Start sofort möglich" : t("fields.contractDocsSignedNoSub")}.`,
                      true,
                    ],
                    ["Keine Lexware-Synchronisation — manuelle Rechnung.", true],
                    ["Pflegegrad erscheint im Monatsbericht für jeden Einsatz.", true],
                  ]
                : [
                    ["Der Kunde erscheint grün markiert in der Kundenliste.", true],
                    ["Lexware-Sync legt automatisch ein Debitor-Konto an.", true],
                    ["Die erste Schicht kann sofort im Einsatzplan angelegt werden.", true],
                    [
                      `Eine Willkommens-E-Mail wird an ${form.email || "{Email}"} versendet.`,
                      Boolean(form.email),
                    ],
                  ]
              ).map(([text, ok], i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full",
                      ok ? "bg-success-500 text-white" : "bg-neutral-200 text-neutral-500",
                    )}
                  >
                    {ok ? "✓" : "·"}
                  </span>
                  <span className="text-neutral-700">{text as string}</span>
                </li>
              ))}
            </ul>
          </section>

          {isAlltags && (
            <p className="rounded-md border border-neutral-100 bg-neutral-50 p-3 text-[11px] text-neutral-500">
              {t("summary.gdpr")}
            </p>
          )}
        </aside>
      </div>
    </form>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium text-neutral-800">{children}</dd>
    </div>
  );
}

function StepperItem({
  n,
  state,
  label,
  sub,
  isAlltags,
}: {
  n: number;
  state: "done" | "active" | "future";
  label: string;
  sub: string;
  isAlltags: boolean;
}) {
  const accent = isAlltags ? "bg-error-500" : "bg-primary-500";
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={cn(
          "grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[12px] font-bold",
          state === "done" && `${accent} text-white`,
          state === "active" && `${accent} text-white ring-4 ring-offset-0`,
          state === "active" && (isAlltags ? "ring-error-100" : "ring-primary-100"),
          state === "future" && "bg-neutral-100 text-neutral-500",
        )}
      >
        {state === "done" ? "✓" : n}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
          {label}
        </div>
        <div
          className={cn(
            "truncate text-[13px] font-medium",
            state === "future" ? "text-neutral-500" : "text-neutral-800",
          )}
        >
          {sub}
        </div>
      </div>
    </li>
  );
}

function YesNoTile({
  selected,
  onClick,
  title,
  sub,
  tone,
  compact = false,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  tone: "ok" | "neutral";
  compact?: boolean;
}) {
  const onColor = tone === "ok" ? "border-error-500 bg-error-50 ring-error-200" : "border-neutral-400 bg-neutral-50 ring-neutral-200";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md border bg-white px-3 text-left transition",
        compact ? "py-2" : "py-3",
        selected
          ? `${onColor} ring-1`
          : "border-neutral-200 hover:bg-neutral-50",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full border-2",
          selected
            ? tone === "ok"
              ? "border-error-500 bg-error-500"
              : "border-neutral-500 bg-neutral-500"
            : "border-neutral-300",
        )}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[13px] font-medium", selected ? "text-neutral-900" : "text-neutral-700")}>
          {title}
        </span>
        <span className="block text-[11px] text-neutral-500">{sub}</span>
      </span>
    </button>
  );
}

function Field({
  label,
  hint,
  required,
  error,
  className,
  children,
}: {
  label: string;
  /** Right-aligned helper text rendered next to the label. */
  hint?: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-neutral-700">
          {label}
          {required && <span className="ml-1 text-error-500">*</span>}
        </span>
        {hint && (
          <span className="text-[11px] text-neutral-500">{hint}</span>
        )}
      </span>
      {children}
      {error && <span className="text-[12px] text-error-700">{error}</span>}
    </label>
  );
}

// SectionLabel + YesNoField helpers were used by the previous flat-list
// form layout. The current sectioned-card layout uses `<section>` headers
// + `YesNoTile` tiles instead — these helpers are intentionally removed
// to avoid two parallel patterns in the same file.

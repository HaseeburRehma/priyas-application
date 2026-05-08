"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { onboardClientAction } from "@/app/actions/onboarding";
import { recordPropertyPhotoAction } from "@/app/actions/property-photos";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  compressImage,
  enforcePhotoCap,
  MAX_PHOTOS_PER_ASSIGNMENT,
} from "@/lib/utils/image";
import { SignaturePad } from "./SignaturePad";

type CustomerType = "residential" | "commercial" | "alltagshilfe";

// Spec §4.10 — "Photo documentation of the property during the first visit."
// We add a Photos step between Service and Review so the on-site PM can
// capture initial state without leaving the wizard.
const STEPS = ["type", "client", "address", "service", "photos", "review"] as const;
type Step = (typeof STEPS)[number];

export function TabletOnboardingFlow() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>("type");

  const [customerType, setCustomerType] = useState<CustomerType>("residential");
  const [client, setClient] = useState({
    display_name: "",
    contact_name: "",
    email: "",
    phone: "",
    insurance_provider: "",
    insurance_number: "",
    care_level: "1",
  });
  const [address, setAddress] = useState({
    address_line1: "",
    address_line2: "",
    postal_code: "",
    city: "",
    country: "DE",
  });
  const [service, setService] = useState({
    frequency: "biweekly" as "weekly" | "biweekly" | "monthly" | "one_off",
    preferred_day: null as
      | null
      | "mon"
      | "tue"
      | "wed"
      | "thu"
      | "fri"
      | "sat"
      | "sun",
    special_notes: "",
  });
  const [signature, setSignature] = useState<{
    signed_by_name: string;
    svg: string | null;
    consent: boolean;
  }>({
    signed_by_name: "",
    svg: null,
    consent: false,
  });
  // Files captured by the camera/file picker — uploaded after the action
  // succeeds and we have a property_id.
  const [photos, setPhotos] = useState<File[]>([]);
  // Object URLs for previews. Re-created when `photos` changes; cleaned
  // up on unmount.
  const photoPreviews = useMemo(
    () => photos.map((f) => URL.createObjectURL(f)),
    [photos],
  );
  useEffect(() => {
    return () => {
      for (const url of photoPreviews) URL.revokeObjectURL(url);
    };
  }, [photoPreviews]);

  const stepIndex = STEPS.indexOf(step);
  const canNext = useMemo(() => {
    if (step === "type") return !!customerType;
    if (step === "client") {
      if (!client.display_name.trim()) return false;
      if (customerType === "alltagshilfe") {
        return (
          !!client.insurance_provider.trim() &&
          !!client.insurance_number.trim()
        );
      }
      return true;
    }
    if (step === "address") {
      // Address is optional — user can skip.
      return true;
    }
    if (step === "service") return true;
    if (step === "photos") return true; // photos step is optional
    if (step === "review") {
      return (
        !!signature.signed_by_name.trim() &&
        !!signature.svg &&
        signature.consent
      );
    }
    return false;
  }, [step, customerType, client, signature]);

  function next() {
    if (!canNext) return;
    const i = STEPS.indexOf(step);
    const target = STEPS[i + 1];
    if (target) setStep(target);
  }
  function back() {
    const i = STEPS.indexOf(step);
    const target = STEPS[i - 1];
    if (target) setStep(target);
  }

  function submit() {
    if (!signature.svg) {
      toast.error(t("signature.required"));
      return;
    }
    start(async () => {
      const clientPayload =
        customerType === "alltagshilfe"
          ? {
              customer_type: "alltagshilfe" as const,
              display_name: client.display_name.trim(),
              contact_name: client.contact_name || "",
              email: client.email || "",
              phone: client.phone || "",
              tax_id: "",
              notes: "",
              insurance_provider: client.insurance_provider.trim(),
              insurance_number: client.insurance_number.trim(),
              care_level: Number(client.care_level),
            }
          : {
              customer_type: customerType,
              display_name: client.display_name.trim(),
              contact_name: client.contact_name || "",
              email: client.email || "",
              phone: client.phone || "",
              tax_id: "",
              notes: "",
            };

      const hasAddress =
        !!address.address_line1.trim() && !!address.city.trim();

      const r = await onboardClientAction({
        client: clientPayload,
        address: hasAddress
          ? {
              address_line1: address.address_line1.trim(),
              address_line2: address.address_line2 || "",
              postal_code: address.postal_code.trim(),
              city: address.city.trim(),
              country: address.country || "DE",
            }
          : undefined,
        service_preferences: {
          frequency: service.frequency,
          preferred_day: service.preferred_day,
          special_notes: service.special_notes,
        },
        signature: {
          signed_by_name: signature.signed_by_name.trim(),
          signature_svg: signature.svg,
          consent_data_processing: true,
        },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }

      // Spec §4.10 — upload any photos the user captured against the
      // freshly-created property. Best-effort: a partial photo upload
      // doesn't block the client-record creation that already succeeded.
      if (photos.length > 0 && r.data.property_id) {
        const supabase = createSupabaseBrowserClient();
        let failed = 0;
        for (const original of photos) {
          try {
            const file = await compressImage(original);
            const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
            const path = `${r.data.org_id}/${r.data.property_id}/${Date.now()}-${Math.random()
              .toString(16)
              .slice(2, 8)}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("property-photos")
              .upload(path, file, {
                upsert: false,
                contentType: file.type,
              });
            if (upErr) {
              failed += 1;
              continue;
            }
            const recRes = await recordPropertyPhotoAction({
              property_id: r.data.property_id,
              storage_path: path,
              caption: "",
            });
            if (!recRes.ok) failed += 1;
          } catch {
            failed += 1;
          }
        }
        if (failed > 0) {
          toast.error(t("photos.someFailed", { n: failed }));
        }
      }

      toast.success(t("success.toast"));
      router.replace(routes.onboardSuccess);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mx-auto max-w-[920px] py-2">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-[22px] font-bold text-secondary-500">
            {t("kioskTag")}
          </h1>
        </div>
        {/* Stepper — column count tracks STEPS.length so adding/removing
            a step doesn't desync the layout. */}
        <ol
          className="mb-7 grid gap-2"
          style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}
        >
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const active = s === step;
            return (
              <li
                key={s}
                className={cn(
                  "flex flex-col items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.04em]",
                  active
                    ? "text-primary-700"
                    : done
                      ? "text-success-700"
                      : "text-neutral-400",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full font-mono text-[12px]",
                    active && "bg-primary-500 text-white",
                    done && !active && "bg-success-50 text-success-700",
                    !active && !done && "bg-neutral-100 text-neutral-400",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="hidden text-center sm:block">
                  {t(`steps.${s}` as never)}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="rounded-xl border border-neutral-100 bg-white p-7 shadow-sm">
          {step === "type" && (
            <StepType
              value={customerType}
              onChange={(v) => setCustomerType(v)}
            />
          )}
          {step === "client" && (
            <StepClient
              type={customerType}
              value={client}
              onChange={setClient}
            />
          )}
          {step === "address" && (
            <StepAddress value={address} onChange={setAddress} />
          )}
          {step === "service" && (
            <StepService value={service} onChange={setService} />
          )}
          {step === "photos" && (
            <StepPhotos
              files={photos}
              previews={photoPreviews}
              onAdd={(incoming) => {
                const { kept, dropped } = enforcePhotoCap(
                  photos,
                  incoming,
                  MAX_PHOTOS_PER_ASSIGNMENT,
                );
                if (dropped > 0) {
                  toast.error(t("photos.limitReached", { dropped }));
                }
                if (kept.length > 0) {
                  setPhotos((prev) => [...prev, ...kept]);
                }
              }}
              onRemove={(idx) =>
                setPhotos((prev) => prev.filter((_, i) => i !== idx))
              }
            />
          )}
          {step === "review" && (
            <StepReview
              type={customerType}
              client={client}
              address={address}
              service={service}
              signature={signature}
              onSignatureChange={setSignature}
            />
          )}

          <div className="mt-7 flex items-center justify-between border-t border-neutral-100 pt-5">
            <button
              type="button"
              onClick={back}
              disabled={stepIndex === 0 || pending}
              className={cn(
                "btn btn--ghost border border-neutral-200",
                (stepIndex === 0 || pending) && "opacity-50",
              )}
            >
              {t("back")}
            </button>
            {step === "review" ? (
              <button
                type="button"
                onClick={submit}
                disabled={!canNext || pending}
                className={cn(
                  "btn btn--primary",
                  (!canNext || pending) && "opacity-80",
                )}
                style={{ minHeight: 52, padding: "14px 28px" }}
              >
                {pending ? "…" : t("finish")}
              </button>
            ) : (
              <button
                type="button"
                onClick={next}
                disabled={!canNext}
                className={cn(
                  "btn btn--primary",
                  !canNext && "opacity-60",
                )}
                style={{ minHeight: 52, padding: "14px 28px" }}
              >
                {t("next")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Steps ---------------- */

function StepType({
  value,
  onChange,
}: {
  value: CustomerType;
  onChange: (v: CustomerType) => void;
}) {
  const t = useTranslations("onboarding.type");
  const opts: Array<{ id: CustomerType; titleKey: string; descKey: string }> = [
    { id: "residential", titleKey: "residential", descKey: "residentialDesc" },
    { id: "commercial", titleKey: "commercial", descKey: "commercialDesc" },
    { id: "alltagshilfe", titleKey: "alltagshilfe", descKey: "alltagshilfeDesc" },
  ];
  return (
    <div>
      <h2 className="mb-1 text-[22px] font-bold text-secondary-500">
        {t("title")}
      </h2>
      <p className="mb-6 text-[13px] text-neutral-500">{t("subtitle")}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {opts.map((o) => {
          const selected = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-lg border-2 p-5 text-left transition",
                selected
                  ? "border-primary-500 bg-primary-50"
                  : "border-neutral-200 bg-white hover:border-primary-300",
              )}
            >
              <span className="text-[15px] font-semibold text-neutral-800">
                {t(o.titleKey as never)}
              </span>
              <span className="text-[12px] leading-[1.5] text-neutral-600">
                {t(o.descKey as never)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepClient({
  type,
  value,
  onChange,
}: {
  type: CustomerType;
  value: {
    display_name: string;
    contact_name: string;
    email: string;
    phone: string;
    insurance_provider: string;
    insurance_number: string;
    care_level: string;
  };
  onChange: React.Dispatch<React.SetStateAction<typeof value>>;
}) {
  const t = useTranslations("onboarding.client");
  return (
    <div>
      <h2 className="mb-1 text-[22px] font-bold text-secondary-500">
        {t("title")}
      </h2>
      <p className="mb-6 text-[13px] text-neutral-500">{t("subtitle")}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("displayName")} required>
          <input
            className="input"
            style={{ minHeight: 48 }}
            value={value.display_name}
            onChange={(e) =>
              onChange((v) => ({ ...v, display_name: e.target.value }))
            }
          />
        </Field>
        <Field label={t("contactName")}>
          <input
            className="input"
            style={{ minHeight: 48 }}
            value={value.contact_name}
            onChange={(e) =>
              onChange((v) => ({ ...v, contact_name: e.target.value }))
            }
          />
        </Field>
        <Field label={t("email")}>
          <input
            type="email"
            className="input"
            style={{ minHeight: 48 }}
            value={value.email}
            onChange={(e) =>
              onChange((v) => ({ ...v, email: e.target.value }))
            }
          />
        </Field>
        <Field label={t("phone")}>
          <input
            type="tel"
            className="input"
            style={{ minHeight: 48 }}
            value={value.phone}
            onChange={(e) =>
              onChange((v) => ({ ...v, phone: e.target.value }))
            }
          />
        </Field>
      </div>
      {type === "alltagshilfe" && (
        <div className="mt-5 rounded-md border border-tertiary-200 bg-tertiary-200/30 p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-secondary-500">
            {t("alltagshilfeHeading")}
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label={t("insuranceProvider")} required>
              <input
                className="input"
                style={{ minHeight: 48 }}
                value={value.insurance_provider}
                onChange={(e) =>
                  onChange((v) => ({
                    ...v,
                    insurance_provider: e.target.value,
                  }))
                }
              />
            </Field>
            <Field label={t("insuranceNumber")} required>
              <input
                className="input"
                style={{ minHeight: 48 }}
                value={value.insurance_number}
                onChange={(e) =>
                  onChange((v) => ({
                    ...v,
                    insurance_number: e.target.value,
                  }))
                }
              />
            </Field>
            <Field label={t("careLevel")}>
              <select
                className="input"
                style={{ minHeight: 48 }}
                value={value.care_level}
                onChange={(e) =>
                  onChange((v) => ({ ...v, care_level: e.target.value }))
                }
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

function StepAddress({
  value,
  onChange,
}: {
  value: {
    address_line1: string;
    address_line2: string;
    postal_code: string;
    city: string;
    country: string;
  };
  onChange: React.Dispatch<React.SetStateAction<typeof value>>;
}) {
  const t = useTranslations("onboarding.address");
  return (
    <div>
      <h2 className="mb-1 text-[22px] font-bold text-secondary-500">
        {t("title")}
      </h2>
      <p className="mb-6 text-[13px] text-neutral-500">{t("subtitle")}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("addressLine1")} className="md:col-span-2">
          <input
            className="input"
            style={{ minHeight: 48 }}
            value={value.address_line1}
            onChange={(e) =>
              onChange((v) => ({ ...v, address_line1: e.target.value }))
            }
          />
        </Field>
        <Field label={t("addressLine2")} className="md:col-span-2">
          <input
            className="input"
            style={{ minHeight: 48 }}
            value={value.address_line2}
            onChange={(e) =>
              onChange((v) => ({ ...v, address_line2: e.target.value }))
            }
          />
        </Field>
        <Field label={t("postalCode")}>
          <input
            className="input"
            style={{ minHeight: 48 }}
            value={value.postal_code}
            onChange={(e) =>
              onChange((v) => ({ ...v, postal_code: e.target.value }))
            }
          />
        </Field>
        <Field label={t("city")}>
          <input
            className="input"
            style={{ minHeight: 48 }}
            value={value.city}
            onChange={(e) => onChange((v) => ({ ...v, city: e.target.value }))}
          />
        </Field>
        <Field label={t("country")}>
          <input
            className="input"
            style={{ minHeight: 48 }}
            maxLength={2}
            value={value.country}
            onChange={(e) =>
              onChange((v) => ({ ...v, country: e.target.value }))
            }
          />
        </Field>
      </div>
      <p className="mt-3 text-[12px] text-neutral-500">{t("optional")}</p>
    </div>
  );
}

function StepService({
  value,
  onChange,
}: {
  value: {
    frequency: "weekly" | "biweekly" | "monthly" | "one_off";
    preferred_day:
      | null
      | "mon"
      | "tue"
      | "wed"
      | "thu"
      | "fri"
      | "sat"
      | "sun";
    special_notes: string;
  };
  onChange: React.Dispatch<React.SetStateAction<typeof value>>;
}) {
  const t = useTranslations("onboarding.service");
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  const freqs = ["weekly", "biweekly", "monthly", "one_off"] as const;
  return (
    <div>
      <h2 className="mb-1 text-[22px] font-bold text-secondary-500">
        {t("title")}
      </h2>
      <p className="mb-6 text-[13px] text-neutral-500">{t("subtitle")}</p>
      <div className="flex flex-col gap-5">
        <div>
          <span className="mb-2 block text-[13px] font-medium text-neutral-700">
            {t("frequency")}
          </span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {freqs.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onChange((v) => ({ ...v, frequency: f }))}
                className={cn(
                  "rounded-md border-2 px-4 py-3 text-[13px] font-semibold transition",
                  value.frequency === f
                    ? "border-primary-500 bg-primary-50 text-primary-700"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-primary-300",
                )}
              >
                {t(`freq.${f}` as never)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-2 block text-[13px] font-medium text-neutral-700">
            {t("preferredDay")}
          </span>
          <div className="grid grid-cols-7 gap-2">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() =>
                  onChange((v) => ({
                    ...v,
                    preferred_day: v.preferred_day === d ? null : d,
                  }))
                }
                className={cn(
                  "rounded-md border-2 px-2 py-3 text-[12px] font-semibold uppercase transition",
                  value.preferred_day === d
                    ? "border-primary-500 bg-primary-50 text-primary-700"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-primary-300",
                )}
              >
                {t(`day.${d}` as never)}
              </button>
            ))}
          </div>
        </div>
        <Field label={t("notes")}>
          <textarea
            rows={4}
            className="input min-h-[120px]"
            value={value.special_notes}
            onChange={(e) =>
              onChange((v) => ({ ...v, special_notes: e.target.value }))
            }
          />
        </Field>
      </div>
    </div>
  );
}

function StepPhotos({
  files,
  previews,
  onAdd,
  onRemove,
}: {
  files: File[];
  previews: string[];
  onAdd: (files: File[]) => void;
  onRemove: (idx: number) => void;
}) {
  const t = useTranslations("onboarding.photos");
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function handlePicked(list: FileList | null, source: "library" | "camera") {
    if (!list || list.length === 0) return;
    onAdd(Array.from(list));
    // Allow re-picking the same file again later.
    if (source === "library" && fileRef.current) fileRef.current.value = "";
    if (source === "camera" && cameraRef.current) cameraRef.current.value = "";
  }

  return (
    <div>
      <h2 className="mb-1 text-[22px] font-bold text-secondary-500">
        {t("title")}
      </h2>
      <p className="mb-2 text-[13px] text-neutral-500">{t("subtitle")}</p>
      <p className="mb-6 text-[12px] text-neutral-400">
        {t("optional", {
          max: MAX_PHOTOS_PER_ASSIGNMENT,
          n: files.length,
        })}
      </p>

      {/* Upload triggers — separate inputs so iPad/iPhone Safari shows
          the "Take Photo" sheet for the camera button and the
          file-picker sheet for the library button. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handlePicked(e.target.files, "library")}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handlePicked(e.target.files, "camera")}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={files.length >= MAX_PHOTOS_PER_ASSIGNMENT}
          className={cn(
            "btn btn--primary",
            files.length >= MAX_PHOTOS_PER_ASSIGNMENT && "opacity-60",
          )}
          style={{ minHeight: 56 }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx={12} cy={13} r={4} />
          </svg>
          {t("takePhoto")}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={files.length >= MAX_PHOTOS_PER_ASSIGNMENT}
          className={cn(
            "btn btn--tertiary",
            files.length >= MAX_PHOTOS_PER_ASSIGNMENT && "opacity-60",
          )}
          style={{ minHeight: 56 }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5-5 5 5M12 5v12" />
          </svg>
          {t("fromLibrary")}
        </button>
      </div>

      {/* Thumbnails grid */}
      {files.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {files.map((f, i) => (
            <figure
              key={`${f.name}-${i}`}
              className="group relative overflow-hidden rounded-md border border-neutral-200 bg-neutral-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previews[i] ?? ""}
                alt=""
                className="h-32 w-full object-cover"
              />
              <button
                type="button"
                aria-label={t("removePhoto")}
                onClick={() => onRemove(i)}
                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-white/90 text-neutral-500 shadow-sm transition hover:text-error-700"
              >
                <span aria-hidden>✕</span>
              </button>
              <figcaption className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-[10px] text-white">
                {(f.size / 1024).toFixed(0)} KB
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

function StepReview({
  type,
  client,
  address,
  service,
  signature,
  onSignatureChange,
}: {
  type: CustomerType;
  client: {
    display_name: string;
    contact_name: string;
    email: string;
    phone: string;
    insurance_provider: string;
    insurance_number: string;
    care_level: string;
  };
  address: {
    address_line1: string;
    address_line2: string;
    postal_code: string;
    city: string;
    country: string;
  };
  service: {
    frequency: string;
    preferred_day: string | null;
    special_notes: string;
  };
  signature: { signed_by_name: string; svg: string | null; consent: boolean };
  onSignatureChange: React.Dispatch<
    React.SetStateAction<{
      signed_by_name: string;
      svg: string | null;
      consent: boolean;
    }>
  >;
}) {
  const t = useTranslations("onboarding.review");
  const tType = useTranslations("onboarding.type");
  const tFreq = useTranslations("onboarding.service.freq");
  return (
    <div>
      <h2 className="mb-1 text-[22px] font-bold text-secondary-500">
        {t("title")}
      </h2>
      <p className="mb-6 text-[13px] text-neutral-500">{t("subtitle")}</p>

      <dl className="mb-5 grid grid-cols-1 gap-x-6 gap-y-2 rounded-md border border-neutral-100 bg-neutral-50 p-4 text-[13px] md:grid-cols-2">
        <Row label={t("type")} value={tType(type as never)} />
        <Row label={t("name")} value={client.display_name || "—"} />
        {client.contact_name && (
          <Row label={t("contact")} value={client.contact_name} />
        )}
        {client.email && <Row label={t("email")} value={client.email} />}
        {client.phone && <Row label={t("phone")} value={client.phone} />}
        {address.address_line1 && (
          <Row
            label={t("address")}
            value={`${address.address_line1}${address.address_line2 ? ", " + address.address_line2 : ""}, ${address.postal_code} ${address.city}, ${address.country}`}
          />
        )}
        <Row label={t("frequency")} value={tFreq(service.frequency as never)} />
        {type === "alltagshilfe" && (
          <>
            <Row
              label={t("insurance")}
              value={`${client.insurance_provider} (${client.insurance_number})`}
            />
            <Row label={t("careLevel")} value={client.care_level} />
          </>
        )}
      </dl>

      <div className="rounded-md border-2 border-primary-200 bg-white p-5">
        <h3 className="mb-1 text-[15px] font-semibold text-secondary-500">
          {t("signature.heading")}
        </h3>
        <p className="mb-4 text-[12px] text-neutral-500">
          {t("signature.body")}
        </p>
        <Field label={t("signature.signedByName")} required className="mb-3">
          <input
            className="input"
            style={{ minHeight: 48 }}
            value={signature.signed_by_name}
            onChange={(e) =>
              onSignatureChange((s) => ({
                ...s,
                signed_by_name: e.target.value,
              }))
            }
          />
        </Field>
        <SignaturePad
          height={220}
          onChange={(svg) =>
            onSignatureChange((s) => ({ ...s, svg }))
          }
        />
        <label className="mt-4 flex items-start gap-2 text-[12px] text-neutral-700">
          <input
            type="checkbox"
            checked={signature.consent}
            onChange={(e) =>
              onSignatureChange((s) => ({ ...s, consent: e.target.checked }))
            }
            className="mt-1 h-4 w-4"
          />
          <span>{t("signature.consent")}</span>
        </label>
      </div>
    </div>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <dt className="min-w-[110px] text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-500">
        {label}
      </dt>
      <dd className="text-[13px] text-neutral-800">{value}</dd>
    </div>
  );
}

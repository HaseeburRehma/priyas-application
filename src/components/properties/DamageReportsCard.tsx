"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { useFormat } from "@/lib/utils/i18n-format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  createDamageReportAction,
  discussDamageReportAction,
  resolveDamageReportAction,
} from "@/app/actions/damage";
import { routes } from "@/lib/constants/routes";
import type { DamageReport } from "@/lib/api/damage";
import {
  compressImage,
  enforcePhotoCap,
  MAX_PHOTOS_PER_ASSIGNMENT,
} from "@/lib/utils/image";

type Props = {
  propertyId: string;
  orgId: string;
  reports: DamageReport[];
  signedUrlsByPath: Record<string, string | null>;
  canCreate: boolean;
  canResolve: boolean;
};

const CATEGORIES: Array<{ id: DamageReport["category"]; key: string }> = [
  { id: "normal", key: "catNormal" },
  { id: "note", key: "catNote" },
  { id: "problem", key: "catProblem" },
  { id: "damage", key: "catDamage" },
];

const CATEGORY_STYLE: Record<DamageReport["category"], string> = {
  normal: "bg-success-50 text-success-700",
  note: "bg-secondary-50 text-secondary-700",
  problem: "bg-warning-50 text-warning-700",
  damage: "bg-error-50 text-error-700",
};

export function DamageReportsCard({
  propertyId,
  orgId,
  reports,
  signedUrlsByPath,
  canCreate,
  canResolve,
}: Props) {
  const t = useTranslations("damage");
  const router = useRouter();
  const f = useFormat();
  const supabase = createSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<{
    category: DamageReport["category"];
    severity: number;
    description: string;
    photo_paths: string[];
  }>({
    category: "note",
    severity: 2,
    description: "",
    photo_paths: [],
  });

  const filtered = reports.filter((r) => {
    if (filter === "open") return !r.resolved;
    if (filter === "resolved") return r.resolved;
    return true;
  });

  async function uploadPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Spec §4.5 — 20-photo cap per damage report. Apply against the
    // photos already attached to this in-progress report.
    const incoming = Array.from(files);
    const { kept, dropped } = enforcePhotoCap(
      form.photo_paths,
      incoming,
      MAX_PHOTOS_PER_ASSIGNMENT,
    );
    if (dropped > 0) {
      toast.error(t("limitReached", { dropped }));
    }
    if (kept.length === 0) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const newPaths: string[] = [];
      for (const original of kept) {
        const file = await compressImage(original);
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${orgId}/${propertyId}/damage/${Date.now()}-${Math.random()
          .toString(16)
          .slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage
          .from("property-photos")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (error) {
          toast.error(error.message);
          continue;
        }
        newPaths.push(path);
      }
      setForm((f) => ({ ...f, photo_paths: [...f.photo_paths, ...newPaths] }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function submit() {
    if (form.description.trim().length < 3) {
      toast.error(t("descriptionTooShort"));
      return;
    }
    start(async () => {
      const r = await createDamageReportAction({
        property_id: propertyId,
        category: form.category,
        severity: form.severity,
        description: form.description.trim(),
        photo_paths: form.photo_paths,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("submitted"));
      setOpen(false);
      setForm({
        category: "note",
        severity: 2,
        description: "",
        photo_paths: [],
      });
      router.refresh();
    });
  }

  function toggleResolved(id: string, currentlyResolved: boolean) {
    start(async () => {
      const r = await resolveDamageReportAction({
        id,
        resolved: !currentlyResolved,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(currentlyResolved ? t("reopened") : t("resolved"));
      router.refresh();
    });
  }

  function discuss(id: string) {
    start(async () => {
      const r = await discussDamageReportAction(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(t("postedToChat"));
      // Deep-link to the channel.
      router.push(`${routes.chat}/${r.data.channel_id}` as never);
    });
  }

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 p-5">
        <div>
          <h3 className="text-[15px] font-semibold text-neutral-800">
            {t("title")}
          </h3>
          <p className="mt-0.5 text-[12px] text-neutral-500">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-neutral-200 bg-white p-0.5 text-[12px]">
            {(["all", "open", "resolved"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded px-2.5 py-1 font-medium transition",
                  filter === f
                    ? "bg-primary-500 text-white"
                    : "text-neutral-600 hover:text-neutral-800",
                )}
              >
                {t(`filter.${f}` as never)}
              </button>
            ))}
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="btn btn--primary"
            >
              {t("logReport")}
            </button>
          )}
        </div>
      </header>

      <div className="p-5">
        {filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-200 p-8 text-center text-[13px] text-neutral-500">
            {t("empty")}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "rounded-md border p-4",
                  r.resolved
                    ? "border-neutral-100 bg-neutral-50"
                    : "border-neutral-200 bg-white",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                          CATEGORY_STYLE[r.category],
                        )}
                      >
                        {t(`cat${cap(r.category)}` as never)}
                      </span>
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-mono text-neutral-700">
                        S{r.severity}
                      </span>
                      {r.resolved && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[10px] font-semibold text-success-700">
                          ✓ {t("resolvedTag")}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[13px] leading-[1.55] text-neutral-800">
                      {r.description}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
                      <span>{f.dateTime(r.created_at)}</span>
                      {r.employee_name && <span>· {r.employee_name}</span>}
                    </div>
                    {r.photo_paths.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {r.photo_paths.map((p) => {
                          const url = signedUrlsByPath[p];
                          if (!url) return null;
                          return (
                            <a
                              key={p}
                              href={url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="relative block h-[72px] w-[72px] overflow-hidden rounded-md border border-neutral-200"
                            >
                              <Image
                                src={url}
                                alt=""
                                fill
                                sizes="72px"
                                unoptimized
                                className="object-cover"
                              />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <button
                      type="button"
                      onClick={() => discuss(r.id)}
                      disabled={pending}
                      title={t("discussTitle")}
                      className="btn btn--ghost border border-neutral-200 bg-white"
                    >
                      💬 {t("discuss")}
                    </button>
                    {canResolve && (
                      <button
                        type="button"
                        onClick={() => toggleResolved(r.id, r.resolved)}
                        disabled={pending}
                        className={cn(
                          "btn",
                          r.resolved
                            ? "btn--ghost border border-neutral-200"
                            : "btn--tertiary",
                        )}
                      >
                        {r.resolved ? t("reopen") : t("markResolved")}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-[520px] rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="border-b border-neutral-100 p-5">
              <h4 className="text-[16px] font-semibold text-neutral-800">
                {t("modalTitle")}
              </h4>
              <p className="mt-1 text-[12px] text-neutral-500">
                {t("modalSubtitle")}
              </p>
            </header>
            <div className="flex flex-col gap-4 p-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-neutral-700">
                  {t("category")}
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, category: c.id }))
                      }
                      className={cn(
                        "rounded-md border px-2.5 py-2 text-[12px] font-medium transition",
                        form.category === c.id
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                      )}
                    >
                      {t(c.key as never)}
                    </button>
                  ))}
                </div>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-neutral-700">
                  {t("severity")} ({form.severity})
                </span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={form.severity}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      severity: Number(e.target.value),
                    }))
                  }
                  className="w-full"
                />
                <div className="flex justify-between text-[11px] text-neutral-500">
                  <span>{t("severityLow")}</span>
                  <span>{t("severityHigh")}</span>
                </div>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-neutral-700">
                  {t("description")}
                </span>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  className="input min-h-[96px]"
                  placeholder={t("descriptionPlaceholder")}
                />
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-neutral-700">
                  {t("photos")}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => uploadPhotos(e.target.files)}
                  className="text-[12px] text-neutral-700"
                />
                {uploading && (
                  <span className="text-[11px] text-neutral-500">
                    {t("uploading")}
                  </span>
                )}
                {form.photo_paths.length > 0 && (
                  <span className="text-[11px] text-success-700">
                    {t("photosAttached", { n: form.photo_paths.length })}
                  </span>
                )}
              </div>
            </div>
            <footer className="flex justify-end gap-2 border-t border-neutral-100 p-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="btn btn--ghost border border-neutral-200"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || uploading}
                className={cn(
                  "btn btn--primary",
                  (pending || uploading) && "opacity-80",
                )}
              >
                {pending ? "…" : t("submit")}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

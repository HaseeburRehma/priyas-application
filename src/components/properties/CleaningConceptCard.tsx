"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { setCleaningConceptAction } from "@/app/actions/property-documents";

type Props = {
  propertyId: string;
  orgId: string;
  cleaningConceptPath: string | null;
  signedUrl: string | null;
  canEdit: boolean;
};

const MAX_BYTES = 25 * 1024 * 1024;

export function CleaningConceptCard({
  propertyId,
  orgId,
  cleaningConceptPath,
  signedUrl,
  canEdit,
}: Props) {
  const t = useTranslations("properties.cleaningConcept");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createSupabaseBrowserClient();

  async function handleUpload(file: File | null) {
    if (!file) return;
    if (!file.type.includes("pdf")) {
      toast.error(t("notPdf"));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("tooLarge"));
      return;
    }
    setUploading(true);
    try {
      // Upload to property-documents bucket.
      const path = `${orgId}/${propertyId}/${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("property-documents")
        .upload(path, file, { upsert: false, contentType: "application/pdf" });
      if (upErr) {
        toast.error(upErr.message);
        return;
      }
      // Tell the server to record the new path.
      const r = await setCleaningConceptAction(propertyId, path);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      // If there was a previous PDF, clean it up (best-effort).
      if (cleaningConceptPath && cleaningConceptPath !== path) {
        await supabase.storage
          .from("property-documents")
          .remove([cleaningConceptPath]);
      }
      toast.success(t("uploaded"));
      router.refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function remove() {
    if (!cleaningConceptPath) return;
    if (!window.confirm(t("confirmRemove"))) return;
    start(async () => {
      const r = await setCleaningConceptAction(propertyId, null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      // Delete the storage object too (best-effort).
      await supabase.storage
        .from("property-documents")
        .remove([cleaningConceptPath]);
      toast.success(t("removed"));
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-neutral-100 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-neutral-800">
            {t("title")}
          </h3>
          <p className="mt-0.5 text-[12px] text-neutral-500">{t("subtitle")}</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || pending}
              className={cn(
                "btn btn--primary",
                (uploading || pending) && "opacity-80",
              )}
            >
              {cleaningConceptPath ? t("replace") : t("upload")}
            </button>
            {cleaningConceptPath && (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="btn btn--ghost border border-error-300 text-error-700 hover:bg-error-50"
              >
                {t("remove")}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="mt-4">
        {cleaningConceptPath ? (
          signedUrl ? (
            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] font-medium text-neutral-700 hover:border-primary-500 hover:text-primary-700"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              {t("openPdf")}
            </a>
          ) : (
            <span className="text-[12px] text-neutral-500">{t("loading")}</span>
          )
        ) : (
          <p className="text-[12px] text-neutral-500">{t("none")}</p>
        )}
      </div>
    </section>
  );
}

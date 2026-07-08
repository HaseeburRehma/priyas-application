"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  removeOrgLogoAction,
  uploadOrgLogoAction,
} from "@/app/actions/uploads";

/**
 * Org-logo tile + Upload / Remove buttons. Admin-only — the parent
 * decides whether to render this component based on `canEdit`.
 *
 * Mirrors the prototype's 72×72 gradient brand tile and falls back
 * to the first letter of the org name when no logo is set.
 */
export function LogoUpload({
  initialUrl,
  fallbackLetter,
  canEdit,
}: {
  initialUrl: string | null;
  fallbackLetter: string;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.company");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);
  const [localBlob, setLocalBlob] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;
    if (localBlob) URL.revokeObjectURL(localBlob);
    const blob = URL.createObjectURL(file);
    setLocalBlob(blob);
    setPreviewUrl(blob);

    const fd = new FormData();
    fd.append("file", file);
    start(async () => {
      const res = await uploadOrgLogoAction(fd);
      if (res.ok) {
        setPreviewUrl(res.url);
        if (localBlob) URL.revokeObjectURL(localBlob);
        setLocalBlob(null);
        toast.success(t("logoUploaded"));
        router.refresh();
      } else {
        setPreviewUrl(initialUrl);
        if (localBlob) URL.revokeObjectURL(localBlob);
        setLocalBlob(null);
        toast.error(res.error);
      }
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleRemove() {
    if (!previewUrl) return;
    start(async () => {
      const res = await removeOrgLogoAction();
      if (res.ok) {
        setPreviewUrl(null);
        if (localBlob) URL.revokeObjectURL(localBlob);
        setLocalBlob(null);
        toast.success(t("logoRemoved"));
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <div className="relative grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 text-[26px] font-bold text-white shadow-md">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt={fallbackLetter}
            fill
            sizes="72px"
            unoptimized
            className="object-contain bg-white"
          />
        ) : (
          <span>{fallbackLetter.toUpperCase()}</span>
        )}
        {pending && (
          <span className="absolute inset-0 grid place-items-center bg-black/40 text-[10px] font-semibold text-white">
            …
          </span>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!canEdit || pending}
          className="btn btn--ghost border border-neutral-200 bg-white btn--sm disabled:opacity-50"
        >
          {pending ? t("logoUploading") : t("uploadLogo")}
        </button>
        {previewUrl && canEdit && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="btn btn--ghost border border-error-100 bg-white text-error-700 hover:bg-error-50 btn--sm disabled:opacity-50"
          >
            {t("logoRemove")}
          </button>
        )}
      </div>
    </>
  );
}

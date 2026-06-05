"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import {
  removeProfileAvatarAction,
  uploadProfileAvatarAction,
} from "@/app/actions/uploads";

/**
 * Avatar tile + upload button.
 *
 * Shows the user's photo if present, otherwise renders the initials
 * tile that the rest of the app uses. Clicking "Change photo" opens
 * a native file picker, posts the file to `uploadProfileAvatarAction`,
 * shows a toast, and the server action's `revalidatePath('/settings')`
 * makes the new avatar visible on the next render.
 *
 * Optimistic preview: we briefly render the local `URL.createObjectURL`
 * blob URL during the upload so the user gets immediate visual
 * feedback without waiting for the round-trip. The blob URL is
 * revoked on cleanup to avoid leaking memory.
 */
export function AvatarUpload({
  initialUrl,
  initials,
  fullName,
}: {
  initialUrl: string | null;
  initials: string;
  fullName: string;
}) {
  const t = useTranslations("settings.account");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);
  const [localBlob, setLocalBlob] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    fileRef.current?.click();
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;

    // Optimistic preview — show the file the user just picked while
    // the upload is in flight. Revoke the previous blob URL if any.
    if (localBlob) URL.revokeObjectURL(localBlob);
    const blob = URL.createObjectURL(file);
    setLocalBlob(blob);
    setPreviewUrl(blob);

    const fd = new FormData();
    fd.append("file", file);

    start(async () => {
      const res = await uploadProfileAvatarAction(fd);
      if (res.ok) {
        setPreviewUrl(res.url);
        if (localBlob) URL.revokeObjectURL(localBlob);
        setLocalBlob(null);
        toast.success(t("avatarUploaded"));
        router.refresh();
      } else {
        // Roll back to the saved URL.
        setPreviewUrl(initialUrl);
        if (localBlob) URL.revokeObjectURL(localBlob);
        setLocalBlob(null);
        toast.error(res.error);
      }
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleRemove() {
    if (!previewUrl && !initialUrl) return;
    start(async () => {
      const res = await removeProfileAvatarAction();
      if (res.ok) {
        setPreviewUrl(null);
        if (localBlob) URL.revokeObjectURL(localBlob);
        setLocalBlob(null);
        toast.success(t("avatarRemoved"));
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-4">
      <span className="relative grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-full bg-secondary-500 text-[22px] font-bold text-white shadow-md">
        {previewUrl ? (
          // next/image with `fill` so it always covers the 68×68 circle
          // regardless of the source aspect ratio. `unoptimized` because
          // these are user-uploaded URLs from Supabase public storage —
          // the optimizer would re-encode every request.
          <Image
            src={previewUrl}
            alt={fullName}
            fill
            sizes="68px"
            unoptimized
            className="object-cover"
            // The browser caches by URL; the action sets a new path on
            // every upload (epoch timestamp prefix) so the new image
            // is automatically picked up — no cache-busting query
            // string needed.
          />
        ) : (
          <span>{initials || "?"}</span>
        )}
        <span
          aria-hidden
          className={cn(
            "absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-white",
            "bg-success-500",
          )}
        />
        {pending && (
          <span className="absolute inset-0 grid place-items-center bg-black/40 text-[10px] font-semibold text-white">
            …
          </span>
        )}
      </span>
      <div className="flex flex-col gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={openPicker}
          disabled={pending}
          className="btn btn--ghost border border-neutral-200 bg-white btn--sm disabled:opacity-50"
        >
          {pending ? t("avatarUploading") : t("changePhoto")}
        </button>
        {previewUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="text-left text-[11px] font-medium text-error-700 hover:underline disabled:opacity-50"
          >
            {t("removePhoto")}
          </button>
        )}
      </div>
    </div>
  );
}

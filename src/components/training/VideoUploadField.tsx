"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Direct-to-Storage video upload control. The component sits next to the
 * existing video URL text input in the training-module form and writes the
 * resulting public URL back into the parent's form state via `onUploaded`.
 *
 * Bucket convention:
 *   `training-videos` — public bucket, MIME-restricted to video/* server-side.
 *   Path: `<org_id>/<random>.<ext>` so videos from one org can't collide.
 *
 * Why direct upload (not via a server action):
 *   - Vercel server actions have a 4.5 MB body cap on Hobby/Pro. Training
 *     videos are typically 20-200 MB. Direct upload to Storage bypasses this
 *     entirely.
 *   - The browser SDK keeps the user's session, so RLS / bucket policies
 *     authenticate the upload as the signed-in PM.
 */
const BUCKET = "training-videos";
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB — generous safety cap.

export function VideoUploadField({
  orgId,
  onUploaded,
}: {
  orgId: string;
  onUploaded: (publicUrl: string) => void;
}) {
  const t = useTranslations("training.modules.upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("video/")) {
      toast.error(t("notVideo"));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("tooLarge", { mb: Math.round(MAX_BYTES / 1024 / 1024) }));
      return;
    }
    setPending(true);
    setProgress(0);
    try {
      const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase().slice(0, 5);
      const random = Math.random().toString(36).slice(2, 12);
      const path = `${orgId}/${Date.now()}-${random}.${ext}`;

      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
      if (error) throw error;

      // Public URL — the bucket is configured public so field staff can
      // stream without per-request signed URLs. If you flip the bucket to
      // private later, swap `getPublicUrl` for `createSignedUrl(path, 3600)`.
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onUploaded(pub.publicUrl);
      toast.success(t("success"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "upload_failed";
      toast.error(t("failed", { msg }));
    } finally {
      setPending(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        disabled={pending}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
        className="block w-full text-[12px] text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-secondary-500 file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-white file:hover:bg-secondary-600 disabled:opacity-50"
      />
      <p className="text-[11px] text-neutral-500">
        {pending
          ? t("uploading", { pct: progress ?? 0 })
          : t("hint", { mb: Math.round(MAX_BYTES / 1024 / 1024) })}
      </p>
    </div>
  );
}

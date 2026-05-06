"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  deletePropertyPhotoAction,
  recordPropertyPhotoAction,
} from "@/app/actions/property-photos";

type Photo = {
  id: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
  signedUrl: string | null;
};

type Props = {
  propertyId: string;
  orgId: string;
  initialPhotos: Photo[];
  canEdit: boolean;
  canDelete: boolean;
};

export function PropertyPhotosCard({
  propertyId,
  orgId,
  initialPhotos,
  canEdit,
  canDelete,
}: Props) {
  const t = useTranslations("properties.photos");
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const supabase = createSupabaseBrowserClient();

  // Re-sync if parent re-renders with fresh photos.
  useEffect(() => {
    setPhotos(initialPhotos);
  }, [initialPhotos]);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${orgId}/${propertyId}/${Date.now()}-${Math.random()
          .toString(16)
          .slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("property-photos")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) {
          toast.error(upErr.message);
          continue;
        }
        const r = await recordPropertyPhotoAction({
          property_id: propertyId,
          storage_path: path,
          caption: "",
        });
        if (!r.ok) {
          toast.error(r.error);
          continue;
        }
      }
      toast.success(t("uploadedSuccess"));
      router.refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function remove(p: Photo) {
    if (!confirm(t("deleteConfirm"))) return;
    start(async () => {
      const r = await deletePropertyPhotoAction(p.id, propertyId, p.storage_path);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setPhotos((prev) => prev.filter((x) => x.id !== p.id));
      toast.success(t("deleted"));
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 p-5">
        <div>
          <h3 className="text-[15px] font-semibold text-neutral-800">
            {t("title")}
          </h3>
          <div className="mt-0.5 text-[12px] text-neutral-500">
            {t("subtitle", { count: photos.length })}
          </div>
        </div>
        {canEdit && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => onFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={cn("btn btn--tertiary", uploading && "opacity-80")}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5-5 5 5M12 5v12" />
              </svg>
              {uploading ? t("uploading") : t("upload")}
            </button>
          </>
        )}
      </header>

      <div className="p-5">
        {photos.length === 0 && (
          <div className="grid place-items-center rounded-md border-2 border-dashed border-neutral-200 px-6 py-10 text-center">
            <div className="mb-2 text-[13px] font-medium text-neutral-700">
              {t("emptyTitle")}
            </div>
            <div className="text-[12px] text-neutral-500">
              {t("emptyBody")}
            </div>
          </div>
        )}

        {photos.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((p) => (
              <figure
                key={p.id}
                className="group relative overflow-hidden rounded-md border border-neutral-100 bg-neutral-50"
              >
                {p.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.signedUrl}
                    alt={p.caption ?? ""}
                    className="h-32 w-full object-cover"
                  />
                ) : (
                  <div className="grid h-32 place-items-center text-[10px] text-neutral-400">
                    —
                  </div>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    disabled={pending}
                    aria-label={t("delete")}
                    className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-white/90 text-neutral-500 opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 hover:text-error-700"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5"
                    >
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                    </svg>
                  </button>
                )}
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

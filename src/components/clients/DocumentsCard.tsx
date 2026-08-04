"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import {
  deleteClientDocumentAction,
  signClientDocumentUrlAction,
  uploadClientDocumentAction,
} from "@/app/actions/client-documents";
import type {
  ClientDocument,
  ClientDocumentCategory,
} from "@/lib/api/client-documents";

const CATEGORIES: ClientDocumentCategory[] = [
  "contract",
  "form",
  "decision",
  "id_card",
  "invoice",
  "photo",
  "other",
];

type Props = {
  clientId: string;
  documents: ClientDocument[];
  canEdit: boolean;
};

/**
 * Per-client digital file cabinet.
 *
 * List renders each doc with a category chip, size, uploaded date, and
 * two actions: open (signed URL) and delete (soft-delete).
 * Upload row picks a file + optional category + notes → server action.
 */
export function DocumentsCard({ clientId, documents, canEdit }: Props) {
  const t = useTranslations("clients.documents");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [category, setCategory] = useState<ClientDocumentCategory>("other");
  const [notes, setNotes] = useState("");
  const [opening, setOpening] = useState<string | null>(null);

  function chooseFile() {
    if (!canEdit) return;
    inputRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("clientId", clientId);
    fd.append("category", category);
    if (notes.trim()) fd.append("notes", notes.trim());
    fd.append("file", file);
    start(async () => {
      const r = await uploadClientDocumentAction(fd);
      if (!r.ok) {
        toast.error(t("uploadFailed", { msg: r.error }));
      } else {
        toast.success(t("uploaded", { name: r.data.name }));
        setNotes("");
        router.refresh();
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  async function onOpen(doc: ClientDocument) {
    setOpening(doc.id);
    const r = await signClientDocumentUrlAction(doc.id, 60);
    setOpening(null);
    if (!r.ok) {
      toast.error(t("openFailed"));
      return;
    }
    // Signed URLs open in a new tab so we don't clobber the client
    // detail page. The URL expires in 60s — plenty for the browser
    // to fetch + start rendering the PDF/image.
    window.open(r.data.url, "_blank", "noopener");
  }

  function onDelete(doc: ClientDocument) {
    if (!confirm(t("deleteConfirm", { name: doc.name }))) return;
    start(async () => {
      const r = await deleteClientDocumentAction(doc.id);
      if (!r.ok) {
        toast.error(t("deleteFailed"));
      } else {
        toast.success(t("deleted"));
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
        <div>
          <h3 className="text-[15px] font-semibold text-neutral-800">
            {t("title")}
          </h3>
          <p className="mt-0.5 text-[12px] text-neutral-500">
            {t("subtitle", { n: documents.length })}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as ClientDocumentCategory)
              }
              disabled={pending}
              className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px]"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`category.${c}` as never)}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
              placeholder={t("notesPlaceholder")}
              className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] w-48"
            />
            <button
              type="button"
              onClick={chooseFile}
              disabled={pending}
              className={cn(
                "btn btn--primary btn--sm",
                pending && "opacity-70",
              )}
            >
              {pending ? t("uploading") : t("uploadCta")}
            </button>
            <input
              ref={inputRef}
              type="file"
              onChange={onFile}
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx"
            />
          </div>
        )}
      </header>

      {documents.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-neutral-500">
          {t("empty")}
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {documents.map((d) => (
            <li
              key={d.id}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-5 py-3"
            >
              <span
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-md text-[11px] font-bold",
                  categoryColour(d.category),
                )}
                title={t(`category.${d.category}` as never)}
              >
                {categoryLetter(d.category)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-neutral-800">
                  {d.name}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                  <span>{t(`category.${d.category}` as never)}</span>
                  <span>·</span>
                  <span>{fmtBytes(d.size_bytes)}</span>
                  <span>·</span>
                  <span className="font-mono">
                    {new Date(d.uploaded_at).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  {d.notes && (
                    <>
                      <span>·</span>
                      <span className="italic">{d.notes}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpen(d)}
                disabled={opening === d.id}
                className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                {opening === d.id ? t("openingCta") : t("openCta")}
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onDelete(d)}
                  disabled={pending}
                  className="rounded-md border border-error-100 bg-white px-2.5 py-1 text-[12px] font-medium text-error-700 hover:bg-error-50 disabled:opacity-50"
                >
                  {t("deleteCta")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function categoryColour(c: ClientDocumentCategory): string {
  switch (c) {
    case "contract":
      return "bg-primary-50 text-primary-700";
    case "form":
      return "bg-secondary-50 text-secondary-700";
    case "decision":
      return "bg-warning-50 text-warning-700";
    case "id_card":
      return "bg-error-50 text-error-700";
    case "invoice":
      return "bg-success-50 text-success-700";
    case "photo":
      return "bg-secondary-50 text-secondary-700";
    default:
      return "bg-neutral-100 text-neutral-600";
  }
}

function categoryLetter(c: ClientDocumentCategory): string {
  switch (c) {
    case "contract":
      return "V";
    case "form":
      return "F";
    case "decision":
      return "B";
    case "id_card":
      return "ID";
    case "invoice":
      return "R";
    case "photo":
      return "P";
    default:
      return "•";
  }
}

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

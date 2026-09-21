"use client";

/**
 * "My Files & Notes" widget for the PM dashboard (feature-update #19).
 *
 * Lives at the top of `/dashboard` for admin + dispatcher only —
 * `time.read_all` gate on the parent page keeps field staff out.
 *
 * Two panels side by side (stacked on mobile):
 *   * Notes  — title + body, pinnable; inline compose form at the top
 *              of the list
 *   * Files  — drop / click-to-upload; every row shows the name +
 *              type + created-at with download and delete buttons
 *
 * All actions are server actions in src/app/actions/pm-widget.ts.
 * The widget refreshes via `router.refresh()` after every mutation so
 * the server-side page re-renders with the fresh data — this matches
 * the pattern used by the rest of the dashboard cards.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  savePmNoteAction,
  deletePmNoteAction,
  uploadPmFileAction,
  deletePmFileAction,
  signPmFileUrlAction,
} from "@/app/actions/pm-widget";
import type { PmNote, PmFile } from "@/lib/api/pm-widget";
import { cn } from "@/lib/utils/cn";

type Props = {
  notes: PmNote[];
  files: PmFile[];
};

export function MyFilesAndNotesWidget({ notes, files }: Props) {
  return (
    <section className="mb-6 rounded-lg border border-primary-200 bg-white shadow-xs">
      <header className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4">
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-md bg-primary-50 text-primary-700"
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
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6M8 13h8M8 17h6M8 9h1" />
          </svg>
        </span>
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold text-secondary-500">
            Meine Dateien &amp; Notizen
          </h2>
          <p className="text-[12px] text-neutral-500">
            Persönliche Ablage — nur du siehst diese Einträge
          </p>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-neutral-100">
        <NotesPanel notes={notes} />
        <FilesPanel files={files} />
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Notes panel
 * ──────────────────────────────────────────────────────────────── */

function NotesPanel({ notes }: { notes: PmNote[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // useTransition callbacks must return Promise<void> — toast.*
  // returns string|number so we swallow the return value with `void`
  // rather than propagating it up the arrow.
  function saveNew() {
    if (!body.trim()) {
      toast.error("Notiz darf nicht leer sein");
      return;
    }
    start(async () => {
      const res = await savePmNoteAction({ title, body, pinned: false });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTitle("");
      setBody("");
      toast.success("Notiz gespeichert");
      router.refresh();
    });
  }

  function togglePin(note: PmNote) {
    start(async () => {
      const res = await savePmNoteAction({
        id: note.id,
        title: note.title ?? "",
        body: note.body,
        pinned: !note.pinned,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function remove(note: PmNote) {
    if (!confirm("Diese Notiz löschen?")) return;
    start(async () => {
      const res = await deletePmNoteAction(note.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Notiz gelöscht");
      router.refresh();
    });
  }

  return (
    <div className="p-5">
      <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-500">
        Notizen ({notes.length})
      </h3>
      <div className="mb-4 space-y-2 rounded-md border border-neutral-100 bg-neutral-50 p-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titel (optional)"
          className="input"
          disabled={pending}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Neue Notiz…"
          rows={2}
          className="input min-h-[60px]"
          disabled={pending}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveNew}
            disabled={pending || !body.trim()}
            className="rounded-md bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white shadow-xs transition hover:bg-primary-600 disabled:opacity-60"
          >
            {pending ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
      {notes.length === 0 ? (
        <p className="text-[13px] italic text-neutral-500">
          Noch keine Notizen. Nutze das Feld oben, um deine erste anzulegen.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className={cn(
                "rounded-md border p-3",
                n.pinned
                  ? "border-warning-200 bg-warning-50/50"
                  : "border-neutral-100 bg-white",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {n.title && (
                    <div className="text-[13px] font-semibold text-neutral-800">
                      {n.title}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap text-[13px] text-neutral-700">
                    {n.body}
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-400">
                    {new Date(n.updated_at).toLocaleString("de-DE")}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => togglePin(n)}
                    disabled={pending}
                    title={n.pinned ? "Nicht mehr anpinnen" : "Anpinnen"}
                    className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-warning-600"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill={n.pinned ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5"
                    >
                      <path d="M12 17v5M9 3h6l-1 6 5 3v3H5v-3l5-3z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(n)}
                    disabled={pending}
                    title="Löschen"
                    className="rounded p-1 text-neutral-400 hover:bg-error-50 hover:text-error-600"
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
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Files panel
 * ──────────────────────────────────────────────────────────────── */

function FilesPanel({ files }: { files: PmFile[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dragOver, setDragOver] = useState(false);

  function upload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    // Strict noUncheckedIndexedAccess makes `fileList[0]` File|undefined
    // — the length check above already handles the empty case; the
    // explicit guard here is what makes tsc happy.
    const file = fileList[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    start(async () => {
      const res = await uploadPmFileAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${file.name} hochgeladen`);
      router.refresh();
    });
  }

  function remove(file: PmFile) {
    if (!confirm(`${file.name} löschen?`)) return;
    start(async () => {
      const res = await deletePmFileAction(file.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Datei gelöscht");
      router.refresh();
    });
  }

  async function download(file: PmFile) {
    const res = await signPmFileUrlAction(file.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    // Opens in a new tab; the browser handles Content-Disposition.
    window.open(res.data.url, "_blank", "noopener");
  }

  return (
    <div className="p-5">
      <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-500">
        Dateien ({files.length})
      </h3>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          upload(e.dataTransfer.files);
        }}
        className={cn(
          "mb-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-6 text-[13px] transition",
          dragOver
            ? "border-primary-500 bg-primary-50 text-primary-700"
            : "border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-primary-500 hover:text-primary-600",
          pending && "cursor-wait opacity-60",
        )}
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
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
        </svg>
        <span>
          {pending ? "Hochladen…" : "Datei ablegen oder klicken (max. 25 MB)"}
        </span>
        <input
          type="file"
          className="hidden"
          onChange={(e) => upload(e.target.files)}
          disabled={pending}
        />
      </label>
      {files.length === 0 ? (
        <p className="text-[13px] italic text-neutral-500">
          Noch keine Dateien. Lade z. B. Betriebsnummern oder wichtige PDFs
          hoch — nur du siehst sie.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]",
                f.pinned
                  ? "border-warning-200 bg-warning-50/50"
                  : "border-neutral-100 bg-white",
              )}
            >
              <span
                aria-hidden
                className="grid h-7 w-7 shrink-0 place-items-center rounded bg-neutral-100 text-neutral-500"
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
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-neutral-800">
                  {f.name}
                </div>
                <div className="text-[11px] text-neutral-400">
                  {formatBytes(f.size_bytes)} ·{" "}
                  {new Date(f.created_at).toLocaleDateString("de-DE")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => download(f)}
                disabled={pending}
                title="Herunterladen"
                className="rounded p-1 text-neutral-500 hover:bg-primary-50 hover:text-primary-600"
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
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => remove(f)}
                disabled={pending}
                title="Löschen"
                className="rounded p-1 text-neutral-400 hover:bg-error-50 hover:text-error-600"
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

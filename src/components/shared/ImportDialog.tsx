"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";

type Stage = "upload" | "preview" | "committing" | "done";

type ImportError = {
  row: number;
  column?: string;
  message: string;
};

type ImportResult = {
  totalRows: number;
  validCount: number;
  errorCount: number;
  insertedCount: number;
  skippedCount: number;
  errors: ImportError[];
  durationMs: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Module-scoped API path, e.g. "/api/properties/import". */
  endpoint: string;
  /** Same path; GET returns the template CSV. */
  templateUrl: string;
  /** Logical name, used as the title fallback (e.g. "properties"). */
  moduleName: string;
};

/**
 * Three-stage modal:
 *   1. Upload  — file picker / drag-drop + "Download template" link.
 *   2. Preview — calls `?dryRun=1`, shows summary + error list.
 *   3. Commit  — calls without dryRun, then summarises.
 *
 * Concurrency on the server is 1 — we simply show a spinner with the row
 * count rather than a per-row progress bar.
 */
export function ImportDialog({
  open,
  onClose,
  endpoint,
  templateUrl,
  moduleName,
}: Props) {
  const t = useTranslations("import");
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [final, setFinal] = useState<ImportResult | null>(null);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset when the dialog is reopened.
  useEffect(() => {
    if (!open) return;
    setStage("upload");
    setFile(null);
    setPreview(null);
    setFinal(null);
    setErrorsOnly(false);
    setServerError(null);
  }, [open]);

  // Lock body scroll while open + ESC to close.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && stage !== "committing") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, stage]);

  const submitDryRun = useCallback(
    async (f: File) => {
      setServerError(null);
      try {
        const form = new FormData();
        form.append("file", f);
        const res = await fetch(`${endpoint}?dryRun=1`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setServerError(body?.error ?? `HTTP ${res.status}`);
          setStage("upload");
          return;
        }
        const data = (await res.json()) as ImportResult;
        setPreview(data);
        setStage("preview");
      } catch (err) {
        setServerError(err instanceof Error ? err.message : "Network error");
        setStage("upload");
      }
    },
    [endpoint],
  );

  const submitCommit = useCallback(async () => {
    if (!file) return;
    setStage("committing");
    setServerError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(endpoint, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setServerError(body?.error ?? `HTTP ${res.status}`);
        setStage("preview");
        return;
      }
      const data = (await res.json()) as ImportResult;
      setFinal(data);
      setStage("done");
      toast.success(
        t("success", {
          inserted: data.insertedCount,
          skipped: data.skippedCount,
        }),
      );
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Network error");
      setStage("preview");
    }
  }, [endpoint, file, router, t]);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const f = files[0];
      if (!f) return;
      // Cheap client-side guard. Server still enforces the real limit.
      if (f.size > 5 * 1024 * 1024) {
        setServerError(t("errors.tooLarge"));
        return;
      }
      const okType =
        f.type === "text/csv" ||
        f.type === "application/vnd.ms-excel" ||
        f.name.toLowerCase().endsWith(".csv");
      if (!okType) {
        setServerError(t("errors.notCsv"));
        return;
      }
      setFile(f);
      void submitDryRun(f);
    },
    [submitDryRun, t],
  );

  const visibleErrors = useMemo(() => {
    const list = preview?.errors ?? final?.errors ?? [];
    return list.slice(0, 50);
  }, [preview, final]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && stage !== "committing") onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-[680px] flex-col overflow-hidden rounded-t-xl border border-neutral-100 bg-white shadow-lg sm:rounded-xl">
        <header className="flex items-start justify-between gap-3 border-b border-neutral-100 px-6 pb-4 pt-5">
          <div>
            <h2 className="text-[18px] font-bold text-secondary-500">
              {t("title", { module: moduleName })}
            </h2>
            <p className="mt-0.5 text-[12px] text-neutral-500">
              {t("subtitle")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("cancel")}
            onClick={onClose}
            disabled={stage === "committing"}
            className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-700 disabled:opacity-40"
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
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex flex-col overflow-y-auto">
          {/* --------------------- Stage 1: Upload --------------------- */}
          {stage === "upload" && (
            <div className="p-6">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFiles(e.dataTransfer.files);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center transition",
                  dragging
                    ? "border-primary-500 bg-tertiary-200"
                    : "border-neutral-200 bg-neutral-50",
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-8 w-8 text-neutral-400"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5-5 5 5M12 5v12" />
                </svg>
                <p className="text-[13px] font-medium text-neutral-700">
                  {t("dropHere")}
                </p>
                <p className="text-[12px] text-neutral-500">{t("or")}</p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="btn btn--tertiary"
                >
                  {t("chooseFile")}
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>

              <div className="mt-4 flex items-center justify-between text-[12px] text-neutral-500">
                <a
                  href={templateUrl}
                  className="text-primary-600 hover:underline"
                  download
                >
                  {t("template")}
                </a>
                <span>{t("maxSize")}</span>
              </div>

              {serverError && (
                <div className="mt-4 rounded-md border border-error-200 bg-error-50 px-3 py-2 text-[12px] text-error-700">
                  {serverError}
                </div>
              )}
            </div>
          )}

          {/* --------------------- Stage 2: Preview --------------------- */}
          {stage === "preview" && preview && (
            <div className="p-6">
              <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                <Stat
                  label={t("totalRows")}
                  value={preview.totalRows}
                  tone="muted"
                />
                <Stat
                  label={t("validRows")}
                  value={preview.validCount}
                  tone="up"
                />
                <Stat
                  label={t("errorRows")}
                  value={preview.errorCount}
                  tone={preview.errorCount > 0 ? "warn" : "muted"}
                />
              </div>

              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-neutral-700">
                  {t("errors.head")}
                </h3>
                <label className="flex items-center gap-2 text-[12px] text-neutral-600">
                  <input
                    type="checkbox"
                    checked={errorsOnly}
                    onChange={(e) => setErrorsOnly(e.target.checked)}
                  />
                  {t("errors.onlyToggle")}
                </label>
              </div>

              {visibleErrors.length === 0 ? (
                <p className="rounded-md border border-success-200 bg-success-50 px-3 py-2 text-[12px] text-success-700">
                  {t("errors.none")}
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border border-neutral-200">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr className="bg-neutral-50 text-left text-neutral-500">
                        <th className="px-3 py-2 font-semibold">
                          {t("errors.row")}
                        </th>
                        <th className="px-3 py-2 font-semibold">
                          {t("errors.column")}
                        </th>
                        <th className="px-3 py-2 font-semibold">
                          {t("errors.message")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleErrors.map((err, i) => (
                        <tr
                          key={`${err.row}-${i}`}
                          className="border-t border-neutral-100"
                        >
                          <td className="px-3 py-1.5 text-neutral-700">
                            {err.row}
                          </td>
                          <td className="px-3 py-1.5 text-neutral-500">
                            {err.column ?? "—"}
                          </td>
                          <td className="px-3 py-1.5 text-error-700">
                            {err.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.errors.length > 50 && (
                    <p className="border-t border-neutral-100 bg-neutral-50 px-3 py-1.5 text-[11px] text-neutral-500">
                      {t("errors.more", {
                        more: preview.errors.length - 50,
                      })}
                    </p>
                  )}
                </div>
              )}

              {serverError && (
                <div className="mt-4 rounded-md border border-error-200 bg-error-50 px-3 py-2 text-[12px] text-error-700">
                  {serverError}
                </div>
              )}
            </div>
          )}

          {/* --------------------- Stage 3: Committing --------------------- */}
          {stage === "committing" && preview && (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <Spinner />
              <p className="text-[13px] font-medium text-neutral-700">
                {t("importingN", { count: preview.validCount })}
              </p>
              <p className="text-[12px] text-neutral-500">{t("pleaseWait")}</p>
            </div>
          )}

          {/* --------------------- Stage 4: Done --------------------- */}
          {stage === "done" && final && (
            <div className="p-6">
              <div className="mb-4 rounded-md border border-success-200 bg-success-50 px-3 py-2 text-[13px] font-medium text-success-700">
                {t("success", {
                  inserted: final.insertedCount,
                  skipped: final.skippedCount,
                })}
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat
                  label={t("totalRows")}
                  value={final.totalRows}
                  tone="muted"
                />
                <Stat
                  label={t("insertedRows")}
                  value={final.insertedCount}
                  tone="up"
                />
                <Stat
                  label={t("skippedRows")}
                  value={final.skippedCount}
                  tone={final.skippedCount > 0 ? "warn" : "muted"}
                />
              </div>
              {final.errors.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-md border border-neutral-200">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr className="bg-neutral-50 text-left text-neutral-500">
                        <th className="px-3 py-2 font-semibold">
                          {t("errors.row")}
                        </th>
                        <th className="px-3 py-2 font-semibold">
                          {t("errors.message")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {final.errors.slice(0, 50).map((err, i) => (
                        <tr
                          key={`${err.row}-${i}`}
                          className="border-t border-neutral-100"
                        >
                          <td className="px-3 py-1.5 text-neutral-700">
                            {err.row}
                          </td>
                          <td className="px-3 py-1.5 text-error-700">
                            {err.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-neutral-100 bg-white px-6 py-4">
          {stage === "upload" && (
            <button
              type="button"
              onClick={onClose}
              className="btn btn--ghost border border-neutral-200"
            >
              {t("cancel")}
            </button>
          )}
          {stage === "preview" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  setStage("upload");
                }}
                className="btn btn--ghost border border-neutral-200"
              >
                {t("back")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn btn--ghost border border-neutral-200"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={submitCommit}
                disabled={(preview?.validCount ?? 0) === 0}
                className={cn(
                  "btn btn--primary",
                  (preview?.validCount ?? 0) === 0 && "opacity-60",
                )}
              >
                {t("commit", { count: preview?.validCount ?? 0 })}
              </button>
            </>
          )}
          {stage === "committing" && (
            <button
              type="button"
              disabled
              className="btn btn--primary opacity-80"
            >
              {t("committing")}
            </button>
          )}
          {stage === "done" && (
            <button
              type="button"
              onClick={onClose}
              className="btn btn--primary"
            >
              {t("close")}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "up" | "warn" | "muted";
}) {
  const subColor =
    tone === "up"
      ? "text-success-500"
      : tone === "warn"
        ? "text-warning-700"
        : "text-neutral-500";
  return (
    <div className="rounded-md border border-neutral-100 bg-neutral-50 p-3">
      <div className={`text-[20px] font-bold ${subColor}`}>{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-[0.04em] text-neutral-500">
        {label}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-8 w-8 animate-spin text-primary-500"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="4"
      />
      <path
        d="M12 2a10 10 0 0110 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

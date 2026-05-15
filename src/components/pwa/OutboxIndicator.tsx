"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { list, type OutboxEntry } from "@/lib/pwa/outbox";

function formatAge(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

/**
 * Small badge that shows the count of queued mutations in the topbar.
 * Click toggles a dropdown listing each entry. Auto-refreshes on
 * `outbox-progress` messages from the service worker.
 */
export function OutboxIndicator() {
  const t = useTranslations("outbox");
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  const refresh = useCallback(async () => {
    const items = await list();
    setEntries(items);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    void refresh();
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const onMessage = (e: MessageEvent) => {
      const data = (e.data ?? {}) as { type?: string };
      if (data.type === "outbox-progress") {
        void refresh();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    // Cheap polling fallback when SW messaging is unavailable.
    const id = window.setInterval(() => {
      void refresh();
    }, 15_000);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.clearInterval(id);
    };
  }, [refresh]);

  const onRetry = useCallback(() => {
    if (typeof navigator === "undefined") return;
    const ctrl = navigator.serviceWorker?.controller;
    if (ctrl) {
      ctrl.postMessage({ type: "replay" });
    }
    void refresh();
  }, [refresh]);

  if (!entries.length) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("pendingAria", { count: entries.length })}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-warning-50 px-2.5 text-[12px] font-semibold text-warning-700 transition hover:opacity-90"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[14px] w-[14px]"
        >
          <circle cx={12} cy={12} r={10} />
          <path d="M12 6v6l4 2" />
        </svg>
        <span>{t("pendingCount", { count: entries.length })}</span>
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-11 z-30 w-[320px] rounded-lg border border-neutral-100 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-secondary-500">
              {t("title")}
            </h3>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md bg-primary-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-primary-600"
            >
              {t("retryNow")}
            </button>
          </div>
          <ul className="max-h-[260px] space-y-1 overflow-auto">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-md bg-neutral-50 px-2 py-1.5 text-[12px]"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="mr-1 inline-block rounded bg-neutral-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-neutral-700">
                    {e.method}
                  </span>
                  <span className="text-neutral-600">
                    {(() => {
                      try {
                        return new URL(e.url).pathname;
                      } catch {
                        return e.url;
                      }
                    })()}
                  </span>
                </span>
                <span className="flex-shrink-0 text-neutral-400">
                  {formatAge(now - e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";

/**
 * Rendered inside /offline. Client component so the Retry button can
 * trigger a hard reload — and so we can localise the strings without
 * triggering a server fetch on the offline shell.
 */
export function OfflineContent() {
  const t = useTranslations("offline");

  function onRetry() {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  return (
    <div className="card max-w-lg p-8 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-warning-50 text-warning-700">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
          <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0122.58 9" />
          <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
          <path d="M8.53 16.11a6 6 0 016.95 0" />
          <path d="M12 20h.01" />
        </svg>
      </div>

      <h1 className="mb-1 text-[20px] font-bold text-secondary-500">
        {t("title")}
      </h1>
      <p className="mb-5 text-[13px] text-neutral-500">{t("body")}</p>

      <div className="mb-6 grid gap-3 text-left">
        <section className="rounded-md border border-neutral-100 bg-success-50 p-3">
          <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-success-700">
            {t("availableTitle")}
          </h2>
          <p className="text-[13px] text-neutral-700">{t("availableBody")}</p>
        </section>
        <section className="rounded-md border border-neutral-100 bg-warning-50 p-3">
          <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-warning-700">
            {t("queuedTitle")}
          </h2>
          <p className="text-[13px] text-neutral-700">{t("queuedBody")}</p>
        </section>
      </div>

      <button type="button" onClick={onRetry} className="btn btn--primary">
        {t("retry")}
      </button>
    </div>
  );
}

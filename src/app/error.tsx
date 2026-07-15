"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { routes } from "@/lib/constants/routes";

/**
 * App-wide error boundary. Catches any error thrown while rendering a
 * page or a Server Component further down the tree (this project had no
 * error.tsx / global-error.tsx at all — any thrown error, e.g. a loader
 * hitting an invariant it can't recover from, fell through to Next's
 * bare default error page). Does not catch errors in the root layout
 * itself — see global-error.tsx for that.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary");

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center bg-tertiary-200 px-6">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-error-50 text-error-600">
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
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
        </div>
        <h1 className="mb-2 text-[18px] font-bold text-neutral-900">
          {t("title")}
        </h1>
        <p className="mb-6 text-[13px] text-neutral-500">{t("body")}</p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={reset}
            className="btn btn--primary w-full"
            style={{ minHeight: 44 }}
          >
            {t("retry")}
          </button>
          <a href={routes.dashboard} className="btn btn--ghost w-full border border-neutral-200">
            {t("goDashboard")}
          </a>
        </div>

        {error.digest && (
          <p className="mt-6 font-mono text-[11px] text-neutral-400">
            {t("digestLabel")}: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary — catches errors thrown by the root layout
 * itself (a failure in RootLayout, e.g. next-intl message loading, isn't
 * caught by src/app/error.tsx, which only wraps content *inside* the
 * layout). Next.js requires this file to render its own complete
 * <html>/<body> since it fully replaces the root layout on error.
 *
 * Deliberately dependency-free (no next-intl, no Tailwind component
 * classes, no shared UI components) — if the root layout itself is
 * broken, this page can't assume any of the app's normal providers or
 * built CSS classes are safe to use. Plain inline styles only.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[global-error-boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#eef1ec",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          padding: 24,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "#fff",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 24px" }}>
            The application failed to load. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              width: "100%",
              minHeight: 44,
              borderRadius: 8,
              border: "none",
              background: "#72A94F",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: 24, fontFamily: "monospace", fontSize: 11, color: "#9ca3af" }}>
              Error reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

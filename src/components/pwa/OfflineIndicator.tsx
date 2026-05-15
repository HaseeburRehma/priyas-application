"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Floating badge that surfaces network status. Visible only when the
 * browser reports `navigator.onLine === false`. Auto-dismisses once the
 * `online` event fires.
 */
export function OfflineIndicator() {
  // Default to true so SSR markup matches the optimistic case; the
  // effect below corrects it on mount.
  const [online, setOnline] = useState<boolean>(true);
  const t = useTranslations("offline");

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-neutral-200 bg-warning-50 px-3 py-1.5 text-[12px] font-semibold text-warning-700 shadow-md"
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-warning-500" />
        {t("indicator")}
      </span>
    </div>
  );
}

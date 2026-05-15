"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { useFormat } from "@/lib/utils/i18n-format";
import type { ActivityEntry } from "@/lib/api/dashboard.types";

const kindStyles: Record<
  ActivityEntry["kind"],
  { bg: string; fg: string; icon: React.ReactNode }
> = {
  create: {
    bg: "bg-primary-50",
    fg: "text-primary-600",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  checkin: {
    bg: "bg-success-50",
    fg: "text-success-700",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    ),
  },
  invoice: {
    bg: "bg-secondary-50",
    fg: "text-secondary-600",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
    ),
  },
  alert: {
    bg: "bg-warning-50",
    fg: "text-warning-700",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01" />
      </svg>
    ),
  },
};

export function RecentActivity({ items }: { items: ActivityEntry[] }) {
  const t = useTranslations("dashboard.activity");
  const tTable = useTranslations("dashboard.activity.table");
  const tDash = useTranslations("dashboard");
  const f = useFormat();

  return (
    <section className="rounded-lg border border-neutral-100 bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-100 p-5">
        <div>
          <h3 className="text-[15px] font-semibold text-neutral-800">
            {t("title")}
          </h3>
          <div className="mt-0.5 text-[12px] text-neutral-500">{t("subtitle")}</div>
        </div>
        <Link
          href={routes.notifications}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-primary-600 hover:text-primary-700"
        >
          {tDash("viewAllActivities")} →
        </Link>
      </header>

      <div className="px-5 py-2">
        {items.length === 0 && (
          <div className="py-10 text-center text-[13px] text-neutral-500">
            {t("empty")}
          </div>
        )}

        {items.map((a) => {
          const k = kindStyles[a.kind];
          const ago = f.relative(a.createdAt);
          // Pull a translated label for the underlying table; fall back
          // to the raw table_name when there's no key (e.g. a future
          // table we haven't translated yet). The activity feed used
          // to render a hard-coded German "via WebApp" — replaced with
          // translated table label + actor name (when available).
          const tableLabel = safeTranslate(tTable, a.table) ?? a.table;
          return (
            <div
              key={a.id}
              className="flex gap-3 border-b border-neutral-100 py-3.5 last:border-b-0"
            >
              <span
                className={cn(
                  "grid h-8 w-8 flex-shrink-0 place-items-center rounded-md",
                  k.bg,
                  k.fg,
                )}
              >
                <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{k.icon}</span>
              </span>
              <div className="flex-1 text-[13px] leading-snug text-neutral-700">
                <p className="[&_strong]:font-semibold [&_strong]:text-neutral-800">
                  <span dangerouslySetInnerHTML={{ __html: enrich(a.body) }} />
                </p>
                <div className="mt-0.5 text-[11px] text-neutral-400">
                  {ago} · {tableLabel}
                  {a.actorName ? ` · ${a.actorName}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// SECURITY: activity bodies are built from user-supplied data (record
// names, etc.). Escape HTML BEFORE we apply the `**bold**` -> <strong>
// transform so a malicious record name like
// `<img src=x onerror=alert(1)>` can't execute through the
// dangerouslySetInnerHTML below.
const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);

function enrich(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/**
 * Try a translation key; return null when the key resolves to itself
 * (next-intl's signal that no message exists for this locale). Lets the
 * caller fall back to a sensible default instead of rendering the raw
 * key.
 */
function safeTranslate(
  t: (key: string) => string,
  key: string,
): string | null {
  try {
    const v = t(key);
    return v === key ? null : v;
  } catch {
    return null;
  }
}

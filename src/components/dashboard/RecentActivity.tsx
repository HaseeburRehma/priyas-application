"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { de as deLocale, enUS as enLocale, ta as taLocale } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import type { ActivityEntry } from "@/lib/api/dashboard.types";

const localeMap = { de: deLocale, en: enLocale, ta: taLocale } as const;

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
  const tDash = useTranslations("dashboard");
  const locale = useLocale() as keyof typeof localeMap;

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
          const ago = formatDistanceToNow(new Date(a.createdAt), {
            addSuffix: true,
            locale: localeMap[locale],
          });
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
                  {ago} · {a.meta}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function enrich(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

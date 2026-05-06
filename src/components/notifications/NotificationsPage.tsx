"use client";

import { useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { de as deLocale, enUS as enLocale, ta as taLocale } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import type {
  NotificationCategory,
  NotificationItem,
  NotificationsData,
  NotificationsTab,
} from "@/lib/api/notifications";

const localeMap = { de: deLocale, en: enLocale, ta: taLocale } as const;

const TABS: NotificationsTab[] = [
  "all",
  "unread",
  "mentions",
  "invoices",
  "schedule",
  "alltagshilfe",
];

const categoryStyles: Record<
  NotificationCategory,
  { ring: string; chip: string }
> = {
  invoice: { ring: "border-secondary-100", chip: "bg-secondary-50 text-secondary-700" },
  schedule: { ring: "border-primary-200", chip: "bg-primary-50 text-primary-700" },
  alltagshilfe: { ring: "border-error-100", chip: "bg-error-50 text-error-700" },
  mention: { ring: "border-warning-50", chip: "bg-warning-50 text-warning-700" },
  system: { ring: "border-neutral-100", chip: "bg-neutral-100 text-neutral-700" },
  other: { ring: "border-neutral-100", chip: "bg-neutral-100 text-neutral-700" },
};

const categoryIcon: Record<NotificationCategory, React.ReactNode> = {
  invoice: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  ),
  schedule: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x={3} y={5} width={18} height={16} rx={2} />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  ),
  alltagshilfe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
    </svg>
  ),
  mention: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx={12} cy={12} r={4} />
      <path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-4 8" />
    </svg>
  ),
  system: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx={12} cy={12} r={10} />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  ),
  other: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx={12} cy={12} r={10} />
    </svg>
  ),
};

type Props = {
  data: NotificationsData;
  tab: NotificationsTab;
};

export function NotificationsPage({ data, tab }: Props) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [pending, start] = useTransition();

  function markAll() {
    start(async () => {
      const r = await markAllNotificationsReadAction();
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <>
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbCurrent")}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
          </h1>
          <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={markAll}
            disabled={pending || data.counts.unread === 0}
            className="btn btn--ghost border border-neutral-200 bg-white"
          >
            {t("actions.markAllRead")}
          </button>
          <Link href={routes.settings} className="btn btn--tertiary">
            {t("actions.settings")}
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {TABS.map((k) => (
          <Link
            key={k}
            href={`${routes.notifications}?tab=${k}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
              tab === k
                ? "border-primary-500 bg-tertiary-200 text-primary-700"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-primary-500",
            )}
          >
            {t(`tabs.${k}` as never)}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                tab === k
                  ? "bg-primary-500 text-white"
                  : "bg-neutral-100 text-neutral-600",
              )}
            >
              {data.counts[k]}
            </span>
          </Link>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-neutral-100 bg-white">
        {data.items.length === 0 && (
          <div className="px-5 py-16 text-center text-[13px] text-neutral-500">
            {t("empty")}
          </div>
        )}
        <ul className="divide-y divide-neutral-100">
          {data.items.map((n) => (
            <Item key={n.id} item={n} />
          ))}
        </ul>
      </section>
    </>
  );
}

function Item({ item }: { item: NotificationItem }) {
  const t = useTranslations("notifications");
  const tCat = useTranslations("notifications.category");
  const router = useRouter();
  const locale = useLocale() as keyof typeof localeMap;
  const [pending, start] = useTransition();
  const styles = categoryStyles[item.category];
  const ago = formatDistanceToNow(new Date(item.created_at), {
    addSuffix: true,
    locale: localeMap[locale],
  });

  function markRead() {
    if (item.read_at) return;
    start(async () => {
      const r = await markNotificationReadAction(item.id);
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <li
      className={cn(
        "relative flex items-start gap-4 p-5 transition hover:bg-tertiary-200/40",
        item.urgent && "border-l-4 border-l-error-500",
        !item.read_at && "bg-primary-50/30",
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 flex-shrink-0 place-items-center rounded-md",
          styles.chip,
        )}
      >
        {categoryIcon[item.category]}
      </span>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]",
              styles.chip,
            )}
          >
            {tCat(item.category)}
          </span>
          {item.urgent && (
            <span className="rounded-full bg-error-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-white">
              {t("urgent")}
            </span>
          )}
          {!item.read_at && (
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-primary-700">
              {t("unread")}
            </span>
          )}
          <span className="ml-auto text-[11px] text-neutral-400">{ago}</span>
        </div>
        <div className="text-[13px] font-semibold text-neutral-800">
          {item.title}
        </div>
        {item.body && (
          <p
            className="mt-0.5 text-[13px] leading-[1.5] text-neutral-700 [&_b]:font-semibold [&_b]:text-neutral-800"
            dangerouslySetInnerHTML={{ __html: enrich(item.body) }}
          />
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-neutral-500">
            via {t(`channels.${item.channel}` as never)}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        {!item.read_at && (
          <button
            type="button"
            onClick={markRead}
            disabled={pending}
            className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition hover:border-primary-500 hover:text-primary-700"
          >
            {t("markRead")}
          </button>
        )}
        {item.link_url && (
          <Link
            href={item.link_url as Route}
            className="rounded-md bg-primary-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-primary-600"
          >
            {t("open")} →
          </Link>
        )}
      </div>
    </li>
  );
}

function enrich(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

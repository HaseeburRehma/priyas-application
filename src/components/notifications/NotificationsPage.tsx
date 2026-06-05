"use client";

import { useMemo, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { format, formatDistanceToNow, isSameDay, subDays, startOfDay } from "date-fns";
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

/**
 * Notifications page — pixel-faithful conversion of 18-notifications.html.
 *
 * Layout:
 *   1. Breadcrumb · page head with title + 12-unread red badge + Mark-all + Settings
 *   2. 4 KPI cards (Today · Urgent · This week · With task) with coloured top borders
 *   3. Filter pill bar (All · Unread · Mentions · Invoices · Deployment plan · Everyday help)
 *   4. Date-grouped notification cards: Today, Yesterday, This week
 *   5. "X older collapsed" hint
 *   6. Footer note re: 90-day retention + settings link
 *
 * The data shape stays the same as the previous version — we only restyle
 * + add client-side derived state (KPI aggregates + date buckets). The
 * existing markNotificationReadAction / markAllNotificationsReadAction
 * server actions are reused unchanged.
 */

const localeMap = { de: deLocale, en: enLocale, ta: taLocale } as const;

const TABS: NotificationsTab[] = [
  "all",
  "unread",
  "mentions",
  "invoices",
  "schedule",
  "alltagshilfe",
];

/**
 * Maps the data-model category to the prototype's icon-tile variant.
 * `urgent` (red gradient) is rendered for any item with `item.urgent`
 * regardless of category — that override happens at render time.
 */
type IconVariant =
  | "assign"
  | "invoice"
  | "alert"
  | "report"
  | "team"
  | "cert"
  | "system"
  | "alltags";

const ICON_VARIANT: Record<NotificationCategory, IconVariant> = {
  invoice: "invoice",
  schedule: "assign",
  alltagshilfe: "alltags",
  mention: "team",
  system: "system",
  other: "report",
};

const ICON_GRADIENT: Record<IconVariant, string> = {
  assign: "from-primary-500 to-primary-700",
  invoice: "from-secondary-500 to-secondary-700",
  alert: "from-error-500 to-error-700",
  report: "from-warning-500 to-warning-700",
  team: "from-accent-600 to-primary-600",
  cert: "from-secondary-500 to-[#6366F1]",
  system: "from-[#64748B] to-[#475569]",
  alltags: "from-error-500 to-error-700",
};

/**
 * Inline-SVG icon per variant — drawn at 20×20 inside a 42×42 tile with
 * white stroke. Mirrors the prototype's `.notif .ic.<variant>` set.
 */
const ICON_SVG: Record<IconVariant, React.ReactNode> = {
  assign: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x={3} y={5} width={18} height={16} rx={2} />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  ),
  invoice: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <line x1={12} y1={1} x2={12} y2={23} />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1={12} y1={9} x2={12} y2={13} />
      <line x1={12} y1={17} x2={12.01} y2={17} />
    </svg>
  ),
  report: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 3v18h18" />
      <path d="M7 14l3-3 3 3 5-5" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M21 12a7.5 7.5 0 01-11.2 6.5L4 20l1.5-5.2A7.5 7.5 0 1121 12z" />
    </svg>
  ),
  cert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  system: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx={12} cy={12} r={3} />
      <path d="M19.4 15a1.65 1.65 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.65 1.65 0 00-1.8-.3 1.65 1.65 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.65 1.65 0 00-1-1.5 1.65 1.65 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.65 1.65 0 00.3-1.8 1.65 1.65 0 00-1.5-1H3a2 2 0 110-4h.1a1.65 1.65 0 001.5-1 1.65 1.65 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.65 1.65 0 001.8.3h0a1.65 1.65 0 001-1.5V3a2 2 0 114 0v.1a1.65 1.65 0 001 1.5 1.65 1.65 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.65 1.65 0 00-.3 1.8v0a1.65 1.65 0 001.5 1H21a2 2 0 110 4h-.1a1.65 1.65 0 00-1.5 1z" />
    </svg>
  ),
  alltags: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
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
  const locale = useLocale() as keyof typeof localeMap;
  const [pending, start] = useTransition();

  function markAll() {
    start(async () => {
      const r = await markAllNotificationsReadAction();
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  }

  // -------------------- KPI aggregates --------------------
  // Computed from the raw items so the strip stays accurate as the data
  // refreshes (the loader already returns up to 200 items).
  const now = new Date();
  const today = startOfDay(now);
  const sevenDaysAgo = subDays(today, 7);

  const todayItems = data.items.filter((n) =>
    isSameDay(new Date(n.created_at), today),
  );
  const urgentItems = data.items.filter((n) => n.urgent);
  const weekItems = data.items.filter(
    (n) => new Date(n.created_at) >= sevenDaysAgo,
  );
  const withTaskItems = data.items.filter((n) => !!n.link_url);

  const kpis = {
    today: {
      count: todayItems.length,
      unread: todayItems.filter((n) => !n.read_at).length,
    },
    urgent: {
      count: urgentItems.length,
      unread: urgentItems.filter((n) => !n.read_at).length,
    },
    week: {
      count: weekItems.length,
      unread: weekItems.filter((n) => !n.read_at).length,
    },
    withTask: {
      count: withTaskItems.length,
    },
  };

  // -------------------- Date buckets --------------------
  // We bucket into Today / Yesterday / This week (last 7d) so the page
  // matches the prototype's section structure. Items older than 7 days
  // fall into "older" and are shown collapsed with a CTA.
  const yesterday = subDays(today, 1);

  const buckets = useMemo(() => {
    const todayB: NotificationItem[] = [];
    const yesterdayB: NotificationItem[] = [];
    const weekB: NotificationItem[] = [];
    const olderB: NotificationItem[] = [];

    for (const n of data.items) {
      const d = new Date(n.created_at);
      if (isSameDay(d, today)) todayB.push(n);
      else if (isSameDay(d, yesterday)) yesterdayB.push(n);
      else if (d >= sevenDaysAgo) weekB.push(n);
      else olderB.push(n);
    }
    return { todayB, yesterdayB, weekB, olderB };
  }, [data.items, today, yesterday, sevenDaysAgo]);

  return (
    <>
      {/* Breadcrumb */}
      <nav className="mb-3 flex items-center gap-2 text-[12px] text-neutral-500">
        <Link href={routes.dashboard} className="hover:text-neutral-700">
          {t("breadcrumbDashboard")}
        </Link>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbCommunication")}</span>
        <span className="text-neutral-400">/</span>
        <span className="text-neutral-700">{t("breadcrumbCurrent")}</span>
      </nav>

      {/* Page head */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 flex items-center gap-2.5 text-[24px] font-bold tracking-tightest text-secondary-500">
            {t("title")}
            {data.counts.unread > 0 && (
              <span className="rounded-full bg-error-500 px-2.5 py-1 text-[12px] font-bold text-white">
                {t("unreadCount", { n: data.counts.unread })}
              </span>
            )}
          </h1>
          <p className="text-[13px] text-neutral-500">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={markAll}
            disabled={pending || data.counts.unread === 0}
            className="btn btn--ghost border border-neutral-200 bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckIcon /> {t("actions.markAllRead")}
          </button>
          <Link href={routes.settings} className="btn btn--ghost border border-neutral-200 bg-white">
            <GearIcon /> {t("actions.settings")}
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          tone="primary"
          label={t("kpi.today")}
          value={kpis.today.count}
          detail={t("kpi.todayDetail", { n: kpis.today.unread })}
        />
        <KpiCard
          tone="urgent"
          label={t("kpi.urgent")}
          value={kpis.urgent.count}
          detail={t("kpi.urgentDetail")}
        />
        <KpiCard
          tone="week"
          label={t("kpi.week")}
          value={kpis.week.count}
          detail={t("kpi.weekDetail", { n: kpis.week.unread })}
        />
        <KpiCard
          tone="task"
          label={t("kpi.withTask")}
          value={kpis.withTask.count}
          detail={t("kpi.withTaskDetail")}
        />
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-md border border-neutral-100 bg-white p-1.5">
        {TABS.map((k) => (
          <Link
            key={k}
            href={`${routes.notifications}?tab=${k}` as Route}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition",
              tab === k
                ? "bg-primary-500 font-semibold text-white"
                : k === "alltagshilfe"
                  ? "text-error-700 hover:bg-neutral-50"
                  : "text-neutral-600 hover:bg-neutral-50",
            )}
          >
            {t(`tabs.${k}` as never)}
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[10px] font-bold",
                tab === k
                  ? "bg-black/20 text-white"
                  : "bg-neutral-100 text-neutral-600",
              )}
            >
              {data.counts[k]}
            </span>
          </Link>
        ))}
      </div>

      {/* Groups */}
      {data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-200 bg-white px-5 py-16 text-center text-[13px] text-neutral-500">
          {t("empty")}
        </div>
      ) : (
        <>
          {buckets.todayB.length > 0 && (
            <Group
              label={t("groups.today", {
                date: format(today, "d. LLL yyyy", { locale: localeMap[locale] }),
              })}
              count={buckets.todayB.length}
              items={buckets.todayB}
            />
          )}
          {buckets.yesterdayB.length > 0 && (
            <Group
              label={t("groups.yesterday", {
                date: format(yesterday, "d. LLL yyyy", { locale: localeMap[locale] }),
              })}
              count={buckets.yesterdayB.length}
              items={buckets.yesterdayB}
            />
          )}
          {buckets.weekB.length > 0 && (
            <Group
              label={t("groups.week", {
                from: format(sevenDaysAgo, "d. LLL", { locale: localeMap[locale] }),
                to: format(subDays(today, 2), "d. LLL", { locale: localeMap[locale] }),
              })}
              count={buckets.weekB.length}
              items={buckets.weekB}
              olderCount={buckets.olderB.length}
            />
          )}
          {buckets.todayB.length === 0 &&
            buckets.yesterdayB.length === 0 &&
            buckets.weekB.length === 0 &&
            buckets.olderB.length > 0 && (
              <div className="rounded-lg border border-dashed border-neutral-200 bg-white px-5 py-8 text-center text-[12px] text-neutral-500">
                {t("olderCollapsed", { n: buckets.olderB.length })}
              </div>
            )}
        </>
      )}

      {/* Footer note */}
      <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-secondary-100 bg-secondary-50 px-4 py-3 text-[12px] text-secondary-700">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 h-4 w-4 flex-shrink-0"
        >
          <circle cx={12} cy={12} r={10} />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span>
          {t.rich("footerNote", {
            link: (chunks) => (
              <Link
                href={routes.settings}
                className="font-semibold text-secondary-700 underline"
              >
                {chunks}
              </Link>
            ),
          })}
        </span>
      </div>
    </>
  );
}

/* ----------------------------- KPI card ----------------------------- */

function KpiCard({
  tone,
  label,
  value,
  detail,
}: {
  tone: "primary" | "urgent" | "week" | "task";
  label: string;
  value: number;
  detail: string;
}) {
  const top = {
    primary: "bg-primary-500",
    urgent: "bg-error-500",
    week: "bg-secondary-500",
    task: "bg-warning-500",
  }[tone];
  const valueColor = tone === "urgent" ? "text-error-700" : "text-secondary-500";
  return (
    <div className="relative overflow-hidden rounded-lg border border-neutral-100 bg-white p-4">
      <span aria-hidden className={cn("absolute left-0 right-0 top-0 h-[3px]", top)} />
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
        {label}
      </div>
      <div className={cn("mt-1.5 font-mono text-[24px] font-bold", valueColor)}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-neutral-500">{detail}</div>
    </div>
  );
}

/* ------------------------------- Group ------------------------------- */

function Group({
  label,
  count,
  items,
  olderCount,
}: {
  label: string;
  count: number;
  items: NotificationItem[];
  olderCount?: number;
}) {
  const t = useTranslations("notifications");
  return (
    <section className="mb-5">
      <header className="mb-2.5 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
        <span>{label}</span>
        <span className="h-px flex-1 bg-neutral-200" />
        <span className="font-mono">{count}</span>
      </header>
      <div className="flex flex-col gap-2">
        {items.map((n) => (
          <NotificationCard key={n.id} item={n} />
        ))}
        {olderCount !== undefined && olderCount > 0 && (
          <div className="rounded-lg border border-dashed border-neutral-200 bg-white px-4 py-5 text-center text-[12px] text-neutral-500">
            {t.rich("olderCollapsedRich", {
              n: olderCount,
              link: (chunks) => (
                <button
                  type="button"
                  className="font-semibold text-primary-700 hover:underline"
                >
                  {chunks}
                </button>
              ),
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/* ----------------------------- Card item ----------------------------- */

function NotificationCard({ item }: { item: NotificationItem }) {
  const t = useTranslations("notifications");
  const tCat = useTranslations("notifications.category");
  const router = useRouter();
  const locale = useLocale() as keyof typeof localeMap;
  const [pending, start] = useTransition();

  const created = new Date(item.created_at);
  const when = format(created, "HH:mm", { locale: localeMap[locale] });
  const ago = formatDistanceToNow(created, {
    addSuffix: true,
    locale: localeMap[locale],
  });

  // Pick the icon variant. Urgent items always render with the alert
  // (red-gradient) icon regardless of category so they're impossible
  // to miss at a glance.
  const iconVariant: IconVariant = item.urgent
    ? "alert"
    : ICON_VARIANT[item.category];

  const isAlltags = item.category === "alltagshilfe";
  const isUnread = !item.read_at;

  function markRead() {
    if (item.read_at) return;
    start(async () => {
      const r = await markNotificationReadAction(item.id);
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <article
      className={cn(
        "group relative grid grid-cols-[42px_1fr_auto] gap-3.5 rounded-lg border border-neutral-100 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm sm:grid-cols-[44px_1fr_auto] sm:p-4 sm:pr-5",
        item.urgent &&
          "border-error-100 bg-gradient-to-br from-error-50 to-white",
        isUnread &&
          !item.urgent &&
          !isAlltags &&
          "bg-gradient-to-r from-primary-50 via-white to-white",
        isUnread &&
          isAlltags &&
          "bg-gradient-to-r from-error-50 via-white to-white",
      )}
    >
      {/* Unread / urgent dot — sits absolutely in the top-left corner */}
      {(isUnread || item.urgent) && (
        <span
          aria-hidden
          className={cn(
            "absolute left-2 top-4 h-2 w-2 rounded-full",
            item.urgent
              ? "bg-error-500 ring-[3px] ring-error-500/20"
              : isAlltags
                ? "bg-error-500 ring-[3px] ring-error-500/20"
                : "bg-primary-500 ring-[3px] ring-primary-500/20",
          )}
        />
      )}

      {/* Icon tile */}
      <span
        className={cn(
          "grid h-[42px] w-[42px] place-items-center rounded-md text-white shadow-xs bg-gradient-to-br",
          ICON_GRADIENT[iconVariant],
        )}
      >
        {ICON_SVG[iconVariant]}
      </span>

      {/* Body column */}
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-semibold leading-[1.3] text-neutral-800">
            {item.title}
          </h3>
          {item.urgent && (
            <Tag tone="urg">{t("urgent")}</Tag>
          )}
          {!item.urgent && (
            <Tag tone={isAlltags ? "alltags" : "category"}>
              {tCat(item.category)}
            </Tag>
          )}
        </div>
        {item.body && (
          <p
            className="text-[12px] leading-[1.5] text-neutral-600 [&_b]:font-semibold [&_b]:text-neutral-800"
            dangerouslySetInnerHTML={{ __html: enrich(item.body) }}
          />
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[11px] text-neutral-500">
            {when} · {ago}
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {isUnread && (
              <button
                type="button"
                onClick={markRead}
                disabled={pending}
                className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition hover:border-primary-500 hover:text-primary-700 disabled:opacity-50"
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
        </div>
      </div>

      {/* Right rail — desktop only */}
      <div className="hidden flex-col items-end gap-1.5 sm:flex">
        <span className="font-mono text-[11px] text-neutral-500">{when}</span>
        <button
          type="button"
          aria-label="More"
          className="grid h-6 w-6 place-items-center rounded text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
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
            <circle cx={12} cy={5} r={1.5} />
            <circle cx={12} cy={12} r={1.5} />
            <circle cx={12} cy={19} r={1.5} />
          </svg>
        </button>
      </div>
    </article>
  );
}

/* ----------------------------- Helpers ----------------------------- */

function Tag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "category" | "alltags" | "urg" | "sys";
}) {
  const cls =
    tone === "urg"
      ? "bg-error-500 text-white"
      : tone === "alltags"
        ? "bg-error-50 text-error-700"
        : tone === "sys"
          ? "bg-neutral-100 text-neutral-600"
          : "bg-primary-50 text-primary-700";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em]",
        cls,
      )}
    >
      {children}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <circle cx={12} cy={12} r={3} />
      <path d="M19.4 15a1.65 1.65 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.65 1.65 0 00-1.8-.3 1.65 1.65 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.65 1.65 0 00-1-1.5 1.65 1.65 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.65 1.65 0 00.3-1.8 1.65 1.65 0 00-1.5-1H3a2 2 0 110-4h.1a1.65 1.65 0 001.5-1 1.65 1.65 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.65 1.65 0 001.8.3h0a1.65 1.65 0 001-1.5V3a2 2 0 114 0v.1a1.65 1.65 0 001 1.5 1.65 1.65 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.65 1.65 0 00-.3 1.8v0a1.65 1.65 0 001.5 1H21a2 2 0 110 4h-.1a1.65 1.65 0 00-1.5 1z" />
    </svg>
  );
}

// SECURITY: notification bodies can contain user-supplied strings.
// HTML-escape input BEFORE applying the `**bold**` -> <b> transform so
// the dangerouslySetInnerHTML below can't inject scripts.
const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);

function enrich(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

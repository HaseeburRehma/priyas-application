"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.8}
    className="h-[22px] w-[22px]"
  >
    {children}
  </svg>
);

type Props = {
  /** RouteKeys the current user may reach. Items not in the list are
   *  filtered out. Field staff effectively see Overview / Schedule /
   *  Chat / Notifications and skip Settings. */
  allowedRoutes?: string[];
};

/**
 * Mobile-only bottom nav for the most important destinations.
 * The full navigation is available via the hamburger drawer.
 *
 * Uses safe-area-inset-bottom so it sits above the iOS home-indicator.
 */
export function BottomNav({ allowedRoutes }: Props = {}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const allRouteKeys = new Set(allowedRoutes ?? []);
  const visible = (key?: string) => !key || allRouteKeys.has(key);

  const allItems = [
    {
      href: routes.dashboard,
      label: t("overview"),
      routeKey: "dashboard",
      icon: (
        <Icon>
          <path d="M3 12L12 3l9 9" />
          <path d="M5 10v10h14V10" />
        </Icon>
      ),
    },
    {
      href: routes.schedule,
      label: t("schedule"),
      routeKey: "schedule",
      icon: (
        <Icon>
          <rect x={3} y={5} width={18} height={16} rx={2} />
          <path d="M3 9h18M8 3v4M16 3v4" />
        </Icon>
      ),
    },
    {
      href: routes.chat,
      label: t("teamChat"),
      routeKey: "chat",
      icon: (
        <Icon>
          <path d="M21 12a7.5 7.5 0 01-11.2 6.5L4 20l1.5-5.2A7.5 7.5 0 1121 12z" />
        </Icon>
      ),
      badge: 3,
    },
    {
      href: routes.notifications,
      label: t("notifications"),
      routeKey: "notifications",
      icon: (
        <Icon>
          <path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8zM10 21a2 2 0 004 0" />
        </Icon>
      ),
      badge: 12,
    },
    {
      href: routes.settings,
      label: t("system"),
      routeKey: "settings",
      icon: (
        <Icon>
          <circle cx={12} cy={12} r={3} />
          <path d="M19.4 15a1.65 1.65 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.65 1.65 0 00-1.8-.3 1.65 1.65 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.65 1.65 0 00-1-1.5 1.65 1.65 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.65 1.65 0 00.3-1.8 1.65 1.65 0 00-1.5-1H3a2 2 0 110-4h.1a1.65 1.65 0 001.5-1 1.65 1.65 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.65 1.65 0 001.8.3h0a1.65 1.65 0 001-1.5V3a2 2 0 114 0v.1a1.65 1.65 0 001 1.5 1.65 1.65 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.65 1.65 0 00-.3 1.8v0a1.65 1.65 0 001.5 1H21a2 2 0 110 4h-.1a1.65 1.65 0 00-1.5 1z" />
        </Icon>
      ),
    },
  ];

  const items = allItems.filter((i) => visible(i.routeKey));

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-neutral-100 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== routes.dashboard && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] transition",
              active ? "text-primary-600" : "text-neutral-500",
            )}
          >
            <span className="relative">
              {item.icon}
              {item.badge ? (
                <span className="absolute -right-2 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-error-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              ) : null}
            </span>
            <span className="leading-none">{item.label}</span>
            {active && (
              <span
                aria-hidden
                className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary-500"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

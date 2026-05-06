"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { routes } from "@/lib/constants/routes";
import { useUiStore } from "@/stores/useUiStore";

type NavItem = {
  label: string;
  href: Route;
  icon: React.ReactNode;
  badge?: string;
  /** Route key from ROUTE_ACCESS — used to hide unauthorized items.
   *  When omitted, the item is visible to everyone. */
  routeKey?: string;
};
type NavSection = { title: string; items: NavItem[] };

type Props = {
  /** RouteKeys the current user is allowed to reach. Items without a
   *  `routeKey` are always shown; items with one are hidden when not
   *  present in this list. */
  allowedRoutes?: string[];
};

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.8}
    className="h-[18px] w-[18px] flex-shrink-0"
  >
    {children}
  </svg>
);

const icons = {
  overview: (
    <Icon>
      <rect x={3} y={3} width={7} height={7} rx={1.5} />
      <rect x={14} y={3} width={7} height={7} rx={1.5} />
      <rect x={3} y={14} width={7} height={7} rx={1.5} />
      <rect x={14} y={14} width={7} height={7} rx={1.5} />
    </Icon>
  ),
  clients: (
    <Icon>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx={9} cy={7} r={4} />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </Icon>
  ),
  properties: (
    <Icon>
      <path d="M3 21V7l8-4 8 4v14" />
      <path d="M9 9h2M13 9h2M9 13h2M13 13h2M9 17h2M13 17h2" />
    </Icon>
  ),
  schedule: (
    <Icon>
      <rect x={3} y={5} width={18} height={16} rx={2} />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </Icon>
  ),
  employees: (
    <Icon>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx={9} cy={7} r={4} />
    </Icon>
  ),
  reports: (
    <Icon>
      <path d="M3 3v18h18" />
      <path d="M7 14l3-3 3 3 5-5" />
    </Icon>
  ),
  care: (
    <Icon>
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
    </Icon>
  ),
  monthly: (
    <Icon>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </Icon>
  ),
  chat: (
    <Icon>
      <path d="M21 12a7.5 7.5 0 01-11.2 6.5L4 20l1.5-5.2A7.5 7.5 0 1121 12z" />
    </Icon>
  ),
  bell: (
    <Icon>
      <path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8zM10 21a2 2 0 004 0" />
    </Icon>
  ),
  settings: (
    <Icon>
      <circle cx={12} cy={12} r={3} />
      <path d="M19.4 15a1.65 1.65 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.65 1.65 0 00-1.8-.3 1.65 1.65 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.65 1.65 0 00-1-1.5 1.65 1.65 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.65 1.65 0 00.3-1.8 1.65 1.65 0 00-1.5-1H3a2 2 0 110-4h.1a1.65 1.65 0 001.5-1 1.65 1.65 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.65 1.65 0 001.8.3h0a1.65 1.65 0 001-1.5V3a2 2 0 114 0v.1a1.65 1.65 0 001 1.5 1.65 1.65 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.65 1.65 0 00-.3 1.8v0a1.65 1.65 0 001.5 1H21a2 2 0 110 4h-.1a1.65 1.65 0 00-1.5 1z" />
    </Icon>
  ),
  collapse: (
    <Icon>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </Icon>
  ),
  training: (
    <Icon>
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </Icon>
  ),
} as const;

/**
 * Single Sidebar that adapts to all breakpoints:
 *  - desktop ≥1024px: sticky left rail; full or collapsed (icon-only).
 *  - tablet 768–1023px: same as desktop but defaults to collapsed (icon-only).
 *  - mobile <768px: hidden by default; slides in as a drawer via the
 *    hamburger button in the topbar.
 */
export function Sidebar({ allowedRoutes }: Props = {}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);

  // Close the drawer whenever the user navigates.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, setMobileNavOpen]);

  // Lock body scroll while drawer is open on mobile.
  useEffect(() => {
    if (mobileNavOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [mobileNavOpen]);

  const allRouteKeys = new Set(allowedRoutes ?? []);
  const visible = (key?: string) => !key || allRouteKeys.has(key);

  const rawSections: NavSection[] = [
    {
      title: t("workspace"),
      items: [
        { label: t("overview"), href: routes.dashboard, icon: icons.overview, routeKey: "dashboard" },
        { label: t("clients"), href: routes.clients, icon: icons.clients, badge: "10", routeKey: "clients" },
        { label: t("properties"), href: routes.properties, icon: icons.properties, badge: "112", routeKey: "properties" },
        { label: t("schedule"), href: routes.schedule, icon: icons.schedule, routeKey: "schedule" },
        { label: t("employees"), href: routes.employees, icon: icons.employees, badge: "32", routeKey: "employees" },
        { label: t("training"), href: routes.training, icon: icons.training, routeKey: "training" },
        { label: t("reports"), href: routes.reports, icon: icons.reports, routeKey: "reports" },
      ],
    },
    {
      title: t("alltagshilfe"),
      items: [
        { label: t("careClients"), href: `${routes.clients}?type=alltagshilfe` as Route, icon: icons.care, routeKey: "clients" },
        { label: t("monthlyReport"), href: routes.alltagshilfeReport, icon: icons.monthly, routeKey: "alltagshilfeReport" },
      ],
    },
    {
      title: t("communication"),
      items: [
        { label: t("teamChat"), href: routes.chat, icon: icons.chat, badge: "3", routeKey: "chat" },
        { label: t("notifications"), href: routes.notifications, icon: icons.bell, badge: "12", routeKey: "notifications" },
      ],
    },
    {
      title: t("system"),
      items: [{ label: t("settings"), href: routes.settings, icon: icons.settings, routeKey: "settings" }],
    },
  ];

  // Filter items by route access; drop empty sections so we don't render
  // a heading with no children.
  const sections = rawSections
    .map((s) => ({ ...s, items: s.items.filter((i) => visible(i.routeKey)) }))
    .filter((s) => s.items.length > 0);

  const drawerOpen = mobileNavOpen;

  return (
    <>
      {/* Backdrop (mobile only, when drawer open) */}
      <div
        aria-hidden
        onClick={() => setMobileNavOpen(false)}
        className={cn(
          "fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity md:hidden",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        id="primary-nav"
        aria-label="Primary"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-secondary-800 bg-secondary-900 px-3 py-5 text-white/[.82] transition-[width,transform]",
          // Width: collapsed = 72px, full = 240px
          collapsed ? "md:w-[72px]" : "md:w-[240px]",
          // Mobile: always 240px wide, slides on/off
          "w-[280px]",
          drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Brand row */}
        <div
          className={cn(
            "mb-4 flex items-center gap-3 border-b border-white/[.06] pb-6 pt-1.5",
            collapsed ? "justify-center px-0" : "px-2.5",
          )}
        >
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-primary-500 text-[17px] font-extrabold text-white">
            P
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold tracking-tighter2 text-white">
                Priya's
              </div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-500">
                Betrieb
              </div>
            </div>
          )}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
            className="ml-auto grid h-8 w-8 place-items-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white md:hidden"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sections */}
        <nav
          className={cn(
            "flex flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-thin",
            collapsed && "items-center",
          )}
        >
          {sections.map((section) => (
            <div key={section.title} className={cn(collapsed && "w-full")}>
              {!collapsed && (
                <div className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/35">
                  {section.title}
                </div>
              )}
              {collapsed && <div className="my-2 h-px bg-white/[.06]" />}
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (pathname.startsWith(item.href) && item.href !== routes.dashboard) ||
                  (item.href === routes.dashboard && pathname === routes.dashboard);

                const content = (
                  <>
                    {item.icon}
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && item.badge && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          active ? "bg-black/25 text-white" : "bg-white/15 text-white",
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                    {collapsed && item.badge && (
                      <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-error-500 px-1 text-[9px] font-bold text-white ring-2 ring-secondary-900">
                        {item.badge}
                      </span>
                    )}
                  </>
                );

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-md text-[13px] text-white/[.82] transition",
                      "hover:bg-white/[.06] hover:text-white",
                      active && "bg-primary-500 font-medium text-white",
                      collapsed
                        ? "mx-auto h-10 w-10 justify-center"
                        : "px-3 py-2.5",
                    )}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer: collapse toggle (desktop+tablet only) */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            "-mx-3 mt-4 hidden items-center gap-2.5 border-t border-white/[.06] py-4 text-[12px] text-white/55 transition hover:text-white md:flex",
            collapsed ? "justify-center px-0" : "px-6",
          )}
          aria-label="Toggle sidebar"
        >
          <span className={cn(collapsed && "rotate-180")}>{icons.collapse}</span>
          {!collapsed && t("collapseSidebar")}
        </button>
      </aside>
    </>
  );
}

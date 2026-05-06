"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { routes } from "@/lib/constants/routes";
import { useUiStore } from "@/stores/useUiStore";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { UserMenu } from "./UserMenu";

type Props = {
  user: {
    name: string;
    email: string;
    role: string;
    initials: string;
  };
};


export function Topbar({ user }: Props) {
  const t = useTranslations("topbar");
  const tCommon = useTranslations("common");
  const toggleMobileNav = useUiStore((s) => s.toggleMobileNav);

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-neutral-100 bg-white/95 px-3 py-3 backdrop-blur md:gap-4 md:px-7 md:py-4">
      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label={t("openMenu")}
        aria-controls="primary-nav"
        onClick={toggleMobileNav}
        className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-md text-neutral-700 transition hover:bg-neutral-50 md:hidden"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {/* LEFT: search */}
      <label className="flex h-10 max-w-[520px] flex-1 items-center gap-2.5 rounded-full border border-neutral-100 bg-neutral-50 px-3 md:px-4">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 flex-shrink-0 text-neutral-400"
        >
          <circle cx={11} cy={11} r={8} />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="search"
          placeholder={t("searchPlaceholder")}
          className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-neutral-700 outline-none placeholder:text-neutral-400"
          aria-label={tCommon("search")}
        />
        <span className="hidden rounded-[4px] border border-neutral-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-neutral-400 md:inline">
          ⌘K
        </span>
      </label>

      {/* Spacer pushes the right cluster to the edge */}
      <div className="flex-1" />

      {/* RIGHT cluster */}
      <div className="flex items-center gap-1 md:gap-1.5">
        {/* Help */}
        <Link
          href={routes.settings}
          className="hidden h-9 w-9 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-800 sm:grid"
          aria-label={t("help")}
          title={t("help")}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
          >
            <circle cx={12} cy={12} r={10} />
            <path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01" />
          </svg>
        </Link>

        {/* Chat */}
        <Link
          href={routes.chat}
          className="relative grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-800"
          aria-label={t("chat")}
          title={t("chat")}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
          >
            <path d="M21 12a7.5 7.5 0 01-11.2 6.5L4 20l1.5-5.2A7.5 7.5 0 1121 12z" />
          </svg>
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-error-500" />
        </Link>

        {/* Notifications */}
        <Link
          href={routes.notifications}
          className="relative grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-800"
          aria-label={t("notifications")}
          title={t("notifications")}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px]"
          >
            <path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8z" />
            <path d="M10 21a2 2 0 004 0" />
          </svg>
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-error-500" />
        </Link>

        <LanguageSwitcher />

        <UserMenu
          name={user.name}
          email={user.email}
          role={user.role}
          initials={user.initials}
        />
      </div>
    </header>
  );
}

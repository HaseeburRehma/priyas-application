"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { routes } from "@/lib/constants/routes";

type Props = {
  name: string;
  email: string;
  role: string;
  initials: string;
};

/**
 * Avatar button that opens a dropdown with the user's identity, useful
 * shortcuts, and a sign-out action. Closes on outside click, Escape, or
 * after navigation.
 *
 * Responsive behaviour:
 *   - mobile: only the avatar is rendered as the trigger (no name/role).
 *   - desktop: avatar + truncated name + role.
 *   - The dropdown panel is the same on all sizes; full email is shown
 *     inside the panel where it has room.
 */
export function UserMenu({ name, email, role, initials }: Props) {
  const t = useTranslations("common");
  const tNav = useTranslations("nav");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Outside click + Esc to close
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setOpen(false);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace(routes.login);
    router.refresh();
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((s) => !s)}
        className={cn(
          "flex items-center gap-2.5 rounded-full px-1 py-1 transition hover:bg-neutral-50 md:px-2",
          open && "bg-neutral-50",
        )}
      >
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-primary-100 text-[12px] font-bold text-primary-700">
          {initials}
        </span>
        <span className="hidden min-w-0 max-w-[140px] text-left leading-tight md:block lg:max-w-[180px]">
          <span className="block truncate text-[13px] font-semibold text-neutral-800">
            {name}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
            {role}
          </span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="hidden h-3.5 w-3.5 text-neutral-400 md:block"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-30 w-[260px] overflow-hidden rounded-md border border-neutral-100 bg-white py-1 shadow-lg"
        >
          {/* Identity card */}
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-primary-100 text-[14px] font-bold text-primary-700">
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-neutral-900">
                {name}
              </div>
              <div className="truncate text-[12px] text-neutral-500">
                {email}
              </div>
              <div className="mt-0.5 inline-block rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-primary-700">
                {role}
              </div>
            </div>
          </div>

          <div className="my-1 h-px bg-neutral-100" />

          {/* Items */}
          <Link
            href={routes.settings}
            role="menuitem"
            className="flex items-center gap-3 px-4 py-2 text-[13px] text-neutral-700 transition hover:bg-neutral-50"
            onClick={() => setOpen(false)}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[16px] w-[16px] text-neutral-500"
            >
              <circle cx={12} cy={7} r={4} />
              <path d="M5.5 21a8 8 0 0113 0" />
            </svg>
            {tNav("settings")}
          </Link>

          <Link
            href={routes.notifications}
            role="menuitem"
            className="flex items-center gap-3 px-4 py-2 text-[13px] text-neutral-700 transition hover:bg-neutral-50"
            onClick={() => setOpen(false)}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[16px] w-[16px] text-neutral-500"
            >
              <path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8z" />
              <path d="M10 21a2 2 0 004 0" />
            </svg>
            {tNav("notifications")}
          </Link>

          <div className="my-1 h-px bg-neutral-100" />

          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex w-full items-center gap-3 px-4 py-2 text-[13px] font-medium text-error-700 transition hover:bg-error-50"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[16px] w-[16px]"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}

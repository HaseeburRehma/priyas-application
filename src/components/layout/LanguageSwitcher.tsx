"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils/cn";

const LOCALES = [
  { code: "de", label: "Deutsch", short: "DE" },
  { code: "en", label: "English", short: "EN" },
  { code: "ta", label: "தமிழ்", short: "TA" },
] as const;

/**
 * Language switcher used in the topbar. Persists the selected locale in a
 * cookie that next-intl reads server-side (see src/i18n/request.ts), then
 * triggers a router refresh so server components re-render in the new locale.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pick(code: string) {
    if (code === locale) {
      setOpen(false);
      return;
    }
    // next-intl reads `locale` cookie. Set it client-side and refresh.
    document.cookie = `locale=${code}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    setOpen(false);
    startTransition(() => router.refresh());
  }

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((s) => !s)}
        disabled={pending}
        className="grid h-9 min-w-[40px] place-items-center rounded-full px-2 text-[12px] font-semibold text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-800"
      >
        <span className="hidden md:inline">{current.short}</span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[18px] w-[18px] md:hidden"
        >
          <circle cx={12} cy={12} r={10} />
          <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-11 z-30 w-44 overflow-hidden rounded-md border border-neutral-100 bg-white py-1 shadow-lg"
        >
          {LOCALES.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={l.code === locale}
                onClick={() => pick(l.code)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-[13px] text-neutral-700 transition hover:bg-neutral-50",
                  l.code === locale && "font-semibold text-primary-700",
                )}
              >
                <span>{l.label}</span>
                {l.code === locale && (
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

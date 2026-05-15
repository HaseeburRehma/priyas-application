"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";

export type BulkAction = {
  /** Stable identifier — used as React key + analytics handle. */
  key: string;
  /** Localised label shown next to the icon. */
  label: string;
  /** Pre-rendered icon node (SVG span). */
  icon: React.ReactNode;
  /** Click handler — receives nothing; caller already knows selection. */
  onClick: () => void;
  /** Optional dangerous-action styling. */
  tone?: "default" | "danger";
  /** Disable the button (e.g. pending). */
  disabled?: boolean;
};

type Props = {
  /** Number of currently selected rows. Bar hides when 0. */
  count: number;
  /** Right-side actions. */
  actions: ReadonlyArray<BulkAction>;
  /** Called when the user clicks "Clear selection". */
  onClear: () => void;
};

/**
 * Sticky bottom bar shown when one or more rows in a list table are
 * selected. The list-page client owns the selection state and feeds
 * it through `count`/`actions`/`onClear`.
 *
 * Strings are translated from the `bulk.*` namespace.
 */
export function BulkActionBar({ count, actions, onClear }: Props) {
  const t = useTranslations("bulk");
  if (count <= 0) return null;

  return (
    <div
      role="region"
      aria-label={t("selected", { count })}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-100 bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
    >
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-5 py-3">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-secondary-500">
          <span className="grid h-6 min-w-[24px] place-items-center rounded-full bg-primary-500 px-1.5 text-[11px] font-bold text-white">
            {count}
          </span>
          {t("selected", { count })}
        </span>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              disabled={a.disabled}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition",
                a.tone === "danger"
                  ? "border-error-200 bg-white text-error-700 hover:bg-error-50"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-primary-500 hover:text-primary-600",
                a.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
                {a.icon}
              </span>
              {a.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-700"
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
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            {t("clearSelection")}
          </button>
        </div>
      </div>
    </div>
  );
}

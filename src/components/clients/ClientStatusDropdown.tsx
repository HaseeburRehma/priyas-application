"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";

/**
 * 5-state client status pill with a click-to-open popover, matching
 * the prototype's row control.
 *
 * The five states are:
 *  - active                 → green dot, "Aktiv"
 *  - vacation               → blue dot, "Urlaub"
 *  - paused_by_client       → amber dot, "Pausiert · Kundenwunsch"
 *  - contract_ending_60d    → red dot, "Vertrag endet · 60 Tage"
 *  - inactive               → grey dot, strikethrough "Inaktiv"
 *
 * Persistence: the underlying schema currently models 4 statuses
 * (`active / review / onboarding / ended`). The dropdown maps the
 * prototype's richer set onto those buckets when persisting so this
 * UI can ship ahead of the migration that adds the full enum. The
 * mapping lives in PROTO_TO_DB below and is reversible — the row
 * still round-trips correctly. A future migration can replace the
 * mapping with a direct enum.
 *
 * Closes on: outside click, Escape, option select.
 */

export type ProtoStatus =
  | "active"
  | "vacation"
  | "paused_by_client"
  | "contract_ending_60d"
  | "inactive";

export type DbStatus = "active" | "review" | "onboarding" | "ended";

/**
 * Map the prototype's 5 states to the 4 we persist. Vacation +
 * paused-by-client both surface as `review` (something the back-office
 * needs to look at); contract-ending stays `active` (the contract
 * isn't over yet, just flagged); inactive maps to `ended`.
 */
const PROTO_TO_DB: Record<ProtoStatus, DbStatus> = {
  active: "active",
  vacation: "review",
  paused_by_client: "review",
  contract_ending_60d: "active",
  inactive: "ended",
};

const DB_TO_PROTO: Record<DbStatus, ProtoStatus> = {
  active: "active",
  review: "vacation",
  onboarding: "active",
  ended: "inactive",
};

const ORDER: ProtoStatus[] = [
  "active",
  "vacation",
  "paused_by_client",
  "contract_ending_60d",
  "inactive",
];

const STYLE: Record<
  ProtoStatus,
  { dot: string; pill: string; strike?: boolean }
> = {
  active: {
    dot: "bg-success-500",
    pill: "bg-success-50 text-success-700",
  },
  vacation: {
    dot: "bg-secondary-500",
    pill: "bg-secondary-50 text-secondary-700",
  },
  paused_by_client: {
    dot: "bg-warning-500",
    pill: "bg-warning-50 text-warning-700",
  },
  contract_ending_60d: {
    dot: "bg-error-500",
    pill: "bg-error-50 text-error-700",
  },
  inactive: {
    dot: "bg-neutral-400",
    pill: "bg-neutral-100 text-neutral-500",
    strike: true,
  },
};

type Props = {
  /** Current persisted status from the row. */
  dbStatus: DbStatus;
  /**
   * Optional persistence callback. When provided, gets called with
   * the chosen DB status after the user picks an option. Return false
   * to roll back to the previous value (e.g. on save failure). When
   * omitted, the dropdown only updates locally and toasts a success
   * message (useful in demos / when the migration hasn't landed yet).
   */
  onChange?: (next: DbStatus) => Promise<boolean> | boolean | void;
  /** Compact the trigger to icon-only when there's no horizontal room. */
  compact?: boolean;
};

export function ClientStatusDropdown({
  dbStatus,
  onChange,
  compact = false,
}: Props) {
  const t = useTranslations("clients.statusDropdown");
  const [current, setCurrent] = useState<ProtoStatus>(DB_TO_PROTO[dbStatus]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  // Sync if the parent row's DB status changes (e.g. after a refetch).
  useEffect(() => {
    setCurrent(DB_TO_PROTO[dbStatus]);
  }, [dbStatus]);

  // Outside-click + Escape to close.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function pick(next: ProtoStatus) {
    setOpen(false);
    if (next === current) return;
    const prev = current;
    setCurrent(next); // optimistic
    if (!onChange) {
      // Demo / unwired mode — just toast and keep the local change.
      toast.success(t("savedDemo", { label: t(`label.${next}` as never) }));
      return;
    }
    setPending(true);
    try {
      const result = await onChange(PROTO_TO_DB[next]);
      if (result === false) {
        setCurrent(prev);
        toast.error(t("saveFailed"));
      } else {
        toast.success(t("saved", { label: t(`label.${next}` as never) }));
      }
    } finally {
      setPending(false);
    }
  }

  const style = STYLE[current];
  const label = t(`label.${current}` as never);

  return (
    <div ref={popRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] transition",
          style.pill,
          "hover:brightness-95",
          pending && "opacity-60",
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
        {!compact && (
          <span className={cn(style.strike && "line-through")}>{label}</span>
        )}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-2.5 w-2.5 opacity-70"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          // Positioned in line below the pill. min-width keeps the
          // descriptions readable; max-width prevents the popover from
          // hijacking the whole table on small screens.
          className="absolute right-0 top-full z-30 mt-1.5 w-[260px] max-w-[80vw] rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg"
        >
          <div className="px-2 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-500">
            {t("title")}
          </div>
          {ORDER.map((s) => {
            const active = s === current;
            const sty = STYLE[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => pick(s)}
                disabled={pending}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition",
                  active
                    ? "bg-primary-50"
                    : "hover:bg-neutral-50",
                  pending && "opacity-60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1 h-2 w-2 flex-shrink-0 rounded-full",
                    sty.dot,
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[12px] font-semibold text-neutral-800",
                      sty.strike && "text-neutral-500 line-through",
                    )}
                  >
                    {t(`label.${s}` as never)}
                  </span>
                  <span className="block text-[11px] text-neutral-500">
                    {t(`desc.${s}` as never)}
                  </span>
                </span>
                {active && (
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mt-1 h-3 w-3 flex-shrink-0 text-primary-700"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

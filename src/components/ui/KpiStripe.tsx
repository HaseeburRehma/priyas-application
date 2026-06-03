import type React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * One color-striped KPI tile.
 *
 * Pattern lifted from the prototype's Objects / Employees / Invoices /
 * Employee-overview screens. A 4 px stripe at the top tints the tile to
 * its semantic family (primary / secondary / danger / warning / neutral),
 * with a label above a large display number and an optional
 * caption / sub-line beneath.
 *
 *   <KpiStripe stripe="primary" label="REVENUE YTD" value="€184,260"
 *              sub="net VAT · +18.4% YoY" />
 *
 * Lives in `components/ui/` because every list-style page reuses it.
 */
export type KpiStripeTone =
  | "primary"
  | "secondary"
  | "danger"
  | "warning"
  | "neutral";

export function KpiStripe({
  stripe = "primary",
  label,
  value,
  suffix,
  sub,
  /** Optional icon rendered top-right (e.g. a small money badge). */
  icon,
  /** Extra utility classes. */
  className,
}: {
  stripe?: KpiStripeTone;
  label: string;
  value: React.ReactNode;
  suffix?: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  const stripeBg = {
    primary:   "bg-primary-500",
    secondary: "bg-secondary-500",
    danger:    "bg-error-500",
    warning:   "bg-warning-500",
    neutral:   "bg-neutral-300",
  }[stripe];
  const iconBg = {
    primary:   "bg-primary-50  text-primary-700",
    secondary: "bg-secondary-50 text-secondary-700",
    danger:    "bg-error-50    text-error-700",
    warning:   "bg-warning-50  text-warning-700",
    neutral:   "bg-neutral-100 text-neutral-700",
  }[stripe];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-neutral-100 bg-white p-4",
        className,
      )}
    >
      <span className={cn("absolute inset-x-0 top-0 h-1", stripeBg)} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-neutral-500">
            {label}
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-[26px] font-bold tracking-[-0.02em] text-secondary-500">
              {value}
            </span>
            {suffix}
          </div>
          {sub && <div className="mt-1 text-[11px] text-neutral-500">{sub}</div>}
        </div>
        {icon && (
          <div
            className={cn(
              "grid h-8 w-8 flex-shrink-0 place-items-center rounded-md",
              iconBg,
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

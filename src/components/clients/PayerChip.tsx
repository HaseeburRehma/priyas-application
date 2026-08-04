import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";

/**
 * Colour-coded pill showing how a customer pays.
 *
 * Priya's team asked for this on 4 Aug 2026 so the Alltagshelfer roster
 * flags at a glance whether a customer's services go through the care
 * fund (Pflegekasse), a health insurance, private pay, or a commercial
 * invoice.
 *
 * `payer_type` NULL → no chip rendered. The caller decides.
 */

export type PayerType =
  | "care_fund"
  | "private_pay"
  | "insurance"
  | "commercial";

export function PayerChip({
  payer,
  size = "md",
}: {
  payer: PayerType | null | undefined;
  size?: "sm" | "md";
}) {
  const t = useTranslations("clients.payer");
  if (!payer) return null;

  const map = {
    care_fund: {
      bg: "bg-primary-50",
      fg: "text-primary-700",
      dot: "bg-primary-500",
    },
    insurance: {
      bg: "bg-secondary-50",
      fg: "text-secondary-700",
      dot: "bg-secondary-500",
    },
    private_pay: {
      bg: "bg-warning-50",
      fg: "text-warning-700",
      dot: "bg-warning-500",
    },
    commercial: {
      bg: "bg-neutral-100",
      fg: "text-neutral-700",
      dot: "bg-neutral-500",
    },
  } as const;
  const c = map[payer];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-[0.04em]",
        c.bg,
        c.fg,
        size === "sm"
          ? "px-2 py-0.5 text-[9.5pt]"
          : "px-2.5 py-0.5 text-[10pt]",
      )}
      title={t(`${payer}.hint` as never)}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {t(`${payer}.label` as never)}
    </span>
  );
}

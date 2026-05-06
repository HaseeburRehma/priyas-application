import { cn } from "@/lib/utils/cn";

type Tone = "green" | "blue" | "orange" | "red";
type DeltaTone = "up" | "down" | "neutral";

const toneStyles: Record<Tone, { ring: string; iconBg: string; iconText: string }> = {
  green: {
    ring: "before:bg-primary-500",
    iconBg: "bg-primary-50",
    iconText: "text-primary-600",
  },
  blue: {
    ring: "before:bg-secondary-500",
    iconBg: "bg-secondary-50",
    iconText: "text-secondary-600",
  },
  orange: {
    ring: "before:bg-warning-500",
    iconBg: "bg-warning-50",
    iconText: "text-warning-700",
  },
  red: {
    ring: "before:bg-error-500",
    iconBg: "bg-error-50",
    iconText: "text-error-700",
  },
};

const deltaStyles: Record<DeltaTone, string> = {
  up: "bg-success-50 text-success-700",
  down: "bg-error-50 text-error-700",
  neutral: "bg-neutral-100 text-neutral-600",
};

type Props = {
  tone: Tone;
  label: string;
  value: string | number;
  sub?: string;
  delta?: string;
  deltaTone?: DeltaTone;
  icon: React.ReactNode;
};

export function KpiCard({
  tone,
  label,
  value,
  sub,
  delta,
  deltaTone = "neutral",
  icon,
}: Props) {
  const t = toneStyles[tone];
  return (
    <article
      className={cn(
        "card relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-md",
        "before:pointer-events-none before:absolute before:right-0 before:top-0 before:h-20 before:w-20 before:rounded-full before:opacity-[.08] before:blur-2xl",
        t.ring,
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "grid h-9 w-9 place-items-center rounded-md",
            t.iconBg,
            t.iconText,
          )}
        >
          <span className="[&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:stroke-2">
            {icon}
          </span>
        </div>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              deltaStyles[deltaTone],
            )}
          >
            {delta}
          </span>
        )}
      </div>
      <div className="mt-3 text-[12px] font-medium uppercase tracking-[0.03em] text-neutral-500">
        {label}
      </div>
      <div className="mt-0.5 text-[28px] font-bold leading-tight tracking-tightest text-secondary-500">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[12px] text-neutral-500">{sub}</div>}
    </article>
  );
}

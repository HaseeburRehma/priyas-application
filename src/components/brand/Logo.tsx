import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/**
 * Centralised brand mark for Priya's Reinigungsservice.
 *
 * Renders `/priya-logo.png` (the wordmark image dropped in
 * `public/priya-logo.png`). Two surfaces:
 *  - <LogoMark />  — image only, square-ish, for tight spots (collapsed
 *                    sidebar, favicon-ish slots, PDF/email headers).
 *  - <Logo />      — image + optional subtitle line for nav rails and
 *                    hero panels.
 *
 * Variants:
 *  - "light" → for dark backgrounds (sidebar / auth hero). Subtitle in
 *              accent-300. The source PNG is black-on-transparent, so on
 *              dark surfaces we apply `filter: invert(1)` to flip it to
 *              white-on-transparent. This matches the Figma reference
 *              where the wordmark sits *directly* on the navy with no
 *              card framing it.
 *  - "dark"  → for white backgrounds (page headers, auth card body).
 *              The PNG renders as-is — black ink on white.
 *
 * Why a filter rather than an SVG re-creation? The Figma export ships
 * the artwork at intrinsic fidelity (thin strokes + the stylised P
 * monogram + spaced uppercase wordmark), which would be lossy to
 * hand-redraw as inline SVG. A two-line CSS filter preserves the
 * source artwork verbatim and just rebalances the value channel.
 *
 * If you ever ship a redesign, swap the file at `/priya-logo.png` and
 * every render in the app picks it up.
 */

const LOGO_SRC = "/priya-logo.png";
// Original asset's intrinsic size; needed by next/image for layout
// stability. Kept as a constant so the size-multiplier math below
// stays honest.
const NATIVE_W = 110;
const NATIVE_H = 44;

export type LogoSize = "sm" | "md" | "lg" | "xl";
export type LogoVariant = "light" | "dark";

// Each size renders the image at a fixed height; width scales with the
// natural aspect ratio. Heights match the previous tile sizes so
// existing layouts don't reflow when we swap in the bitmap.
//
// The source asset is 110 × 44 — capping at `xl` (56 px tall, ~1.3×
// the native height) keeps the bitmap sharp. Larger renderings will
// be visibly blurry; ship a higher-res asset before raising this
// ceiling.
const SIZE_MAP: Record<
  LogoSize,
  { height: number; word: string; subtitle: string }
> = {
  sm: { height: 24, word: "text-[12px]", subtitle: "text-[9px]" },
  md: { height: 32, word: "text-[14px]", subtitle: "text-[10px]" },
  lg: { height: 40, word: "text-[15px]", subtitle: "text-[11px]" },
  xl: { height: 56, word: "text-[18px]", subtitle: "text-[12px]" },
};

function widthFor(height: number): number {
  return Math.round((height / NATIVE_H) * NATIVE_W);
}

type MarkProps = {
  size?: LogoSize;
  /** Adds a soft drop-shadow that reads well on darker gradients. */
  glow?: boolean;
  /** Invert the source PNG (black → white) so the logo reads on a
   *  dark background. Use when rendering on the navy sidebar / auth
   *  hero; leave off for white-background surfaces. */
  inverted?: boolean;
  className?: string;
};

/** Just the wordmark image — no extra text. */
export function LogoMark({
  size = "md",
  glow = false,
  inverted = false,
  className,
}: MarkProps) {
  const sz = SIZE_MAP[size];
  const w = widthFor(sz.height);
  return (
    <Image
      src={LOGO_SRC}
      alt="Priya's"
      width={w}
      height={sz.height}
      // The bitmap is small (≈1.7 KB) and already optimised; bypass
      // next/image's optimizer so the dev server doesn't lazily fetch
      // a re-encoded variant per-request.
      unoptimized
      priority
      className={cn(
        "block flex-shrink-0 select-none",
        // The filter chain on dark backgrounds: `brightness(0)` first
        // forces all opaque pixels to black so antialiased edges stop
        // mixing back toward white; `invert(1)` then flips that to
        // pure white. The combined effect is "white ink with the
        // source PNG's exact alpha channel preserved" — which is
        // what makes the logo sit cleanly on the navy.
        inverted && "[filter:brightness(0)_invert(1)]",
        glow && "drop-shadow-[0_6px_18px_rgba(114,169,79,.35)]",
        className,
      )}
      style={{ width: `${w}px`, height: `${sz.height}px` }}
    />
  );
}

type Props = {
  size?: LogoSize;
  variant?: LogoVariant;
  /** Optional secondary line under the wordmark (e.g. "OPERATION"). */
  subtitle?: string | null;
  /** Render the wordmark image only — useful for collapsed sidebar
   *  states where there's no room for the subtitle line. */
  markOnly?: boolean;
  className?: string;
};

export function Logo({
  size = "md",
  variant = "dark",
  subtitle,
  markOnly = false,
  className,
}: Props) {
  const sz = SIZE_MAP[size];
  const isLight = variant === "light";

  if (markOnly) {
    return (
      <LogoMark
        size={size}
        glow={isLight}
        inverted={isLight}
        className={className}
      />
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LogoMark size={size} glow={isLight} inverted={isLight} />
      {subtitle ? (
        <div className="min-w-0">
          {/* Spacer matched to the previous wordmark's text height so
              layouts that allocated room for the "Priya's" line don't
              suddenly look cramped now that it lives inside the
              image. */}
          <div aria-hidden className={cn(sz.word, "leading-none opacity-0")}>
            &nbsp;
          </div>
          <div
            className={cn(
              "mt-0.5 font-semibold uppercase tracking-[0.08em]",
              sz.subtitle,
              isLight ? "text-accent-300" : "text-accent-500",
            )}
          >
            {subtitle}
          </div>
        </div>
      ) : null}
    </div>
  );
}

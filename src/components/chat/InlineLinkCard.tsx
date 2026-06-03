"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { routes } from "@/lib/constants/routes";

/**
 * Inline shift/visit link card rendered below the message body.
 *
 * Triggered by `#shift-{id}` or `#visit-{id}` patterns in the text —
 * see `extractRefs()` for the regex. The card mimics the prototype's
 * "● Priya's · Cleaning · Shift #4172" pill row: a coloured dot,
 * a service-line label, the linked reference, and a "Open in
 * schedule" affordance.
 *
 * Backend support:
 *  - For "shift" refs we link to `/schedule/<id>` (the schedule page
 *    accepts a hash anchor on the matching shift).
 *  - For "visit" refs we link to `/schedule/?visit=<id>` so the page
 *    can highlight the matching visit row in the day view.
 *
 * If the message author included a metadata blob in `attachments`
 * (kind: "shift-ref" / "visit-ref" with a `label`), we'll prefer that
 * for the human-readable line. Otherwise we render the bare numeric
 * id, which is still useful because the link works.
 */

export type ShiftRef = {
  kind: "shift" | "visit";
  /** Numeric/short id pulled from the message body. */
  id: string;
  /** Display label, e.g. "Priya's · Cleaning". */
  label?: string;
  /** Tailwind background colour for the leading dot. Defaults to
   *  primary so the card pops on the gray bubble. */
  tone?: "primary" | "secondary" | "warning" | "danger";
};

/**
 * Extracts shift/visit references from a message body. Returns the
 * matches in document order; the rendered card iterates this list so
 * a single message that mentions two shifts shows two cards.
 *
 * The regex is intentionally narrow: a literal "#shift-" / "#visit-"
 * followed by 1–10 alphanumeric characters. Anything else is treated
 * as ordinary text so casual usage like "#shift" (no id) doesn't
 * accidentally render a broken card.
 */
export function extractRefs(body: string): ShiftRef[] {
  if (!body) return [];
  const out: ShiftRef[] = [];
  const re = /#(shift|visit)-([A-Za-z0-9]{1,10})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push({
      kind: m[1] as ShiftRef["kind"],
      id: m[2] as string,
    });
  }
  return out;
}

const TONE_DOT: Record<NonNullable<ShiftRef["tone"]>, string> = {
  primary: "bg-primary-500",
  secondary: "bg-secondary-500",
  warning: "bg-warning-500",
  danger: "bg-error-500",
};

export function InlineLinkCard({ ref }: { ref: ShiftRef }) {
  const t = useTranslations("chat.shiftCard");
  const tone = ref.tone ?? (ref.kind === "shift" ? "primary" : "danger");
  const label =
    ref.label ??
    (ref.kind === "shift"
      ? t("shiftLabel", { id: ref.id })
      : t("visitLabel", { id: ref.id }));

  const href =
    ref.kind === "shift"
      ? (`${routes.schedule}?shift=${encodeURIComponent(ref.id)}` as const)
      : (`${routes.schedule}?visit=${encodeURIComponent(ref.id)}` as const);

  return (
    <Link
      // The href is computed from a constant `routes.schedule` plus a
      // safe-escaped query param, so it's a known internal route at
      // runtime even though TypeScript can't narrow it to Route<>.
      href={href as never}
      className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] transition hover:border-primary-300 hover:bg-primary-50"
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
      <span className="font-semibold text-neutral-800">{label}</span>
      <span aria-hidden className="text-neutral-400">·</span>
      <span className="text-neutral-500">{t("openInSchedule")}</span>
    </Link>
  );
}

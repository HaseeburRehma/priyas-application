/**
 * Static brand wordmarks that don't go through next-intl.
 *
 * Why not use `t()`? The dev server's webpack chunk cache (specifically
 * the `_rsc_messages_<locale>_json` synthetic module) is built from a
 * snapshot of the JSON file when the server first reads it. Adding a
 * new translation key to the JSON during a dev session leaves the
 * chunk stale until you wipe `.next/cache`. The Sidebar renders on
 * almost every route, so a missing-key crash there blanks the whole
 * shell — really painful during iteration. Brand text is a tiny
 * 3-locale table that's safe to keep in-source: it never changes
 * unless we rebrand, and a rebrand is a code change anyway.
 *
 * The runtime fallback (return `"Operation"` for unknown locales) also
 * means the Sidebar can never crash on a malformed locale cookie.
 */

const SUBTITLE: Record<string, string> = {
  de: "Betrieb",
  en: "Operation",
  ta: "செயல்பாடு",
};

export function brandSubtitleFor(locale: string): string {
  return SUBTITLE[locale] ?? SUBTITLE.en ?? "Operation";
}

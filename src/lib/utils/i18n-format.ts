/**
 * Locale-aware formatting helpers.
 *
 * Why this module exists: spec §5 promises proper date/number formatting per
 * the user's selected language (DE / EN / TA). Before this file landed, the
 * codebase had `Intl.NumberFormat("de-DE", …)` and `format(date, "yyyy-MM-dd")`
 * sprinkled everywhere — EN and TA users saw German dates and German thousand
 * separators. Use these helpers everywhere rather than calling `Intl.*` or
 * `date-fns/format` directly.
 *
 * Two flavours are exported:
 *
 *   • Pure functions (`formatDate(d, "en", …)`) — for SSR / loaders / PDFs
 *     where the active locale is read from `cookies()` or passed in.
 *
 *   • `useFormat()` hook — for client components, returns helpers bound to
 *     the active next-intl locale.
 *
 * The pure functions are deliberately small — most callers want one of three
 * things:
 *     short date  → "15.01.26" / "1/15/26" / "15-01-26"
 *     long date   → "15. Januar 2026" / "January 15, 2026" / "15 ஜனவரி 2026"
 *     time only   → "14:30" / "2:30 PM" / "மதியம் 2:30"
 */
import { format as dfnsFormat, formatDistanceToNowStrict } from "date-fns";
import { de as deLocale, enUS as enLocale, ta as taLocale } from "date-fns/locale";
import type { Locale } from "date-fns";

/* -------------------------------------------------------------------------
 * Locale plumbing
 * ----------------------------------------------------------------------- */

/** App-supported short codes used everywhere in the codebase. */
export type AppLocale = "de" | "en" | "ta";

/** Map an AppLocale to a BCP-47 tag for `Intl.*`. */
const BCP47: Record<AppLocale, string> = {
  de: "de-DE",
  en: "en-US",
  ta: "ta-IN",
};

/** Map an AppLocale to a `date-fns/locale` instance. */
const DATE_FNS: Record<AppLocale, Locale> = {
  de: deLocale,
  en: enLocale,
  ta: taLocale,
};

/** Coerce arbitrary input to a known AppLocale; falls back to "de" (the
 *  app's primary locale per the spec). */
export function asAppLocale(input: string | null | undefined): AppLocale {
  const v = (input ?? "").toLowerCase().slice(0, 2);
  if (v === "de" || v === "en" || v === "ta") return v;
  return "de";
}

export function bcp47Of(locale: AppLocale): string {
  return BCP47[locale];
}

export function dateFnsLocaleOf(locale: AppLocale): Locale {
  return DATE_FNS[locale];
}

/* -------------------------------------------------------------------------
 * Date / time
 * ----------------------------------------------------------------------- */

type DateInput = Date | string | number | null | undefined;

/** Coerce a string/number/Date to Date, returning null for invalid input. */
function toDate(input: DateInput): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Short numeric date — "15.01.2026" / "1/15/2026" / "15-01-2026". Use when
 * vertical density matters (table cells, list items). Returns "—" for null.
 */
export function formatDate(input: DateInput, locale: AppLocale): string {
  const d = toDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(BCP47[locale], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Long-form date — "15. Januar 2026" / "January 15, 2026". For headers,
 * detail panels, and anywhere there's room.
 */
export function formatDateLong(input: DateInput, locale: AppLocale): string {
  const d = toDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(BCP47[locale], {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

/** Day + month only — "15. Jan" / "Jan 15". Useful for week labels etc. */
export function formatDayMonth(input: DateInput, locale: AppLocale): string {
  const d = toDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(BCP47[locale], {
    month: "short",
    day: "numeric",
  }).format(d);
}

/** "Mo, 15. Jan" / "Mon, Jan 15" — weekday + day + short-month. */
export function formatWeekdayShort(
  input: DateInput,
  locale: AppLocale,
): string {
  const d = toDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(BCP47[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

/** Time only — "14:30" / "2:30 PM". 24h in DE/TA, 12h in EN. */
export function formatTime(input: DateInput, locale: AppLocale): string {
  const d = toDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(BCP47[locale], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Date + time — "15.01.2026, 14:30" / "1/15/2026, 2:30 PM". */
export function formatDateTime(
  input: DateInput,
  locale: AppLocale,
): string {
  const d = toDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(BCP47[locale], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** "Vor 3 Stunden" / "3 hours ago" / "3 மணிநேரத்திற்கு முன்". */
export function formatRelative(
  input: DateInput,
  locale: AppLocale,
): string {
  const d = toDate(input);
  if (!d) return "—";
  return formatDistanceToNowStrict(d, {
    addSuffix: true,
    locale: DATE_FNS[locale],
  });
}

/**
 * Date-fns format passthrough using the right locale. Use for cases where
 * you really want a custom token string ("EEEE · d. MMMM yyyy") and the
 * default helpers above don't fit. Prefer the named helpers when possible
 * — they're locale-correct without needing token knowledge.
 */
export function formatPattern(
  input: DateInput,
  pattern: string,
  locale: AppLocale,
): string {
  const d = toDate(input);
  if (!d) return "—";
  return dfnsFormat(d, pattern, { locale: DATE_FNS[locale] });
}

/* -------------------------------------------------------------------------
 * Numbers / currency
 * ----------------------------------------------------------------------- */

/** Format a number with locale-aware thousands separators + decimals. */
export function formatNumber(
  n: number,
  locale: AppLocale,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(BCP47[locale], options).format(n);
}

/** Format an EUR amount given as cents — "1.234 €" / "€1,234" / "₹1,234". */
export function formatCurrencyCents(
  cents: number,
  locale: AppLocale,
  options: Omit<Intl.NumberFormatOptions, "style"> = {},
): string {
  return new Intl.NumberFormat(BCP47[locale], {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    ...options,
  }).format(cents / 100);
}

/** Format an EUR amount given as a regular number (e.g. €/h). */
export function formatCurrency(
  amount: number,
  locale: AppLocale,
  options: Omit<Intl.NumberFormatOptions, "style"> = {},
): string {
  return new Intl.NumberFormat(BCP47[locale], {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount);
}

/* -------------------------------------------------------------------------
 * Client hook (next-intl-aware)
 * ----------------------------------------------------------------------- */

// Imported at the bottom on purpose — this module also runs server-side
// (PDFs, loaders) where next-intl client hooks aren't usable.

import { useLocale } from "next-intl";

/**
 * Convenience hook for client components: returns helpers pre-bound to
 * the active locale, so components can call `f.date(x)` instead of
 * `formatDate(x, locale)`.
 */
export function useFormat() {
  const raw = useLocale();
  const locale = asAppLocale(raw);
  return {
    locale,
    bcp47: bcp47Of(locale),
    dateFnsLocale: dateFnsLocaleOf(locale),
    date: (d: DateInput) => formatDate(d, locale),
    dateLong: (d: DateInput) => formatDateLong(d, locale),
    dayMonth: (d: DateInput) => formatDayMonth(d, locale),
    weekdayShort: (d: DateInput) => formatWeekdayShort(d, locale),
    time: (d: DateInput) => formatTime(d, locale),
    dateTime: (d: DateInput) => formatDateTime(d, locale),
    relative: (d: DateInput) => formatRelative(d, locale),
    pattern: (d: DateInput, p: string) => formatPattern(d, p, locale),
    number: (n: number, opts?: Intl.NumberFormatOptions) =>
      formatNumber(n, locale, opts),
    currencyCents: (c: number, opts?: Intl.NumberFormatOptions) =>
      formatCurrencyCents(c, locale, opts),
    currency: (n: number, opts?: Intl.NumberFormatOptions) =>
      formatCurrency(n, locale, opts),
  };
}

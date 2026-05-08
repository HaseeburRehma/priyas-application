/**
 * @deprecated Use src/lib/utils/i18n-format.ts for new code. The
 * functions here hard-code `de-DE` and don't honour the user's locale.
 * Kept around only so the re-export at src/lib/api/dashboard.ts:428
 * keeps compiling — nothing imports them directly today.
 */

export function formatEUR(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** @deprecated Use formatDateLong from i18n-format.ts. */
export function formatLongDate(d = new Date(), locale = "de-DE"): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function germanGreetingKey(d = new Date()): "morning" | "afternoon" | "evening" {
  const h = d.getHours();
  if (h < 11) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

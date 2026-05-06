/**
 * Client-safe formatting helpers. No server-only deps.
 */

export function formatEUR(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Long-form date in the given locale. Falls back to de-DE. */
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

/** Pure date helpers for fixed-contract (monthly flat-fee) clients. */

function parseIso(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y!, m!, d!];
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Last day of a contract starting on `startIso` that runs `months` months,
 * e.g. 2026-10-01 + 12 → 2027-09-30. If the start day doesn't exist in the
 * end month (Jan 31 + 1), the contract ends on that month's last day.
 */
export function contractEndDate(startIso: string, months: number): string {
  const [y, m, d] = parseIso(startIso);
  const targetMonth = m - 1 + months;
  const targetYear = y + Math.floor(targetMonth / 12);
  const targetMonthIndex = ((targetMonth % 12) + 12) % 12;
  const end = new Date(Date.UTC(targetYear, targetMonthIndex, d));
  end.setUTCDate(end.getUTCDate() - 1);
  const lastOfMonth = new Date(
    Date.UTC(targetYear, targetMonthIndex, daysInMonth(targetYear, targetMonthIndex)),
  );
  return (end > lastOfMonth ? lastOfMonth : end).toISOString().slice(0, 10);
}

/** Calendar months touched by the inclusive range, e.g. Oct 1–31 → 1. */
export function monthsInPeriod(startIso: string, endIso: string): number {
  const [ys, ms] = parseIso(startIso);
  const [ye, me] = parseIso(endIso);
  return Math.max(1, (ye - ys) * 12 + (me - ms) + 1);
}

/** "10/2026", or "09/2026–10/2026" when the range spans several months. */
export function periodMonthLabel(startIso: string, endIso: string): string {
  const [ys, ms] = parseIso(startIso);
  const [ye, me] = parseIso(endIso);
  const a = `${String(ms).padStart(2, "0")}/${ys}`;
  const b = `${String(me).padStart(2, "0")}/${ye}`;
  return a === b ? a : `${a}–${b}`;
}

/** Whole days from today (UTC date) until `endIso`; negative once passed. */
export function daysUntil(endIso: string, today: Date = new Date()): number {
  const [y, m, d] = parseIso(endIso);
  const end = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((end - now) / 86_400_000);
}

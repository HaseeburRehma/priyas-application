/**
 * Money math. Integer cents in, integer cents out. All rounding done
 * deterministically (banker's-rounding-free, half-up) to keep test outputs
 * stable across platforms.
 */

/** Round half-away-from-zero to the nearest integer cent. */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value >= 0
    ? Math.floor(value + 0.5)
    : -Math.floor(-value + 0.5);
}

/** Convert minutes × cents-per-hour into cents (rounded). */
export function minutesAtRate(minutes: number, rateCents: number): number {
  if (minutes <= 0 || rateCents <= 0) return 0;
  return roundCents((minutes / 60) * rateCents);
}

/**
 * Compute subtotal (sum of qty × unitPrice), tax (subtotal × rate%), and total.
 * Per-line tax is summed before rounding the total — German VAT calculation
 * is done at the invoice level, not per line.
 */
export function summarize(
  items: ReadonlyArray<{ quantity: number; unitPriceCents: number; taxRatePercent: number }>,
): { subtotalCents: number; taxCents: number; totalCents: number } {
  let subtotal = 0;
  let tax = 0;
  // Bucket tax by rate so a mixed-rate invoice stays legal in Germany
  // (each rate must be totalled separately on the printed PDF).
  const buckets = new Map<number, number>();
  for (const it of items) {
    const lineNet = it.quantity * it.unitPriceCents;
    subtotal += lineNet;
    buckets.set(it.taxRatePercent, (buckets.get(it.taxRatePercent) ?? 0) + lineNet);
  }
  for (const [rate, base] of buckets) {
    tax += roundCents((base * rate) / 100);
  }
  subtotal = roundCents(subtotal);
  const total = subtotal + tax;
  return { subtotalCents: subtotal, taxCents: tax, totalCents: total };
}

/** Format integer cents as German EUR string: "1.234,56 €". */
export function formatEUR(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = (abs % 100).toString().padStart(2, "0");
  // Group euros with dots (German thousands separator).
  const grouped = euros
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${grouped},${rest} €`;
}

/** Format ISO date as DD.MM.YYYY. */
export function formatDateDE(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

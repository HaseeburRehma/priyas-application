/**
 * Invoice presentation helpers shared by the invoice list and detail
 * screens (kept out of app/ so expo-router only sees screens there).
 */

import { de, enUS, ta } from "date-fns/locale";
import { Badge, type Tone } from "@/components/ui";
import { type InvoiceRow, type InvoiceStatus } from "@/lib/invoices";
import { i18n, t } from "@/lib/i18n";

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/** date-fns locale matching the app language. */
export function dfLocale() {
  return i18n.locale === "en" ? enUS : i18n.locale === "ta" ? ta : de;
}

/** Share already paid when an open invoice is partially settled. */
export function partialShare(r: InvoiceRow): number | null {
  const paid = r.paid_amount_cents ?? 0;
  if ((r.status !== "sent" && r.status !== "overdue") || paid <= 0 || r.total_cents <= 0) {
    return null;
  }
  return paid < r.total_cents ? paid / r.total_cents : null;
}

const STATUS_TONE: Record<InvoiceStatus, Tone> = {
  draft: "neutral",
  sent: "info",
  paid: "success",
  overdue: "error",
  cancelled: "neutral",
};

export function StatusChip({ status, dot = false }: { status: InvoiceStatus; dot?: boolean }) {
  return (
    <Badge
      label={t(`mobile.invoices.status.${status}`)}
      tone={STATUS_TONE[status]}
      dot={dot}
    />
  );
}

export function formatEUR(cents: number): string {
  return eur.format(cents / 100);
}

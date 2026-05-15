import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InvoiceDetail } from "@/lib/api/invoices.types";
import { renderAlltagshilfeInvoicePdf } from "./invoice-ah-pdf";

const PAGE_W = 595; // A4 portrait, 72dpi
const PAGE_H = 842;
const MARGIN = 48;

const COLOR_PRIMARY = rgb(114 / 255, 169 / 255, 79 / 255);
const COLOR_SECONDARY = rgb(22 / 255, 88 / 255, 124 / 255);
const COLOR_NEUTRAL_700 = rgb(65 / 255, 75 / 255, 64 / 255);
const COLOR_NEUTRAL_500 = rgb(120 / 255, 133 / 255, 122 / 255);
const COLOR_NEUTRAL_200 = rgb(221 / 255, 227 / 255, 218 / 255);

function fmtEUR(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

type Org = {
  name: string;
  vat_id?: string | null;
  address?: string | null;
  email?: string | null;
};

/**
 * Renders an invoice as a single-page A4 PDF and returns the bytes.
 *
 * Dispatches by `invoice_kind`:
 *   - "alltagshilfe" → insurance-format template (no VAT, budget tracker,
 *      service code, care recipient block) in alltagshilfe-pdf.ts.
 *   - default       → standard German Rechnung (this file).
 *
 * Pure pdf-lib so it works in any runtime (Node + Edge).
 */
export async function renderInvoicePdf(
  invoice: InvoiceDetail,
  org: Org,
): Promise<Uint8Array> {
  if (invoice.invoice_kind === "alltagshilfe") {
    return renderAlltagshilfeInvoicePdf(invoice, org);
  }
  return renderRegularInvoicePdf(invoice, org);
}

async function renderRegularInvoicePdf(
  invoice: InvoiceDetail,
  org: Org,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_H - MARGIN;

  // Header
  page.drawText(org.name, {
    x: MARGIN,
    y,
    size: 16,
    font: helvBold,
    color: COLOR_SECONDARY,
  });
  y -= 18;
  if (org.address) drawText(page, org.address, MARGIN, y, helv, 9, COLOR_NEUTRAL_500);
  if (org.address) y -= 12;
  if (org.email) drawText(page, org.email, MARGIN, y, helv, 9, COLOR_NEUTRAL_500);
  if (org.email) y -= 12;
  if (org.vat_id) {
    drawText(page, `USt-IdNr.: ${org.vat_id}`, MARGIN, y, helv, 9, COLOR_NEUTRAL_500);
    y -= 12;
  }

  // Right-aligned: invoice number + status pill
  drawTextRight(page, "RECHNUNG", PAGE_W - MARGIN, PAGE_H - MARGIN, helvBold, 11, COLOR_PRIMARY);
  drawTextRight(
    page,
    invoice.invoice_number,
    PAGE_W - MARGIN,
    PAGE_H - MARGIN - 18,
    helvBold,
    16,
    COLOR_SECONDARY,
  );
  drawTextRight(
    page,
    invoice.status.toUpperCase(),
    PAGE_W - MARGIN,
    PAGE_H - MARGIN - 36,
    helv,
    9,
    COLOR_NEUTRAL_500,
  );

  y = Math.min(y, PAGE_H - MARGIN - 60) - 24;

  // Divider
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5,
    color: COLOR_NEUTRAL_200,
  });
  y -= 24;

  // Bill-to + meta in two columns
  drawText(page, "Rechnungsempfänger", MARGIN, y, helvBold, 9, COLOR_NEUTRAL_500);
  drawText(
    page,
    "Rechnungsdaten",
    PAGE_W / 2 + 20,
    y,
    helvBold,
    9,
    COLOR_NEUTRAL_500,
  );
  y -= 14;

  drawText(page, invoice.client.display_name, MARGIN, y, helvBold, 11, COLOR_NEUTRAL_700);
  drawText(
    page,
    `Ausgestellt: ${invoice.issue_date}`,
    PAGE_W / 2 + 20,
    y,
    helv,
    10,
    COLOR_NEUTRAL_700,
  );
  y -= 14;
  if (invoice.client.email) {
    drawText(page, invoice.client.email, MARGIN, y, helv, 10, COLOR_NEUTRAL_500);
  }
  if (invoice.due_date) {
    drawText(
      page,
      `Fällig: ${invoice.due_date}`,
      PAGE_W / 2 + 20,
      y,
      helv,
      10,
      COLOR_NEUTRAL_700,
    );
  }
  y -= 14;
  if (invoice.client.phone) {
    drawText(page, invoice.client.phone, MARGIN, y, helv, 10, COLOR_NEUTRAL_500);
  }
  if (invoice.client.tax_id) {
    drawText(
      page,
      `USt-IdNr.: ${invoice.client.tax_id}`,
      PAGE_W / 2 + 20,
      y,
      helv,
      10,
      COLOR_NEUTRAL_500,
    );
  }
  y -= 28;

  // Line items header
  page.drawRectangle({
    x: MARGIN,
    y: y - 4,
    width: PAGE_W - MARGIN * 2,
    height: 22,
    color: rgb(248 / 255, 250 / 255, 247 / 255),
  });
  drawText(page, "#", MARGIN + 8, y + 4, helvBold, 9, COLOR_NEUTRAL_500);
  drawText(page, "BESCHREIBUNG", MARGIN + 30, y + 4, helvBold, 9, COLOR_NEUTRAL_500);
  drawTextRight(page, "MENGE", MARGIN + 340, y + 4, helvBold, 9, COLOR_NEUTRAL_500);
  drawTextRight(page, "PREIS", MARGIN + 410, y + 4, helvBold, 9, COLOR_NEUTRAL_500);
  drawTextRight(
    page,
    "GESAMT",
    PAGE_W - MARGIN - 8,
    y + 4,
    helvBold,
    9,
    COLOR_NEUTRAL_500,
  );
  y -= 22;

  // Items
  for (const [idx, item] of invoice.items.entries()) {
    if (y < 180) break; // safety: stop before footer; multi-page TODO
    drawText(
      page,
      String(idx + 1).padStart(2, "0"),
      MARGIN + 8,
      y - 12,
      helv,
      10,
      COLOR_NEUTRAL_500,
    );
    drawText(page, item.description, MARGIN + 30, y - 12, helv, 10, COLOR_NEUTRAL_700);
    drawTextRight(
      page,
      String(item.quantity),
      MARGIN + 340,
      y - 12,
      helv,
      10,
      COLOR_NEUTRAL_700,
    );
    drawTextRight(
      page,
      fmtEUR(item.unit_price_cents),
      MARGIN + 410,
      y - 12,
      helv,
      10,
      COLOR_NEUTRAL_700,
    );
    drawTextRight(
      page,
      fmtEUR(item.unit_price_cents * Number(item.quantity)),
      PAGE_W - MARGIN - 8,
      y - 12,
      helvBold,
      10,
      COLOR_SECONDARY,
    );
    y -= 22;
    page.drawLine({
      start: { x: MARGIN + 8, y },
      end: { x: PAGE_W - MARGIN - 8, y },
      thickness: 0.5,
      color: COLOR_NEUTRAL_200,
    });
  }

  // Totals
  y -= 16;
  drawTextRight(page, "Zwischensumme", MARGIN + 410, y, helv, 10, COLOR_NEUTRAL_500);
  drawTextRight(
    page,
    fmtEUR(invoice.subtotal_cents),
    PAGE_W - MARGIN - 8,
    y,
    helv,
    10,
    COLOR_NEUTRAL_700,
  );
  y -= 16;
  drawTextRight(page, "USt. 19%", MARGIN + 410, y, helv, 10, COLOR_NEUTRAL_500);
  drawTextRight(
    page,
    fmtEUR(invoice.tax_cents),
    PAGE_W - MARGIN - 8,
    y,
    helv,
    10,
    COLOR_NEUTRAL_700,
  );
  y -= 18;
  page.drawLine({
    start: { x: MARGIN + 410 - 50, y: y + 4 },
    end: { x: PAGE_W - MARGIN, y: y + 4 },
    thickness: 0.7,
    color: COLOR_NEUTRAL_200,
  });
  drawTextRight(page, "GESAMT", MARGIN + 410, y, helvBold, 12, COLOR_NEUTRAL_700);
  drawTextRight(
    page,
    fmtEUR(invoice.total_cents),
    PAGE_W - MARGIN - 8,
    y,
    helvBold,
    14,
    COLOR_SECONDARY,
  );

  // Footer
  drawText(
    page,
    "Vielen Dank für Ihren Auftrag.",
    MARGIN,
    96,
    helv,
    9,
    COLOR_NEUTRAL_500,
  );
  if (invoice.notes) {
    drawText(page, invoice.notes, MARGIN, 80, helv, 8, COLOR_NEUTRAL_500);
  }

  return doc.save();
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawText(text, { x, y, size, font, color });
}
function drawTextRight(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x - w, y, size, font, color });
}

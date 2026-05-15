/**
 * Per-invoice Alltagshilfe (Entlastungsbetrag) template.
 *
 * This is distinct from `alltagshilfe-pdf.ts` (which renders a *monthly
 * cross-client report* for internal accounting). This one is a SINGLE
 * invoice in the format used to claim reimbursement from a client's
 * Pflegekasse: insurance reference block, service code (§ 45b SGB XI),
 * VAT-exempt note, signature lines and a year-budget tracker.
 */
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InvoiceDetail } from "@/lib/api/invoices.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;

const COLOR_PRIMARY = rgb(114 / 255, 169 / 255, 79 / 255);
const COLOR_SECONDARY = rgb(22 / 255, 88 / 255, 124 / 255);
const COLOR_NEUTRAL_700 = rgb(65 / 255, 75 / 255, 64 / 255);
const COLOR_NEUTRAL_500 = rgb(120 / 255, 133 / 255, 122 / 255);
const COLOR_NEUTRAL_200 = rgb(221 / 255, 227 / 255, 218 / 255);
const COLOR_BUDGET_BG = rgb(247 / 255, 250 / 255, 245 / 255);

type Org = {
  name: string;
  vat_id?: string | null;
  address?: string | null;
  email?: string | null;
};

function fmtEUR(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function fmtDE(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export async function renderAlltagshilfeInvoicePdf(
  invoice: InvoiceDetail,
  org: Org,
): Promise<Uint8Array> {
  // Optional annual-budget summary for the footer.
  let budget: {
    budget_cents: number;
    used_cents: number;
    remaining_cents: number;
    usage_percent: number;
  } | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const year =
      Number((invoice.issue_date ?? "").slice(0, 4)) || new Date().getFullYear();
    const { data } = await supabase
      .from("alltagshilfe_budgets")
      .select("budget_cents, used_cents, reserved_cents")
      .eq("client_id", invoice.client.id)
      .eq("year", year)
      .maybeSingle();
    const row = data as
      | { budget_cents: number; used_cents: number; reserved_cents: number }
      | null;
    if (row) {
      const used = Number(row.used_cents);
      const reserved = Number(row.reserved_cents);
      const budgetCents = Number(row.budget_cents);
      const remaining = Math.max(0, budgetCents - used - reserved);
      budget = {
        budget_cents: budgetCents,
        used_cents: used,
        remaining_cents: remaining,
        usage_percent:
          budgetCents > 0
            ? Math.min(100, Math.round(((used + reserved) / budgetCents) * 100))
            : 0,
      };
    }
  } catch {
    // Budget lookup is decorative — never fail PDF render because of it.
  }

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helvOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  let y = PAGE_H - MARGIN;

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

  drawTextRight(
    page,
    "RECHNUNG – ALLTAGSHILFE",
    PAGE_W - MARGIN,
    PAGE_H - MARGIN,
    helvBold,
    10,
    COLOR_PRIMARY,
  );
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
    "§ 45b SGB XI – Entlastungsbetrag",
    PAGE_W - MARGIN,
    PAGE_H - MARGIN - 36,
    helvOblique,
    9,
    COLOR_NEUTRAL_500,
  );

  y = Math.min(y, PAGE_H - MARGIN - 58) - 12;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5,
    color: COLOR_NEUTRAL_200,
  });
  y -= 22;

  drawText(page, "PFLEGEBEDÜRFTIGE PERSON", MARGIN, y, helvBold, 9, COLOR_NEUTRAL_500);
  drawText(page, "VERSICHERUNG", PAGE_W / 2 + 10, y, helvBold, 9, COLOR_NEUTRAL_500);
  y -= 14;
  drawText(page, invoice.client.display_name, MARGIN, y, helvBold, 11, COLOR_NEUTRAL_700);
  drawText(
    page,
    invoice.client.insurance_provider ?? "—",
    PAGE_W / 2 + 10,
    y,
    helv,
    10,
    COLOR_NEUTRAL_700,
  );
  y -= 14;
  if (invoice.client.phone) {
    drawText(page, invoice.client.phone, MARGIN, y, helv, 10, COLOR_NEUTRAL_500);
  }
  drawText(
    page,
    `Vers.-Nr.: ${invoice.client.insurance_number ?? "—"}`,
    PAGE_W / 2 + 10,
    y,
    helv,
    10,
    COLOR_NEUTRAL_500,
  );
  y -= 14;
  drawText(
    page,
    `Leistungscode: ${invoice.client.service_code ?? "Entlastungsbetrag § 45b SGB XI"}`,
    MARGIN,
    y,
    helvOblique,
    9,
    COLOR_NEUTRAL_500,
  );
  drawText(
    page,
    `Leistungszeitraum: ${fmtDE(invoice.period_start)} – ${fmtDE(invoice.period_end)}`,
    PAGE_W / 2 + 10,
    y,
    helv,
    9,
    COLOR_NEUTRAL_500,
  );
  y -= 24;

  page.drawRectangle({
    x: MARGIN,
    y: y - 4,
    width: PAGE_W - MARGIN * 2,
    height: 22,
    color: rgb(248 / 255, 250 / 255, 247 / 255),
  });
  drawText(page, "LEISTUNG", MARGIN + 8, y + 4, helvBold, 9, COLOR_NEUTRAL_500);
  drawTextRight(page, "STUNDEN", MARGIN + 340, y + 4, helvBold, 9, COLOR_NEUTRAL_500);
  drawTextRight(page, "€/STD", MARGIN + 410, y + 4, helvBold, 9, COLOR_NEUTRAL_500);
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

  for (const item of invoice.items) {
    if (y < 220) break;
    drawText(page, item.description, MARGIN + 8, y - 12, helv, 10, COLOR_NEUTRAL_700);
    drawTextRight(
      page,
      Number(item.quantity).toFixed(2),
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
      fmtEUR(Math.round(item.unit_price_cents * Number(item.quantity))),
      PAGE_W - MARGIN - 8,
      y - 12,
      helvBold,
      10,
      COLOR_SECONDARY,
    );
    y -= 18;
    page.drawLine({
      start: { x: MARGIN + 8, y },
      end: { x: PAGE_W - MARGIN - 8, y },
      thickness: 0.4,
      color: COLOR_NEUTRAL_200,
    });
  }

  y -= 18;
  drawTextRight(page, "GESAMTBETRAG", MARGIN + 410, y, helvBold, 12, COLOR_NEUTRAL_700);
  drawTextRight(
    page,
    fmtEUR(invoice.total_cents),
    PAGE_W - MARGIN - 8,
    y,
    helvBold,
    14,
    COLOR_SECONDARY,
  );
  y -= 16;
  drawTextRight(
    page,
    "Umsatzsteuerfrei gem. § 4 Nr. 16 UStG",
    PAGE_W - MARGIN - 8,
    y,
    helvOblique,
    8,
    COLOR_NEUTRAL_500,
  );

  if (budget) {
    const bx = MARGIN;
    const by = 175;
    page.drawRectangle({
      x: bx,
      y: by,
      width: PAGE_W - MARGIN * 2,
      height: 56,
      color: COLOR_BUDGET_BG,
    });
    drawText(
      page,
      "JAHRESBUDGET ENTLASTUNGSBETRAG",
      bx + 12,
      by + 40,
      helvBold,
      9,
      COLOR_NEUTRAL_500,
    );
    drawText(
      page,
      `Budget ${fmtEUR(budget.budget_cents)}   ·   Verbraucht ${fmtEUR(budget.used_cents)}   ·   Restbetrag ${fmtEUR(budget.remaining_cents)}`,
      bx + 12,
      by + 24,
      helv,
      10,
      COLOR_NEUTRAL_700,
    );
    const barW = PAGE_W - MARGIN * 2 - 24;
    page.drawRectangle({
      x: bx + 12,
      y: by + 8,
      width: barW,
      height: 8,
      color: rgb(0.9, 0.9, 0.9),
    });
    const fillW = Math.max(0, Math.min(barW, (barW * budget.usage_percent) / 100));
    const fillColor =
      budget.usage_percent >= 100
        ? rgb(0.85, 0.2, 0.2)
        : budget.usage_percent >= 80
          ? rgb(0.95, 0.65, 0.1)
          : COLOR_PRIMARY;
    if (fillW > 0) {
      page.drawRectangle({
        x: bx + 12,
        y: by + 8,
        width: fillW,
        height: 8,
        color: fillColor,
      });
    }
  }

  page.drawLine({
    start: { x: MARGIN, y: 130 },
    end: { x: MARGIN + 220, y: 130 },
    thickness: 0.5,
    color: COLOR_NEUTRAL_500,
  });
  drawText(
    page,
    "Unterschrift Leistungserbringer",
    MARGIN,
    118,
    helvOblique,
    8,
    COLOR_NEUTRAL_500,
  );
  page.drawLine({
    start: { x: PAGE_W - MARGIN - 220, y: 130 },
    end: { x: PAGE_W - MARGIN, y: 130 },
    thickness: 0.5,
    color: COLOR_NEUTRAL_500,
  });
  drawText(
    page,
    "Unterschrift pflegebedürftige Person / Bevollmächtigte/r",
    PAGE_W - MARGIN - 220,
    118,
    helvOblique,
    8,
    COLOR_NEUTRAL_500,
  );

  drawText(
    page,
    "Diese Rechnung ist zur Einreichung bei der Pflegekasse bestimmt.",
    MARGIN,
    96,
    helvOblique,
    8,
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

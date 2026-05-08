import "server-only";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { AlltagshilfeMonthlyReport } from "@/lib/api/alltagshilfe";

/**
 * Alltagshilfe monthly PDF — the German healthcare-insurance billing
 * artefact promised by spec §4.1 / §4.4 / §4.7. Distinct from the
 * generic Reports PDF because the data shape is different (per-client
 * tables of staff hours + amounts) and the document is consumed by an
 * external party (Krankenkasse), so it gets its own header + footer.
 *
 * Layout: cover row with month + summary tiles, then one row per client
 * showing their staff entries. Multi-page when needed — we add pages
 * automatically once the cursor falls below a footer-safe threshold.
 */

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;

const COLOR_PRIMARY = rgb(114 / 255, 169 / 255, 79 / 255);
const COLOR_SECONDARY = rgb(22 / 255, 88 / 255, 124 / 255);
const COLOR_TEXT = rgb(40 / 255, 50 / 255, 38 / 255);
const COLOR_MUTED = rgb(120 / 255, 133 / 255, 122 / 255);
const COLOR_HAIRLINE = rgb(221 / 255, 227 / 255, 218 / 255);
const COLOR_BAND = rgb(248 / 255, 250 / 255, 247 / 255);

const MONTH_NAMES_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export async function renderAlltagshilfePdf(
  report: AlltagshilfeMonthlyReport,
  org: { name: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Page-state container so renderers can request a new page when they
  // run out of room.
  const state = {
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
  };
  const ctx = { doc, state, helv, helvBold };

  drawHeader(ctx, org, report);
  state.y = PAGE_H - MARGIN - 130;

  drawSummary(ctx, report);

  // Per-client tables.
  for (const row of report.rows) {
    if (state.y < 200) {
      addPage(ctx);
    }
    drawClientBlock(ctx, row);
  }

  // Final footer on every page.
  for (let i = 0; i < doc.getPageCount(); i++) {
    drawFooter(doc.getPage(i), helv, i + 1, doc.getPageCount());
  }

  return doc.save();
}

/* ---------------------------------------------------------------------- */
/* Page management                                                        */
/* ---------------------------------------------------------------------- */

type Ctx = {
  doc: PDFDocument;
  state: { page: PDFPage; y: number };
  helv: PDFFont;
  helvBold: PDFFont;
};

function addPage(ctx: Ctx) {
  ctx.state.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.state.y = PAGE_H - MARGIN;
}

/* ---------------------------------------------------------------------- */
/* Header                                                                 */
/* ---------------------------------------------------------------------- */

function drawHeader(
  ctx: Ctx,
  org: { name: string },
  report: AlltagshilfeMonthlyReport,
) {
  const { state, helv, helvBold } = ctx;
  const page = state.page;

  drawText(
    page,
    org.name.toUpperCase(),
    MARGIN,
    PAGE_H - MARGIN,
    helvBold,
    9,
    COLOR_PRIMARY,
  );
  drawText(
    page,
    "Alltagshilfe — Monatsbericht",
    MARGIN,
    PAGE_H - MARGIN - 20,
    helvBold,
    20,
    COLOR_SECONDARY,
  );
  drawText(
    page,
    `${MONTH_NAMES_DE[report.month] ?? "?"} ${report.year}`,
    MARGIN,
    PAGE_H - MARGIN - 38,
    helv,
    11,
    COLOR_TEXT,
  );

  drawTextRight(
    page,
    `Erstellt ${new Date().toISOString().slice(0, 10)}`,
    PAGE_W - MARGIN,
    PAGE_H - MARGIN,
    helv,
    8,
    COLOR_MUTED,
  );
  drawTextRight(
    page,
    `Stundensatz ${fmtEUR(report.summary.hourlyRateCents)}/h`,
    PAGE_W - MARGIN,
    PAGE_H - MARGIN - 16,
    helv,
    8,
    COLOR_MUTED,
  );

  page.drawLine({
    start: { x: MARGIN, y: PAGE_H - MARGIN - 56 },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN - 56 },
    thickness: 0.5,
    color: COLOR_HAIRLINE,
  });
}

/* ---------------------------------------------------------------------- */
/* Summary tiles                                                          */
/* ---------------------------------------------------------------------- */

function drawSummary(ctx: Ctx, report: AlltagshilfeMonthlyReport) {
  // Summary uses bold for both labels and tile values — destructure
  // only what's needed.
  const { state, helvBold } = ctx;
  const page = state.page;
  const s = report.summary;

  const tiles: Array<{ label: string; value: string }> = [
    { label: "Stunden", value: `${s.totalHours.toFixed(1)} h` },
    {
      label: "Klient:innen",
      value: `${s.activeClients} / ${s.totalClients}`,
    },
    { label: "Besuche", value: String(s.visitsCount) },
    { label: "Gesamt", value: fmtEUR(s.amountCents) },
  ];
  const tile = (PAGE_W - MARGIN * 2 - 18) / 4;
  const tileH = 64;
  const yTile = state.y;

  tiles.forEach((t, i) => {
    const x = MARGIN + i * (tile + 6);
    page.drawRectangle({
      x,
      y: yTile - tileH,
      width: tile,
      height: tileH,
      borderColor: COLOR_HAIRLINE,
      borderWidth: 0.6,
    });
    drawText(page, t.label.toUpperCase(), x + 10, yTile - 16, helvBold, 7.5, COLOR_MUTED);
    drawText(page, t.value, x + 10, yTile - 38, helvBold, 14, COLOR_SECONDARY);
  });

  state.y = yTile - tileH - 24;

  drawText(
    page,
    "Aufschlüsselung nach Klient:in",
    MARGIN,
    state.y,
    helvBold,
    11,
    COLOR_SECONDARY,
  );
  state.y -= 12;
  page.drawLine({
    start: { x: MARGIN, y: state.y },
    end: { x: PAGE_W - MARGIN, y: state.y },
    thickness: 0.4,
    color: COLOR_HAIRLINE,
  });
  state.y -= 8;
}

/* ---------------------------------------------------------------------- */
/* Per-client block                                                       */
/* ---------------------------------------------------------------------- */

function drawClientBlock(
  ctx: Ctx,
  row: AlltagshilfeMonthlyReport["rows"][number],
) {
  const { state, helv, helvBold } = ctx;
  let page = state.page;

  // Client header band
  page.drawRectangle({
    x: MARGIN,
    y: state.y - 30,
    width: PAGE_W - MARGIN * 2,
    height: 30,
    color: COLOR_BAND,
  });
  drawText(page, row.client.name, MARGIN + 10, state.y - 12, helvBold, 11, COLOR_TEXT);
  drawText(
    page,
    [row.client.address, row.client.insurance].filter(Boolean).join(" · "),
    MARGIN + 10,
    state.y - 24,
    helv,
    8.5,
    COLOR_MUTED,
  );
  drawTextRight(
    page,
    `${row.totalHours.toFixed(1)} h · ${fmtEUR(row.totalAmountCents)}`,
    PAGE_W - MARGIN - 10,
    state.y - 18,
    helvBold,
    11,
    COLOR_SECONDARY,
  );
  state.y -= 38;

  // Column headers
  drawText(page, "Mitarbeiter:in", MARGIN + 8, state.y, helvBold, 8, COLOR_MUTED);
  drawText(page, "Zeitraum", MARGIN + 200, state.y, helvBold, 8, COLOR_MUTED);
  drawTextRight(page, "Besuche", MARGIN + 350, state.y, helvBold, 8, COLOR_MUTED);
  drawTextRight(page, "Stunden", MARGIN + 410, state.y, helvBold, 8, COLOR_MUTED);
  drawTextRight(
    page,
    "Betrag",
    PAGE_W - MARGIN - 8,
    state.y,
    helvBold,
    8,
    COLOR_MUTED,
  );
  state.y -= 4;
  page.drawLine({
    start: { x: MARGIN, y: state.y },
    end: { x: PAGE_W - MARGIN, y: state.y },
    thickness: 0.4,
    color: COLOR_HAIRLINE,
  });
  state.y -= 12;

  for (const s of row.staff) {
    if (state.y < 100) {
      addPage(ctx);
      page = state.page;
      // re-draw column headers on the new page so the table is readable.
      drawText(page, "Mitarbeiter:in", MARGIN + 8, state.y, helvBold, 8, COLOR_MUTED);
      drawText(page, "Zeitraum", MARGIN + 200, state.y, helvBold, 8, COLOR_MUTED);
      drawTextRight(page, "Besuche", MARGIN + 350, state.y, helvBold, 8, COLOR_MUTED);
      drawTextRight(page, "Stunden", MARGIN + 410, state.y, helvBold, 8, COLOR_MUTED);
      drawTextRight(
        page,
        "Betrag",
        PAGE_W - MARGIN - 8,
        state.y,
        helvBold,
        8,
        COLOR_MUTED,
      );
      state.y -= 16;
    }
    drawText(page, s.name, MARGIN + 8, state.y, helv, 9.5, COLOR_TEXT);
    drawText(
      page,
      s.qualifications.join(", "),
      MARGIN + 8,
      state.y - 11,
      helv,
      8,
      COLOR_MUTED,
    );
    drawText(page, s.period, MARGIN + 200, state.y, helv, 9, COLOR_MUTED);
    drawTextRight(
      page,
      String(s.visits),
      MARGIN + 350,
      state.y,
      helv,
      9,
      COLOR_TEXT,
    );
    drawTextRight(
      page,
      `${s.hours.toFixed(1)}`,
      MARGIN + 410,
      state.y,
      helv,
      9,
      COLOR_TEXT,
    );
    drawTextRight(
      page,
      fmtEUR(s.amountCents),
      PAGE_W - MARGIN - 8,
      state.y,
      helvBold,
      9,
      COLOR_SECONDARY,
    );
    state.y -= 22;
  }

  state.y -= 8;
  page.drawLine({
    start: { x: MARGIN, y: state.y },
    end: { x: PAGE_W - MARGIN, y: state.y },
    thickness: 0.5,
    color: COLOR_HAIRLINE,
  });
  state.y -= 12;
}

/* ---------------------------------------------------------------------- */
/* Footer                                                                 */
/* ---------------------------------------------------------------------- */

function drawFooter(
  page: PDFPage,
  helv: PDFFont,
  pageNum: number,
  total: number,
) {
  drawText(
    page,
    "Priya's Reinigungsservice — Alltagshilfe Monatsbericht — Vertraulich",
    MARGIN,
    36,
    helv,
    8,
    COLOR_MUTED,
  );
  drawTextRight(
    page,
    `Seite ${pageNum} von ${total}`,
    PAGE_W - MARGIN,
    36,
    helv,
    8,
    COLOR_MUTED,
  );
}

/* ---------------------------------------------------------------------- */
/* Drawing helpers                                                        */
/* ---------------------------------------------------------------------- */

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

function fmtEUR(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

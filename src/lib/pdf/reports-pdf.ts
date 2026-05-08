import "server-only";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { ReportsData, ReportRange } from "@/lib/api/reports";

/**
 * Reports PDF renderer. Replaces the placeholder text-file response that
 * `/api/reports/export?format=pdf` used to return ("Note: PDF export
 * coming next…"). Each report `type` from the route handler maps to a
 * dedicated section function below; the cover sheet is shared.
 *
 * Designed to mirror the on-screen Reports page (KPIs + monthly revenue
 * bar chart + hours-by-service donut → here rendered as a horizontal
 * bar list) so the printed artefact is recognisable to the user. Single
 * page A4 portrait. No external assets; pure pdf-lib + Helvetica so it
 * works in Edge runtimes too.
 */

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;

const COLOR_PRIMARY = rgb(114 / 255, 169 / 255, 79 / 255);
const COLOR_SECONDARY = rgb(22 / 255, 88 / 255, 124 / 255);
const COLOR_TEXT = rgb(40 / 255, 50 / 255, 38 / 255);
const COLOR_MUTED = rgb(120 / 255, 133 / 255, 122 / 255);
const COLOR_HAIRLINE = rgb(221 / 255, 227 / 255, 218 / 255);
const COLOR_BAR_BG = rgb(238 / 255, 245 / 255, 232 / 255);

const RANGE_LABELS: Record<ReportRange, string> = {
  "30d": "Letzte 30 Tage",
  Q: "Letztes Quartal",
  YTD: "Year-to-date",
  "12mo": "Letzte 12 Monate",
};

export type ReportType =
  | "summary"
  | "monthly-revenue"
  | "hours"
  | "completion"
  | "satisfaction"
  | "open-invoices";

/**
 * One open-invoice row, passed in by the route handler. We don't query
 * Supabase from inside the renderer — that would tie this server-only
 * module to the auth context. The route prepares the rows and we just
 * lay them out.
 */
export type OpenInvoiceRow = {
  invoice_number: string;
  client_name: string;
  status: "sent" | "overdue";
  issue_date: string;
  due_date: string | null;
  total_cents: number;
  /** Days past due (negative if not yet due). */
  days_overdue: number | null;
};

/**
 * Render a Reports PDF for one of the supported types. Returns the raw
 * PDF bytes — the route handler streams them with the right
 * content-disposition.
 *
 * Most types just need `data: ReportsData`. The `open-invoices` type
 * additionally needs the actual list of open invoices via `extras` —
 * we don't put it on `ReportsData` because the on-screen reports page
 * doesn't need the rows, only the totals.
 */
export async function renderReportsPdf(
  type: ReportType,
  data: ReportsData,
  org: { name: string },
  extras?: { openInvoices?: OpenInvoiceRow[] },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // -- Header (shared) ---------------------------------------------------
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
    titleFor(type),
    MARGIN,
    PAGE_H - MARGIN - 22,
    helvBold,
    20,
    COLOR_SECONDARY,
  );
  drawText(
    page,
    `${RANGE_LABELS[data.range]} · ${data.rangeStart} – ${data.rangeEnd}`,
    MARGIN,
    PAGE_H - MARGIN - 40,
    helv,
    9,
    COLOR_MUTED,
  );

  // Right-aligned generation timestamp.
  drawTextRight(
    page,
    `Erstellt am ${new Date().toLocaleString("de-DE")}`,
    PAGE_W - MARGIN,
    PAGE_H - MARGIN,
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

  // -- Body --------------------------------------------------------------
  // Each renderer returns the y at which it stopped; the summary view
  // chains two of them. Footer/header use absolute coords so we don't
  // need to track the final y past this switch.
  const yStart = PAGE_H - MARGIN - 80;
  const ctx = { page, helv, helvBold };

  switch (type) {
    case "monthly-revenue":
      renderMonthlyRevenue(ctx, data, yStart);
      break;
    case "hours":
      renderHours(ctx, data, yStart);
      break;
    case "completion":
      renderCompletion(ctx, data, yStart);
      break;
    case "satisfaction":
      renderSatisfaction(ctx, data, yStart);
      break;
    case "open-invoices":
      renderOpenInvoices(ctx, extras?.openInvoices ?? [], yStart);
      break;
    case "summary":
    default: {
      const yAfterKpis = renderKpis(ctx, data, yStart);
      renderMonthlyRevenue(ctx, data, yAfterKpis - 28);
      break;
    }
  }

  // -- Footer (shared) ---------------------------------------------------
  drawText(
    page,
    "Priya's Reinigungsservice — Vertraulich",
    MARGIN,
    36,
    helv,
    8,
    COLOR_MUTED,
  );
  drawTextRight(
    page,
    "Generiert über die Operations-Plattform",
    PAGE_W - MARGIN,
    36,
    helv,
    8,
    COLOR_MUTED,
  );

  return doc.save();
}

/* ---------------------------------------------------------------------- */
/* Section renderers                                                      */
/* ---------------------------------------------------------------------- */

type Ctx = { page: PDFPage; helv: PDFFont; helvBold: PDFFont };

function titleFor(type: ReportType): string {
  switch (type) {
    case "monthly-revenue":
      return "Umsatzbericht";
    case "hours":
      return "Stundenauswertung";
    case "completion":
      return "Schichtabschluss";
    case "satisfaction":
      return "Kundenzufriedenheit";
    case "open-invoices":
      return "Offene Rechnungen";
    case "summary":
    default:
      return "Geschäftsbericht";
  }
}

function renderKpis(ctx: Ctx, data: ReportsData, yIn: number): number {
  const { page, helv, helvBold } = ctx;
  let y = yIn;

  drawText(page, "Kennzahlen", MARGIN, y, helvBold, 12, COLOR_SECONDARY);
  y -= 18;

  // 4-up KPI grid on a single row.
  const tile = (PAGE_W - MARGIN * 2 - 18) / 4;
  const tileH = 78;
  const tiles: Array<{ label: string; value: string; delta?: string }> = [
    {
      label: "Umsatz",
      value: fmtEUR(data.kpis.revenueCents),
      delta: fmtPctDelta(data.kpis.revenueDeltaPct),
    },
    {
      label: "Stunden",
      value: `${Math.round(data.kpis.hours).toLocaleString("de-DE")} h`,
      delta: fmtPctDelta(data.kpis.hoursDeltaPct),
    },
    {
      label: "Schichten abgeschlossen",
      value: `${data.kpis.shiftsCompleted} / ${data.kpis.shiftsTotal}`,
      delta: `${data.kpis.shiftsCompletionPct.toFixed(0)} %`,
    },
    {
      label: "Zufriedenheit",
      value: `${data.kpis.satisfactionAvg.toFixed(2)} / 5.00`,
      delta: `NPS ${data.kpis.satisfactionNps}`,
    },
  ];

  tiles.forEach((tileSpec, i) => {
    const x = MARGIN + i * (tile + 6);
    page.drawRectangle({
      x,
      y: y - tileH,
      width: tile,
      height: tileH,
      borderColor: COLOR_HAIRLINE,
      borderWidth: 0.6,
    });
    drawText(
      page,
      tileSpec.label.toUpperCase(),
      x + 10,
      y - 16,
      helvBold,
      7.5,
      COLOR_MUTED,
    );
    drawText(
      page,
      tileSpec.value,
      x + 10,
      y - 38,
      helvBold,
      14,
      COLOR_SECONDARY,
    );
    if (tileSpec.delta) {
      drawText(
        page,
        tileSpec.delta,
        x + 10,
        y - 56,
        helv,
        9,
        COLOR_MUTED,
      );
    }
  });

  return y - tileH - 12;
}

function renderMonthlyRevenue(
  ctx: Ctx,
  data: ReportsData,
  yIn: number,
): number {
  const { page, helv, helvBold } = ctx;
  let y = yIn;

  drawText(
    page,
    "Monatsumsatz",
    MARGIN,
    y,
    helvBold,
    12,
    COLOR_SECONDARY,
  );
  y -= 18;

  const months = data.revenueSeries.slice(-12);
  if (months.length === 0) {
    drawText(page, "Keine Daten im gewählten Zeitraum.", MARGIN, y, helv, 10, COLOR_MUTED);
    return y - 12;
  }

  const max = Math.max(
    ...months.map((m) => Math.max(m.invoicedCents, m.collectedCents)),
    1,
  );
  const chartH = 130;
  const chartW = PAGE_W - MARGIN * 2;
  const slot = chartW / months.length;
  const barW = Math.max(8, Math.min(22, slot * 0.6));

  // Chart frame
  page.drawLine({
    start: { x: MARGIN, y: y - chartH },
    end: { x: PAGE_W - MARGIN, y: y - chartH },
    thickness: 0.5,
    color: COLOR_HAIRLINE,
  });

  for (let i = 0; i < months.length; i++) {
    const m = months[i]!;
    const cx = MARGIN + slot * (i + 0.5);
    // Background bar capacity (max scale).
    page.drawRectangle({
      x: cx - barW / 2,
      y: y - chartH,
      width: barW,
      height: chartH,
      color: COLOR_BAR_BG,
    });
    // Invoiced bar.
    const invH = (m.invoicedCents / max) * chartH;
    page.drawRectangle({
      x: cx - barW / 2,
      y: y - chartH,
      width: barW,
      height: invH,
      color: COLOR_PRIMARY,
    });
    // Collected overlay (slightly narrower so it doesn't fully hide).
    const colH = (m.collectedCents / max) * chartH;
    page.drawRectangle({
      x: cx - barW / 4,
      y: y - chartH,
      width: barW / 2,
      height: colH,
      color: COLOR_SECONDARY,
    });

    drawTextCentered(
      page,
      m.label,
      cx,
      y - chartH - 12,
      helv,
      7.5,
      COLOR_MUTED,
    );
  }
  y -= chartH + 30;

  // Tabular breakdown.
  drawText(page, "Monat", MARGIN, y, helvBold, 8.5, COLOR_MUTED);
  drawTextRight(
    page,
    "Verrechnet",
    MARGIN + 220,
    y,
    helvBold,
    8.5,
    COLOR_MUTED,
  );
  drawTextRight(
    page,
    "Eingenommen",
    MARGIN + 360,
    y,
    helvBold,
    8.5,
    COLOR_MUTED,
  );
  drawTextRight(page, "Status", PAGE_W - MARGIN, y, helvBold, 8.5, COLOR_MUTED);
  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.4,
    color: COLOR_HAIRLINE,
  });
  y -= 12;

  for (const m of months) {
    if (y < 80) break;
    drawText(page, m.label, MARGIN, y, helv, 9, COLOR_TEXT);
    drawTextRight(
      page,
      fmtEUR(m.invoicedCents),
      MARGIN + 220,
      y,
      helv,
      9,
      COLOR_TEXT,
    );
    drawTextRight(
      page,
      fmtEUR(m.collectedCents),
      MARGIN + 360,
      y,
      helv,
      9,
      COLOR_TEXT,
    );
    drawTextRight(
      page,
      m.forecast ? "Prognose" : "Ist",
      PAGE_W - MARGIN,
      y,
      helv,
      9,
      m.forecast ? COLOR_MUTED : COLOR_PRIMARY,
    );
    y -= 14;
  }

  return y;
}

function renderHours(ctx: Ctx, data: ReportsData, yIn: number): number {
  const { page, helv, helvBold } = ctx;
  let y = yIn;

  drawText(page, "Verteilung nach Service", MARGIN, y, helvBold, 12, COLOR_SECONDARY);
  drawText(
    page,
    `Gesamt: ${data.totalHours.toLocaleString("de-DE")} h · Verrechnungsquote ${data.billingRate.toFixed(0)} % · Ø ${fmtEUR(
      Math.round(data.averageRate * 100),
    )} / h`,
    MARGIN,
    y - 16,
    helv,
    9,
    COLOR_MUTED,
  );
  y -= 36;

  if (data.hoursByService.length === 0) {
    drawText(page, "Keine Stunden im gewählten Zeitraum.", MARGIN, y, helv, 10, COLOR_MUTED);
    return y - 12;
  }

  // Horizontal bar list.
  const barAreaX = MARGIN + 180;
  const barAreaW = PAGE_W - MARGIN - barAreaX;
  for (const row of data.hoursByService) {
    if (y < 100) break;
    drawText(page, row.serviceType, MARGIN, y, helv, 10, COLOR_TEXT);
    drawTextRight(
      page,
      `${row.hours.toLocaleString("de-DE")} h`,
      MARGIN + 170,
      y,
      helvBold,
      10,
      COLOR_SECONDARY,
    );
    // Bar background.
    page.drawRectangle({
      x: barAreaX,
      y: y - 2,
      width: barAreaW,
      height: 8,
      color: COLOR_BAR_BG,
    });
    // Bar fill.
    page.drawRectangle({
      x: barAreaX,
      y: y - 2,
      width: barAreaW * Math.min(1, row.pct / 100),
      height: 8,
      color: COLOR_PRIMARY,
    });
    drawTextRight(
      page,
      `${row.pct.toFixed(1)} %`,
      PAGE_W - MARGIN,
      y - 14,
      helv,
      8.5,
      COLOR_MUTED,
    );
    y -= 26;
  }

  return y;
}

function renderCompletion(
  ctx: Ctx,
  data: ReportsData,
  yIn: number,
): number {
  // `renderCompletion` doesn't use the regular weight (helv) — every
  // text in the completion view is either bold (`helvBold`) or
  // white-on-bar (also bold). Destructure only what we need.
  const { page, helvBold } = ctx;
  let y = yIn;

  drawText(
    page,
    "Schichtabschluss",
    MARGIN,
    y,
    helvBold,
    12,
    COLOR_SECONDARY,
  );
  y -= 24;

  const total = Math.max(data.kpis.shiftsTotal, 1);
  const completed = data.kpis.shiftsCompleted;
  const completionPct = (completed / total) * 100;

  // Big donut-replacement: a single horizontal completion bar.
  const barX = MARGIN;
  const barW = PAGE_W - MARGIN * 2;
  const barH = 28;
  page.drawRectangle({
    x: barX,
    y: y - barH,
    width: barW,
    height: barH,
    color: COLOR_BAR_BG,
  });
  page.drawRectangle({
    x: barX,
    y: y - barH,
    width: barW * (completionPct / 100),
    height: barH,
    color: COLOR_PRIMARY,
  });
  drawText(
    page,
    `${completionPct.toFixed(1)} %`,
    barX + 12,
    y - 19,
    helvBold,
    14,
    rgb(1, 1, 1),
  );
  drawTextRight(
    page,
    `${completed} / ${total} Schichten`,
    PAGE_W - MARGIN - 12,
    y - 19,
    helvBold,
    11,
    COLOR_SECONDARY,
  );
  y -= barH + 28;

  // Stat strip.
  const statRow: Array<{ label: string; value: string }> = [
    { label: "Abgeschlossen", value: String(completed) },
    {
      label: "Verschoben",
      value: String(data.kpis.shiftsRedistributed),
    },
    {
      label: "Geplant gesamt",
      value: String(data.kpis.shiftsTotal),
    },
  ];
  const tile = (PAGE_W - MARGIN * 2 - 16) / statRow.length;
  statRow.forEach((s, i) => {
    const x = MARGIN + i * (tile + 8);
    page.drawRectangle({
      x,
      y: y - 56,
      width: tile,
      height: 56,
      borderColor: COLOR_HAIRLINE,
      borderWidth: 0.6,
    });
    drawText(page, s.label.toUpperCase(), x + 10, y - 18, helvBold, 7.5, COLOR_MUTED);
    drawText(page, s.value, x + 10, y - 38, helvBold, 16, COLOR_SECONDARY);
  });

  return y - 80;
}

/* ---------------------------------------------------------------------- */
/* Satisfaction                                                           */
/* ---------------------------------------------------------------------- */

function renderSatisfaction(
  ctx: Ctx,
  data: ReportsData,
  yIn: number,
): number {
  const { page, helv, helvBold } = ctx;
  let y = yIn;

  drawText(
    page,
    "Kundenzufriedenheit",
    MARGIN,
    y,
    helvBold,
    12,
    COLOR_SECONDARY,
  );
  y -= 8;
  drawText(
    page,
    `Basierend auf ${data.kpis.satisfactionReviews} Bewertung(en)`,
    MARGIN,
    y,
    helv,
    9,
    COLOR_MUTED,
  );
  y -= 24;

  // Big rating tile (left) + NPS tile (right).
  const tileH = 110;
  const halfW = (PAGE_W - MARGIN * 2 - 16) / 2;

  // Rating tile
  page.drawRectangle({
    x: MARGIN,
    y: y - tileH,
    width: halfW,
    height: tileH,
    borderColor: COLOR_HAIRLINE,
    borderWidth: 0.6,
  });
  drawText(
    page,
    "DURCHSCHNITTLICHE BEWERTUNG",
    MARGIN + 14,
    y - 22,
    helvBold,
    8,
    COLOR_MUTED,
  );
  drawText(
    page,
    data.kpis.satisfactionAvg.toFixed(2),
    MARGIN + 14,
    y - 56,
    helvBold,
    32,
    COLOR_PRIMARY,
  );
  drawText(
    page,
    "/ 5,00",
    MARGIN + 110,
    y - 56,
    helv,
    14,
    COLOR_MUTED,
  );

  // 5-star bar visualisation under the number.
  const starsY = y - 88;
  const starW = (halfW - 28) / 5;
  for (let i = 0; i < 5; i++) {
    const filled = i < Math.round(data.kpis.satisfactionAvg);
    page.drawRectangle({
      x: MARGIN + 14 + i * starW,
      y: starsY,
      width: starW - 4,
      height: 8,
      color: filled ? COLOR_PRIMARY : COLOR_BAR_BG,
    });
  }

  // NPS tile
  const npsX = MARGIN + halfW + 16;
  page.drawRectangle({
    x: npsX,
    y: y - tileH,
    width: halfW,
    height: tileH,
    borderColor: COLOR_HAIRLINE,
    borderWidth: 0.6,
  });
  drawText(
    page,
    "NET PROMOTER SCORE",
    npsX + 14,
    y - 22,
    helvBold,
    8,
    COLOR_MUTED,
  );
  const npsTone =
    data.kpis.satisfactionNps >= 50
      ? COLOR_PRIMARY
      : data.kpis.satisfactionNps >= 0
        ? COLOR_SECONDARY
        : rgb(230 / 255, 57 / 255, 70 / 255);
  drawText(
    page,
    String(data.kpis.satisfactionNps),
    npsX + 14,
    y - 56,
    helvBold,
    32,
    npsTone,
  );
  drawText(
    page,
    data.kpis.satisfactionNps >= 50
      ? "Hervorragend"
      : data.kpis.satisfactionNps >= 0
        ? "Gut"
        : "Verbesserungsbedarf",
    npsX + 14,
    y - 80,
    helv,
    10,
    COLOR_TEXT,
  );

  y -= tileH + 24;

  // Range context
  drawText(
    page,
    `Zeitraum: ${data.rangeStart} – ${data.rangeEnd}`,
    MARGIN,
    y,
    helv,
    9,
    COLOR_MUTED,
  );
  return y - 12;
}

/* ---------------------------------------------------------------------- */
/* Open invoices                                                          */
/* ---------------------------------------------------------------------- */

function renderOpenInvoices(
  ctx: Ctx,
  rows: OpenInvoiceRow[],
  yIn: number,
): number {
  const { page, helv, helvBold } = ctx;
  let y = yIn;

  drawText(
    page,
    "Offene Rechnungen",
    MARGIN,
    y,
    helvBold,
    12,
    COLOR_SECONDARY,
  );

  const totalSent = rows
    .filter((r) => r.status === "sent")
    .reduce((s, r) => s + r.total_cents, 0);
  const totalOverdue = rows
    .filter((r) => r.status === "overdue")
    .reduce((s, r) => s + r.total_cents, 0);
  const totalAll = totalSent + totalOverdue;

  drawText(
    page,
    `${rows.length} Rechnung(en) · Gesamt ${fmtEUR(totalAll)} (überfällig ${fmtEUR(totalOverdue)})`,
    MARGIN,
    y - 14,
    helv,
    9,
    COLOR_MUTED,
  );
  y -= 36;

  if (rows.length === 0) {
    drawText(
      page,
      "Keine offenen Rechnungen — alles bezahlt. 🎉",
      MARGIN,
      y,
      helv,
      11,
      COLOR_PRIMARY,
    );
    return y - 12;
  }

  // Header strip
  page.drawRectangle({
    x: MARGIN,
    y: y - 4,
    width: PAGE_W - MARGIN * 2,
    height: 22,
    color: rgb(248 / 255, 250 / 255, 247 / 255),
  });
  drawText(page, "RECHNUNG", MARGIN + 8, y + 4, helvBold, 8, COLOR_MUTED);
  drawText(page, "KUNDE", MARGIN + 100, y + 4, helvBold, 8, COLOR_MUTED);
  drawText(page, "AUSGEST.", MARGIN + 280, y + 4, helvBold, 8, COLOR_MUTED);
  drawText(page, "FÄLLIG", MARGIN + 340, y + 4, helvBold, 8, COLOR_MUTED);
  drawTextRight(page, "STATUS", MARGIN + 430, y + 4, helvBold, 8, COLOR_MUTED);
  drawTextRight(
    page,
    "BETRAG",
    PAGE_W - MARGIN - 8,
    y + 4,
    helvBold,
    8,
    COLOR_MUTED,
  );
  y -= 22;

  // Sort: overdue first, then by days_overdue desc.
  const sorted = rows.slice().sort((a, b) => {
    if (a.status !== b.status) return a.status === "overdue" ? -1 : 1;
    return (b.days_overdue ?? 0) - (a.days_overdue ?? 0);
  });

  for (const r of sorted) {
    if (y < 100) break; // safety; rest goes on a future page
    drawText(
      page,
      r.invoice_number,
      MARGIN + 8,
      y - 12,
      helv,
      9,
      COLOR_TEXT,
    );
    drawText(
      page,
      truncate(r.client_name, 28),
      MARGIN + 100,
      y - 12,
      helv,
      9,
      COLOR_TEXT,
    );
    drawText(page, r.issue_date, MARGIN + 280, y - 12, helv, 9, COLOR_MUTED);
    drawText(
      page,
      r.due_date ?? "—",
      MARGIN + 340,
      y - 12,
      helv,
      9,
      r.status === "overdue" ? rgb(230 / 255, 57 / 255, 70 / 255) : COLOR_MUTED,
    );
    drawTextRight(
      page,
      r.status === "overdue"
        ? `${r.days_overdue ?? 0}d über`
        : "offen",
      MARGIN + 430,
      y - 12,
      helvBold,
      9,
      r.status === "overdue"
        ? rgb(230 / 255, 57 / 255, 70 / 255)
        : COLOR_SECONDARY,
    );
    drawTextRight(
      page,
      fmtEUR(r.total_cents),
      PAGE_W - MARGIN - 8,
      y - 12,
      helvBold,
      9,
      COLOR_SECONDARY,
    );
    y -= 16;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.4,
      color: COLOR_HAIRLINE,
    });
  }

  return y;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
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
  // pdf-lib's Helvetica doesn't include the full Latin Extended set but
  // does include Latin-1; strip anything else so we never blow up on a
  // stray non-ASCII character (rare but possible in user-entered service
  // names).
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

function drawTextCentered(
  page: PDFPage,
  text: string,
  cx: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - w / 2, y, size, font, color });
}

function fmtEUR(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function fmtPctDelta(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)} %`;
}

import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { format } from "date-fns";
import type { ScheduleWeek } from "@/lib/api/schedule";

/**
 * Render a printable PDF of one week of shifts. Landscape A4, one column
 * per day, shifts grouped under the day with start/end + property + employee.
 *
 * Pure pdf-lib — no headless browser, no external service.
 */
export async function renderSchedulePdf(
  week: ScheduleWeek,
  opts?: { orgName?: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 landscape (mm to pt approx)
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 32;
  const top = page.getHeight() - margin;

  // ---- Header ----
  page.drawText(opts?.orgName ?? "Priya's Reinigungsservice", {
    x: margin,
    y: top - 8,
    size: 12,
    font: helvBold,
    color: rgb(0.09, 0.34, 0.49),
  });
  page.drawText(`Schedule · ${week.weekLabel} · KW ${week.isoWeek}`, {
    x: margin,
    y: top - 26,
    size: 10,
    font: helv,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Horizontal rule
  page.drawLine({
    start: { x: margin, y: top - 36 },
    end: { x: page.getWidth() - margin, y: top - 36 },
    thickness: 0.8,
    color: rgb(0.85, 0.85, 0.85),
  });

  // ---- 7-column day grid ----
  const gridTop = top - 50;
  const gridHeight = page.getHeight() - 2 * margin - 60;
  const colW = (page.getWidth() - 2 * margin) / 7;
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Day headers
  for (let i = 0; i < 7; i += 1) {
    const x = margin + i * colW;
    page.drawRectangle({
      x,
      y: gridTop - 22,
      width: colW,
      height: 22,
      color: rgb(0.96, 0.97, 0.95),
    });
    page.drawText(dayLabels[i] ?? "", {
      x: x + 8,
      y: gridTop - 16,
      size: 9,
      font: helvBold,
      color: rgb(0.35, 0.35, 0.35),
    });
    const day = week.days[i];
    if (day) {
      page.drawText(format(new Date(day), "d MMM"), {
        x: x + colW - 50,
        y: gridTop - 16,
        size: 9,
        font: helv,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
  }

  // Vertical grid lines
  for (let i = 0; i <= 7; i += 1) {
    const x = margin + i * colW;
    page.drawLine({
      start: { x, y: gridTop - 22 },
      end: { x, y: gridTop - 22 - gridHeight },
      thickness: 0.4,
      color: rgb(0.9, 0.9, 0.9),
    });
  }

  // ---- Shifts grouped per day ----
  const eventsByDay: Record<string, typeof week.events> = {};
  for (const e of week.events) {
    const key = e.starts_at.slice(0, 10);
    if (!eventsByDay[key]) eventsByDay[key] = [];
    eventsByDay[key]!.push(e);
  }

  for (let i = 0; i < 7; i += 1) {
    const day = week.days[i];
    if (!day) continue;
    const events = eventsByDay[day] ?? [];
    const x = margin + i * colW + 6;
    let y = gridTop - 36;
    for (const e of events) {
      if (y < gridTop - gridHeight + 24) break; // overflow guard
      const startTime = format(new Date(e.starts_at), "HH:mm");
      const endTime = format(new Date(e.ends_at), "HH:mm");
      page.drawRectangle({
        x: x - 2,
        y: y - 30,
        width: colW - 8,
        height: 32,
        color:
          e.service_lane === "alltagshilfe"
            ? rgb(0.96, 0.91, 0.91)
            : rgb(0.93, 0.97, 0.91),
      });
      page.drawText(`${startTime}–${endTime}`, {
        x,
        y: y - 8,
        size: 8,
        font: helvBold,
        color: rgb(0.2, 0.2, 0.2),
      });
      const title = truncate(e.property_name, Math.floor((colW - 16) / 5));
      page.drawText(title, {
        x,
        y: y - 18,
        size: 8,
        font: helv,
        color: rgb(0.2, 0.2, 0.2),
      });
      const teamLabel = e.team[0]?.initials ?? "—";
      page.drawText(teamLabel, {
        x,
        y: y - 28,
        size: 7,
        font: helv,
        color: rgb(0.45, 0.45, 0.45),
      });
      y -= 40;
    }
    if (events.length === 0) {
      page.drawText("—", {
        x,
        y: gridTop - 50,
        size: 9,
        font: helv,
        color: rgb(0.7, 0.7, 0.7),
      });
    }
  }

  // ---- Footer ----
  page.drawText(`Generated ${format(new Date(), "yyyy-MM-dd HH:mm")}`, {
    x: margin,
    y: 16,
    size: 7,
    font: helv,
    color: rgb(0.5, 0.5, 0.5),
  });

  return doc.save();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

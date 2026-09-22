/**
 * Feature-update #15 · Mobile weekly work-report PDF.
 *
 * Loads the caller's own shifts for a given ISO week and shapes them
 * into a printable summary: customer, date, hours worked, weekly
 * total. The HTML template lives at the bottom of this file so the
 * screen can just call `renderWeeklyReportHtml(rows)` + hand the
 * string to `expo-print`.
 *
 * "Hours worked" prefers real `time_entries` (check_in / check_out
 * bookended, minus break duration) and falls back to the shift's
 * scheduled window when the employee hasn't clocked out yet — that
 * matches the paper form the client used to hand in each Friday.
 */

import { getSupabase } from "@/lib/supabase";

export type WorkReportRow = {
  shift_id: string;
  date: string; // ISO date (YYYY-MM-DD)
  starts_at: string;
  ends_at: string;
  client_name: string;
  property_name: string;
  minutes_worked: number;
  source: "clocked" | "scheduled";
};

export type WorkReportSummary = {
  week_start: string; // YYYY-MM-DD (Mon)
  week_end: string; // YYYY-MM-DD (Sun)
  employee_name: string;
  rows: WorkReportRow[];
  total_minutes: number;
};

/** Monday-anchored week bounds for an arbitrary local date. */
export function weekBounds(base: Date): { start: Date; end: Date } {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  const start = new Date(d);
  start.setDate(d.getDate() + offsetToMon);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type ShiftJoin = {
  id: string;
  starts_at: string;
  ends_at: string;
  properties: {
    name: string;
    clients: { name: string } | null;
  } | null;
};
type EntryRow = {
  shift_id: string;
  kind: "check_in" | "check_out" | "break_start" | "break_end";
  occurred_at: string;
};

/** Sum a shift's clocked minutes (check-in → check-out, minus breaks). */
function minutesFromEntries(entries: EntryRow[]): number | null {
  const checkIn = entries.find((e) => e.kind === "check_in");
  const checkOut = entries.find((e) => e.kind === "check_out");
  if (!checkIn || !checkOut) return null;

  const workMs =
    new Date(checkOut.occurred_at).getTime() -
    new Date(checkIn.occurred_at).getTime();
  if (workMs <= 0) return null;

  // Pair break_start with the following break_end, in order.
  const breaks = entries
    .filter((e) => e.kind === "break_start" || e.kind === "break_end")
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  let breakMs = 0;
  let openStart: string | null = null;
  for (const b of breaks) {
    if (b.kind === "break_start") openStart = b.occurred_at;
    else if (b.kind === "break_end" && openStart) {
      breakMs +=
        new Date(b.occurred_at).getTime() - new Date(openStart).getTime();
      openStart = null;
    }
  }
  return Math.max(0, Math.round((workMs - breakMs) / 60000));
}

export async function loadWorkReport(args: {
  employeeId: string;
  employeeName: string;
  weekOf: Date;
}): Promise<WorkReportSummary> {
  const supabase = getSupabase();
  const { start, end } = weekBounds(args.weekOf);

  const { data: shifts } = await supabase
    .from("shifts")
    .select(
      "id, starts_at, ends_at, properties!inner(name, clients!inner(name))",
    )
    .eq("employee_id", args.employeeId)
    .gte("starts_at", start.toISOString())
    .lte("starts_at", end.toISOString())
    .is("deleted_at", null)
    .order("starts_at", { ascending: true })
    .limit(200);

  const shiftRows = ((shifts ?? []) as unknown) as ShiftJoin[];
  const shiftIds = shiftRows.map((s) => s.id);

  // Batch-load time_entries for all of this week's shifts. RLS keeps
  // the query scoped to this employee's own entries.
  let entriesByShift = new Map<string, EntryRow[]>();
  if (shiftIds.length > 0) {
    const { data: entries } = await supabase
      .from("time_entries")
      .select("shift_id, kind, occurred_at")
      .eq("employee_id", args.employeeId)
      .in("shift_id", shiftIds)
      .order("occurred_at", { ascending: true });
    for (const e of ((entries ?? []) as EntryRow[])) {
      const arr = entriesByShift.get(e.shift_id) ?? [];
      arr.push(e);
      entriesByShift.set(e.shift_id, arr);
    }
  }

  const rows: WorkReportRow[] = shiftRows.map((s) => {
    const entries = entriesByShift.get(s.id) ?? [];
    const clocked = minutesFromEntries(entries);
    const scheduledMs =
      new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime();
    const scheduled = Math.max(0, Math.round(scheduledMs / 60000));
    return {
      shift_id: s.id,
      date: isoDate(new Date(s.starts_at)),
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      client_name: s.properties?.clients?.name ?? "—",
      property_name: s.properties?.name ?? "—",
      minutes_worked: clocked ?? scheduled,
      source: clocked !== null ? "clocked" : "scheduled",
    };
  });

  return {
    week_start: isoDate(start),
    week_end: isoDate(end),
    employee_name: args.employeeName,
    rows,
    total_minutes: rows.reduce((n, r) => n + r.minutes_worked, 0),
  };
}

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function fmtDate(iso: string, locale: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(locale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function fmtRange(startIso: string, endIso: string, locale: string): string {
  const fmt: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return `${new Date(startIso).toLocaleTimeString(locale, fmt)} – ${new Date(
    endIso,
  ).toLocaleTimeString(locale, fmt)}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Priya's-branded HTML for expo-print's `printToFileAsync`. */
export function renderWeeklyReportHtml(
  s: WorkReportSummary,
  labels: {
    title: string;
    weekOf: string;
    employee: string;
    date: string;
    time: string;
    customer: string;
    property: string;
    hours: string;
    total: string;
    empty: string;
    footer: string;
  },
  locale: string,
): string {
  const rows = s.rows
    .map(
      (r) => `
        <tr>
          <td>${esc(fmtDate(r.date, locale))}</td>
          <td>${esc(fmtRange(r.starts_at, r.ends_at, locale))}</td>
          <td>${esc(r.client_name)}</td>
          <td>${esc(r.property_name)}</td>
          <td class="num">${esc(fmtHours(r.minutes_worked))}${
            r.source === "scheduled" ? " *" : ""
          }</td>
        </tr>`,
    )
    .join("");

  const empty =
    s.rows.length === 0
      ? `<tr><td colspan="5" class="empty">${esc(labels.empty)}</td></tr>`
      : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(labels.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111827;
      margin: 32px;
    }
    h1 {
      font-size: 22px;
      margin: 0 0 4px 0;
      color: #14532d;
    }
    .sub {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 20px;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      padding: 12px 14px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      background: #f9fafb;
      margin-bottom: 16px;
      font-size: 12px;
    }
    .meta strong { color: #14532d; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    thead th {
      background: #14532d;
      color: white;
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    tbody td {
      padding: 8px 10px;
      border-bottom: 1px solid #e5e7eb;
    }
    tbody tr:nth-child(even) td { background: #fafafa; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .total {
      margin-top: 12px;
      text-align: right;
      font-size: 14px;
      font-weight: 700;
      color: #14532d;
    }
    .empty {
      text-align: center;
      color: #6b7280;
      font-style: italic;
      padding: 24px;
    }
    .footer {
      margin-top: 24px;
      font-size: 10px;
      color: #9ca3af;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>${esc(labels.title)}</h1>
  <div class="sub">${esc(labels.weekOf)}: ${esc(fmtDate(s.week_start, locale))} – ${esc(fmtDate(s.week_end, locale))}</div>
  <div class="meta">
    <div><strong>${esc(labels.employee)}:</strong> ${esc(s.employee_name)}</div>
    <div><strong>${esc(labels.total)}:</strong> ${esc(fmtHours(s.total_minutes))}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>${esc(labels.date)}</th>
        <th>${esc(labels.time)}</th>
        <th>${esc(labels.customer)}</th>
        <th>${esc(labels.property)}</th>
        <th class="num">${esc(labels.hours)}</th>
      </tr>
    </thead>
    <tbody>${rows}${empty}</tbody>
  </table>
  <div class="total">${esc(labels.total)}: ${esc(fmtHours(s.total_minutes))}</div>
  <div class="footer">${esc(labels.footer)}</div>
</body>
</html>`;
}

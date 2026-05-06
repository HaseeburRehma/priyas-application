import "server-only";

export type IcalShift = {
  id: string;
  starts_at: string;
  ends_at: string;
  property_name: string;
  client_name: string;
  notes: string | null;
};

/**
 * Render a list of shifts to an iCalendar (.ics) document.
 *
 * Pure-functional, no deps. We escape per RFC 5545 (commas, semicolons,
 * backslashes, newlines) and emit DTSTART/DTEND in UTC.
 */
export function buildIcal(args: {
  calendarName: string;
  shifts: IcalShift[];
  prodId?: string;
  /** Origin of the deploy — used in UID hostnames. */
  origin?: string;
}): string {
  const prod = args.prodId ?? "-//Priya//Schedule//EN";
  const host = (args.origin ?? "priya.local").replace(/^https?:\/\//, "");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prod}`,
    `X-WR-CALNAME:${escapeText(args.calendarName)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const s of args.shifts) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${s.id}@${host}`);
    lines.push(`DTSTAMP:${toUtc(new Date())}`);
    lines.push(`DTSTART:${toUtc(new Date(s.starts_at))}`);
    lines.push(`DTEND:${toUtc(new Date(s.ends_at))}`);
    lines.push(
      `SUMMARY:${escapeText(`${s.property_name} — ${s.client_name}`)}`,
    );
    if (s.notes) lines.push(`DESCRIPTION:${escapeText(s.notes)}`);
    lines.push(`LOCATION:${escapeText(s.property_name)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return foldLines(lines).join("\r\n");
}

function toUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 says lines longer than 75 octets must be folded with a leading
 *  whitespace on the continuation line. */
function foldLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.length <= 75) {
      out.push(line);
      continue;
    }
    let rest = line;
    out.push(rest.slice(0, 75));
    rest = rest.slice(75);
    while (rest.length > 0) {
      out.push(" " + rest.slice(0, 74));
      rest = rest.slice(74);
    }
  }
  return out;
}

/**
 * Reports loader — Alltagshilfe monthly report summary for mobile.
 *
 * Read-only. The full PDF generation stays on the web app; the mobile
 * screen shows the same figures so an admin can eyeball the month
 * without opening a browser.
 */

import { getSupabase } from "@/lib/supabase";

export type AlltagshilfeReportRow = {
  client_id: string;
  client_name: string;
  care_fund: string | null;
  hours: number;
  visits: number;
};

export type AlltagshilfeReport = {
  period_label: string; // "August 2026"
  period_start: string; // ISO date
  period_end: string; // ISO date
  rows: AlltagshilfeReportRow[];
  total_hours: number;
  total_visits: number;
};

/**
 * Build the report from `time_entries` × `shifts` × `properties` ×
 * `clients` on the fly. Mirrors the aggregation the web app runs at
 * month-end, restricted to the caller's org via RLS.
 *
 * Month is inclusive-start / exclusive-end.
 */
export async function loadAlltagshilfeReportForMonth(
  monthStart: Date,
): Promise<AlltagshilfeReport> {
  const supabase = getSupabase();

  const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const period_start = start.toISOString().slice(0, 10);
  const period_end = end.toISOString().slice(0, 10);
  const period_label = start.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  // Pull approved shifts for the month, joined to property → client so
  // we can group + filter to Alltagshilfe only.
  const { data: shifts } = await supabase
    .from("shifts")
    .select(
      `id, actual_hours, actual_start,
       property:properties (
         client:clients ( id, display_name, customer_type, insurance_provider )
       )`,
    )
    .eq("status", "approved")
    .gte("actual_start", start.toISOString())
    .lt("actual_start", end.toISOString());

  type S = {
    id: string;
    actual_hours: number | null;
    property: {
      client: {
        id: string;
        display_name: string;
        customer_type: string;
        insurance_provider: string | null;
      } | null;
    } | null;
  };

  const byClient = new Map<string, AlltagshilfeReportRow>();
  for (const s of ((shifts ?? []) as unknown) as S[]) {
    const c = s.property?.client;
    if (!c || c.customer_type !== "alltagshilfe") continue;
    const key = c.id;
    const existing = byClient.get(key) ?? {
      client_id: c.id,
      client_name: c.display_name,
      care_fund: c.insurance_provider,
      hours: 0,
      visits: 0,
    };
    existing.hours += s.actual_hours ?? 0;
    existing.visits += 1;
    byClient.set(key, existing);
  }

  const rows = [...byClient.values()].sort((a, b) =>
    a.client_name.localeCompare(b.client_name),
  );

  return {
    period_label,
    period_start,
    period_end,
    rows,
    total_hours: rows.reduce((s, r) => s + r.hours, 0),
    total_visits: rows.reduce((s, r) => s + r.visits, 0),
  };
}

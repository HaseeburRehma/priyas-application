/**
 * Reports loader — Alltagshilfe monthly report summary for mobile.
 *
 * Read-only. The full PDF generation and the e-mail to management stay
 * on the web app; the mobile screen shows the same figures so an admin
 * can eyeball the month without opening a browser.
 *
 * Aggregation mirrors the web loader (`src/lib/api/alltagshilfe.ts`):
 * every non-deleted shift starting in the month at a property owned by
 * an Alltagshilfe client, hours = ends_at − starts_at, grouped by client
 * then employee, amount = hours × the web's flat care rate.
 *
 * Column note (2026-10): this used to filter `shifts.status = 'approved'`
 * and read `actual_hours` / `actual_start`. Neither the columns nor that
 * enum value exist, so the query always failed and the screen was always
 * empty. The field names exported below are unchanged.
 */

import { getSupabase } from "@/lib/supabase";

/** Same flat rate the web report uses (`HOURLY_RATE_CENTS` in
 *  src/lib/api/alltagshilfe.ts). Keep in sync. */
export const ALLTAGSHILFE_HOURLY_RATE_CENTS = 1720;

export type AlltagshilfeStaffRow = {
  employee_id: string;
  name: string;
  visits: number;
  hours: number;
  amount_cents: number;
};

export type AlltagshilfeReportRow = {
  client_id: string;
  client_name: string;
  care_fund: string | null;
  hours: number;
  visits: number;
  /* ---- Optional, added for the 2026-10 redesign ---- */
  address?: string | null;
  rhythm?: "weekly" | "biweekly" | "monthly" | "on_demand" | null;
  amount_cents?: number;
  staff?: AlltagshilfeStaffRow[];
};

export type AlltagshilfeDelivery = {
  status: "queued" | "sent" | "failed" | "manual_skipped";
  recipient: string;
  format: string;
  sent_at: string | null;
  created_at: string;
  error_message: string | null;
};

export type AlltagshilfeReport = {
  period_label: string; // "August 2026"
  period_start: string; // ISO date
  period_end: string; // ISO date
  rows: AlltagshilfeReportRow[];
  total_hours: number;
  total_visits: number;
  /* ---- Optional, added for the 2026-10 redesign ---- */
  total_amount_cents?: number;
  hourly_rate_cents?: number;
  staff_count?: number;
  insurers_count?: number;
  /** Latest delivery log row for this period (null = never sent). */
  delivery?: AlltagshilfeDelivery | null;
};

/**
 * Month is inclusive-start / exclusive-end. RLS scopes every query to
 * the caller's org.
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

  const [clientsRes, deliveryRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, display_name, insurance_provider, cleaning_rhythm")
      .eq("customer_type", "alltagshilfe")
      .is("deleted_at", null)
      .limit(5000),
    supabase
      .from("monthly_report_deliveries")
      .select("status, recipient, format, sent_at, created_at, error_message")
      .eq("report_type", "alltagshilfe")
      .eq("period_year", start.getFullYear())
      .eq("period_month", start.getMonth())
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  type ClientRow = {
    id: string;
    display_name: string;
    insurance_provider: string | null;
    cleaning_rhythm: AlltagshilfeReportRow["rhythm"];
  };
  const clients = new Map<string, ClientRow>();
  for (const c of (clientsRes.data ?? []) as ClientRow[]) clients.set(c.id, c);

  // Narrow shifts to properties of Alltagshilfe clients (web does the same).
  let propIds: string[] = [];
  if (clients.size > 0) {
    const { data: props } = await supabase
      .from("properties")
      .select("id")
      .in("client_id", [...clients.keys()])
      .is("deleted_at", null)
      .limit(5000);
    propIds = ((props ?? []) as Array<{ id: string }>).map((p) => p.id);
  }

  type S = {
    starts_at: string;
    ends_at: string;
    property: {
      address_line1: string | null;
      city: string | null;
      client_id: string;
    } | null;
    employee: { id: string; full_name: string } | null;
  };
  let shifts: S[] = [];
  if (propIds.length > 0) {
    const { data } = await supabase
      .from("shifts")
      .select(
        `starts_at, ends_at,
         property:properties ( address_line1, city, client_id ),
         employee:employees ( id, full_name )`,
      )
      .in("property_id", propIds)
      .is("deleted_at", null)
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .limit(10000);
    shifts = ((data ?? []) as unknown) as S[];
  }

  const byClient = new Map<
    string,
    AlltagshilfeReportRow & { staffMap: Map<string, AlltagshilfeStaffRow> }
  >();
  const staffIds = new Set<string>();
  for (const s of shifts) {
    const c = s.property ? clients.get(s.property.client_id) : undefined;
    if (!c) continue;
    const hours = Math.max(
      0,
      (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 3_600_000,
    );
    const row = byClient.get(c.id) ?? {
      client_id: c.id,
      client_name: c.display_name,
      care_fund: c.insurance_provider,
      hours: 0,
      visits: 0,
      address: [s.property?.address_line1, s.property?.city].filter(Boolean).join(", ") || null,
      rhythm: c.cleaning_rhythm ?? null,
      amount_cents: 0,
      staffMap: new Map<string, AlltagshilfeStaffRow>(),
    };
    row.hours += hours;
    row.visits += 1;
    const empId = s.employee?.id ?? "unassigned";
    if (s.employee) staffIds.add(s.employee.id);
    const st = row.staffMap.get(empId) ?? {
      employee_id: empId,
      name: s.employee?.full_name ?? "—",
      visits: 0,
      hours: 0,
      amount_cents: 0,
    };
    st.visits += 1;
    st.hours += hours;
    row.staffMap.set(empId, st);
    byClient.set(c.id, row);
  }

  const rows: AlltagshilfeReportRow[] = [...byClient.values()]
    .map(({ staffMap, ...row }) => {
      const staff = [...staffMap.values()]
        .map((st) => ({
          ...st,
          amount_cents: Math.round(st.hours * ALLTAGSHILFE_HOURLY_RATE_CENTS),
        }))
        .sort((a, b) => b.hours - a.hours);
      return {
        ...row,
        staff,
        amount_cents: staff.reduce((sum, st) => sum + st.amount_cents, 0),
      };
    })
    .sort((a, b) => b.hours - a.hours);

  // A successful send wins over retries/failures in the same period;
  // otherwise show the most recent attempt.
  const attempts = deliveryRes.error ? [] : ((deliveryRes.data ?? []) as AlltagshilfeDelivery[]);
  const delivery = attempts.find((a) => a.status === "sent") ?? attempts[0] ?? null;

  return {
    period_label,
    period_start,
    period_end,
    rows,
    total_hours: rows.reduce((s, r) => s + r.hours, 0),
    total_visits: rows.reduce((s, r) => s + r.visits, 0),
    total_amount_cents: rows.reduce((s, r) => s + (r.amount_cents ?? 0), 0),
    hourly_rate_cents: ALLTAGSHILFE_HOURLY_RATE_CENTS,
    staff_count: staffIds.size,
    insurers_count: new Set(rows.map((r) => r.care_fund).filter(Boolean)).size,
    delivery,
  };
}

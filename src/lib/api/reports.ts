import "server-only";
import { startOfYear, addMonths, format } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReportRange = "30d" | "Q" | "YTD" | "12mo";

export type ReportsKpis = {
  revenueCents: number;
  revenueDeltaPct: number;
  revenueSpark: number[];
  hours: number;
  hoursDeltaPct: number;
  hoursPerWeekAvg: number;
  activeStaff: number;
  hoursSpark: number[];
  shiftsCompleted: number;
  shiftsTotal: number;
  shiftsRedistributed: number;
  shiftsCompletionPct: number;
  shiftsSpark: number[];
  satisfactionAvg: number;
  satisfactionReviews: number;
  satisfactionNps: number;
};

export type RevenueMonth = {
  label: string;
  invoicedCents: number;
  collectedCents: number;
  forecast: boolean;
};

export type HoursByService = {
  serviceType: string;
  hours: number;
  pct: number;
};

export type ReportsData = {
  range: ReportRange;
  rangeStart: string;
  rangeEnd: string;
  kpis: ReportsKpis;
  revenueSeries: RevenueMonth[];
  hoursByService: HoursByService[];
  totalHours: number;
  billingRate: number;
  averageRate: number;
};

const SERVICE_LABELS: Record<string, string> = {
  maintenance_cleaning: "Reguläre Reinigung",
  deep_cleaning: "Deep clean",
  window_cleaning: "Spezialaufträge",
  office_cleaning: "Notdienst",
};
const SERVICE_FALLBACK = "Sonstige";

function rangeBounds(range: ReportRange): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  switch (range) {
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    case "Q":
      start.setMonth(start.getMonth() - 3);
      break;
    case "12mo":
      start.setMonth(start.getMonth() - 12);
      break;
    case "YTD":
    default:
      return { start: startOfYear(end), end };
  }
  return { start, end };
}

function pctDelta(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

/** Loads everything the reports page renders. RLS keeps it scoped. */
export async function loadReports(range: ReportRange = "YTD"): Promise<ReportsData> {
  const supabase = await createSupabaseServerClient();
  const { start, end } = rangeBounds(range);
  const prevStart = new Date(start);
  prevStart.setFullYear(prevStart.getFullYear() - 1);
  const prevEnd = new Date(end);
  prevEnd.setFullYear(prevEnd.getFullYear() - 1);

  // Run the heavy queries in parallel.
  const [
    invoicesCurRes,
    invoicesPrevRes,
    timeEntriesCurRes,
    timeEntriesPrevRes,
    shiftsRes,
    shiftsPrevRes,
    activeStaffRes,
    monthlyInvoicesRes,
    serviceScopesRes,
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("total_cents, status, issue_date, paid_at")
      .gte("issue_date", start.toISOString().slice(0, 10))
      .is("deleted_at", null),
    supabase
      .from("invoices")
      .select("total_cents, status")
      .gte("issue_date", prevStart.toISOString().slice(0, 10))
      .lte("issue_date", prevEnd.toISOString().slice(0, 10))
      .is("deleted_at", null),
    supabase
      .from("time_entries")
      .select("check_in_at, check_out_at, break_minutes, employee_id, shift_id")
      .gte("check_in_at", start.toISOString())
      .lte("check_in_at", end.toISOString()),
    supabase
      .from("time_entries")
      .select("check_in_at, check_out_at, break_minutes")
      .gte("check_in_at", prevStart.toISOString())
      .lte("check_in_at", prevEnd.toISOString()),
    supabase
      .from("shifts")
      .select("id, status, starts_at, property_id")
      .gte("starts_at", start.toISOString())
      .lte("starts_at", end.toISOString())
      .is("deleted_at", null),
    supabase
      .from("shifts")
      .select("id, status")
      .gte("starts_at", prevStart.toISOString())
      .lte("starts_at", prevEnd.toISOString())
      .is("deleted_at", null),
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .is("deleted_at", null),
    supabase
      .from("invoices")
      .select("total_cents, status, issue_date, paid_at")
      .gte("issue_date", addMonths(end, -11).toISOString().slice(0, 10))
      .is("deleted_at", null),
    supabase
      .from("service_scopes")
      .select("client_id, service_type"),
  ]);

  /* ---- Revenue KPI ----- */
  const invCur = (invoicesCurRes.data ?? []) as Array<{
    total_cents: number | null;
    status: string;
    issue_date: string;
    paid_at: string | null;
  }>;
  const invPrev = (invoicesPrevRes.data ?? []) as Array<{
    total_cents: number | null;
    status: string;
  }>;
  const revenueCents = invCur
    .filter((r) => ["paid", "sent", "overdue"].includes(r.status))
    .reduce((s, r) => s + Number(r.total_cents ?? 0), 0);
  const revenuePrev = invPrev
    .filter((r) => ["paid", "sent", "overdue"].includes(r.status))
    .reduce((s, r) => s + Number(r.total_cents ?? 0), 0);
  const revenueDeltaPct = pctDelta(revenueCents, revenuePrev);

  /* ---- Hours KPI ----- */
  const teCur = (timeEntriesCurRes.data ?? []) as Array<{
    check_in_at: string;
    check_out_at: string | null;
    break_minutes: number | null;
    employee_id: string;
    shift_id: string | null;
  }>;
  const tePrev = (timeEntriesPrevRes.data ?? []) as Array<{
    check_in_at: string;
    check_out_at: string | null;
    break_minutes: number | null;
  }>;
  const hoursOf = (
    rows: Array<{ check_in_at: string; check_out_at: string | null; break_minutes: number | null }>,
  ) =>
    rows.reduce((s, r) => {
      if (!r.check_out_at) return s;
      const ms = new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime();
      return s + Math.max(0, ms / 3_600_000 - (r.break_minutes ?? 0) / 60);
    }, 0);
  const hours = Math.round(hoursOf(teCur));
  const hoursPrev = Math.round(hoursOf(tePrev));
  const hoursDeltaPct = pctDelta(hours, hoursPrev);
  const employeesActive = activeStaffRes.count ?? 0;
  const weeksInRange = Math.max(
    1,
    (end.getTime() - start.getTime()) / (7 * 24 * 3600 * 1000),
  );
  const hoursPerWeekAvg =
    employeesActive > 0 ? hours / employeesActive / weeksInRange : 0;

  /* ---- Shifts completion KPI ----- */
  const shifts = (shiftsRes.data ?? []) as Array<{
    id: string;
    status: string;
    starts_at: string;
    property_id: string;
  }>;
  const completed = shifts.filter((s) => s.status === "completed").length;
  const total = shifts.length;
  const cancelled = shifts.filter((s) => s.status === "cancelled").length;
  const completionPct = total > 0 ? (completed / total) * 100 : 0;

  /* ---- Customer satisfaction (placeholder until reviews exist) ----- */
  // No reviews table yet; keep deterministic stand-in figures so the card
  // renders. Wired up to a real `reviews` query in a follow-up phase.
  const satisfactionAvg = 4.7;
  const satisfactionReviews = 284;
  const satisfactionNps = 62;

  /* ---- Revenue series (last 12 months) ----- */
  const monthlyInvoices = (monthlyInvoicesRes.data ?? []) as Array<{
    total_cents: number | null;
    status: string;
    issue_date: string;
    paid_at: string | null;
  }>;
  const months: RevenueMonth[] = [];
  for (let i = 11; i >= 0; i--) {
    const monthDate = addMonths(end, -i);
    const yyyy = monthDate.getFullYear();
    const mm = monthDate.getMonth();
    let invoiced = 0;
    let collected = 0;
    for (const r of monthlyInvoices) {
      const d = new Date(r.issue_date);
      if (d.getFullYear() !== yyyy || d.getMonth() !== mm) continue;
      const cents = Number(r.total_cents ?? 0);
      if (["paid", "sent", "overdue"].includes(r.status)) invoiced += cents;
      if (r.status === "paid") collected += cents;
    }
    const isFuture =
      yyyy === end.getFullYear() && mm === end.getMonth() + 1;
    months.push({
      label: format(monthDate, "MMM"),
      invoicedCents: invoiced,
      collectedCents: collected,
      forecast: isFuture || (yyyy === end.getFullYear() && mm > end.getMonth()),
    });
  }
  // Add one forecast bar after the last real month.
  const last = months[months.length - 1];
  if (last && !last.forecast) {
    months.push({
      label: format(addMonths(end, 1), "MMM"),
      invoicedCents: Math.round(last.invoicedCents * 1.05),
      collectedCents: 0,
      forecast: true,
    });
  }

  /* ---- Hours by service type (donut) ----- */
  // Each shift inherits its service type from the property's client's
  // service_scopes row (or falls back to "maintenance_cleaning").
  const scopeByClient = new Map<string, string>();
  for (const s of (serviceScopesRes.data ?? []) as Array<{
    client_id: string;
    service_type: string;
  }>) {
    if (!scopeByClient.has(s.client_id))
      scopeByClient.set(s.client_id, s.service_type);
  }

  // Pull property → client mapping in a single query for the seen properties.
  const propIds = Array.from(new Set(shifts.map((s) => s.property_id)));
  let propClient = new Map<string, string>();
  if (propIds.length > 0) {
    const { data: props } = await supabase
      .from("properties")
      .select("id, client_id")
      .in("id", propIds);
    propClient = new Map(
      ((props ?? []) as Array<{ id: string; client_id: string }>).map((p) => [
        p.id,
        p.client_id,
      ]),
    );
  }

  // Sum hours per service type from time entries (joined back to shift → property → client).
  const shiftPropMap = new Map<string, string>();
  for (const s of shifts) shiftPropMap.set(s.id, s.property_id);
  const hoursByServiceMap = new Map<string, number>();
  for (const t of teCur) {
    if (!t.shift_id) continue;
    const propId = shiftPropMap.get(t.shift_id);
    if (!propId) continue;
    const clientId = propClient.get(propId);
    const svc = clientId ? scopeByClient.get(clientId) : undefined;
    const key = svc ?? "maintenance_cleaning";
    if (!t.check_out_at) continue;
    const h = Math.max(
      0,
      (new Date(t.check_out_at).getTime() - new Date(t.check_in_at).getTime()) /
        3_600_000 -
        (t.break_minutes ?? 0) / 60,
    );
    hoursByServiceMap.set(key, (hoursByServiceMap.get(key) ?? 0) + h);
  }

  const totalHours =
    Array.from(hoursByServiceMap.values()).reduce((s, n) => s + n, 0) || hours;
  const hoursByService: HoursByService[] = Array.from(
    hoursByServiceMap.entries(),
  )
    .map(([k, h]) => ({
      serviceType: SERVICE_LABELS[k] ?? SERVICE_FALLBACK,
      hours: Math.round(h),
      pct: totalHours > 0 ? (h / totalHours) * 100 : 0,
    }))
    .sort((a, b) => b.hours - a.hours);

  /* ---- Sparkline data — sparse buckets per range ----- */
  const buckets = 13;
  const revenueSpark = bucketSeries(invCur, "issue_date", buckets, start, end, (r) =>
    Number((r as { total_cents: number | null }).total_cents ?? 0),
  );
  const hoursSpark = bucketSeries(teCur, "check_in_at", buckets, start, end, (r) => {
    const tr = r as {
      check_in_at: string;
      check_out_at: string | null;
      break_minutes: number | null;
    };
    if (!tr.check_out_at) return 0;
    return Math.max(
      0,
      (new Date(tr.check_out_at).getTime() - new Date(tr.check_in_at).getTime()) /
        3_600_000 -
        (tr.break_minutes ?? 0) / 60,
    );
  });
  const shiftsSpark = bucketSeries(
    shifts.filter((s) => s.status === "completed"),
    "starts_at",
    buckets,
    start,
    end,
    () => 1,
  );

  /* ---- Billing rate + average rate ----- */
  const billingRate = total > 0 ? completionPct : 0;
  const averageRate = totalHours > 0 ? revenueCents / 100 / totalHours : 0;

  // Use shiftsPrev only to keep TypeScript happy (referenced for future deltas).
  void shiftsPrevRes;

  return {
    range,
    rangeStart: start.toISOString().slice(0, 10),
    rangeEnd: end.toISOString().slice(0, 10),
    kpis: {
      revenueCents,
      revenueDeltaPct,
      revenueSpark,
      hours,
      hoursDeltaPct,
      hoursPerWeekAvg,
      activeStaff: employeesActive,
      hoursSpark,
      shiftsCompleted: completed,
      shiftsTotal: total,
      shiftsRedistributed: cancelled,
      shiftsCompletionPct: completionPct,
      shiftsSpark,
      satisfactionAvg,
      satisfactionReviews,
      satisfactionNps,
    },
    revenueSeries: months,
    hoursByService,
    totalHours: Math.round(totalHours),
    billingRate,
    averageRate,
  };
}

/** Splits a series of rows into N evenly-spaced buckets and sums them. */
function bucketSeries<T>(
  rows: T[],
  dateKey: keyof T,
  buckets: number,
  start: Date,
  end: Date,
  weight: (row: T) => number,
): number[] {
  const result = Array.from({ length: buckets }, () => 0);
  const span = end.getTime() - start.getTime();
  if (span <= 0) return result;
  for (const row of rows) {
    const v = row[dateKey];
    const t = typeof v === "string" || v instanceof Date ? new Date(v).getTime() : NaN;
    if (Number.isNaN(t)) continue;
    const idx = Math.min(
      buckets - 1,
      Math.max(0, Math.floor(((t - start.getTime()) / span) * buckets)),
    );
    result[idx] = (result[idx] ?? 0) + weight(row);
  }
  return result;
}

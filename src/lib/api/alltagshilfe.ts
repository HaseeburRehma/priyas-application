import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type AppLocale,
  formatDayMonth,
} from "@/lib/utils/i18n-format";

export type AlltagshilfeMonthlySummary = {
  totalHours: number;
  hoursDeltaPctVsPrev: number;
  totalClients: number;
  activeClients: number;
  visitsCount: number;
  insurersCount: number;
  involvedStaff: number;
  qualifiedStaff: number;
  amountCents: number;
  hourlyRateCents: number;
};

export type AlltagshilfeRow = {
  client: {
    id: string;
    name: string;
    address: string;
    insurance: string;
    /** Pflegegrad 1–5. Drives the care-level pill colour on the row. */
    careLevel: number | null;
    /** Cleaning rhythm enum from clients table; page translates to a label. */
    rhythm: "weekly" | "biweekly" | "monthly" | "on_demand" | null;
  };
  staff: Array<{
    id: string;
    name: string;
    qualifications: string[];
    period: string;
    schedule: string;
    visits: number;
    hours: number;
    rateCents: number;
    amountCents: number;
  }>;
  totalHours: number;
  totalAmountCents: number;
};

/** Cross-client roll-up showing how each employee's month broke down. */
export type AlltagshilfeEmployeeSummary = {
  id: string;
  name: string;
  customersCount: number;
  visits: number;
  hours: number;
  amountCents: number;
};

export type AlltagshilfeDelivery = {
  id: string;
  status: "queued" | "sent" | "failed" | "manual_skipped";
  recipient: string;
  format: string;
  sentAt: string | null;
  createdAt: string;
  emailProviderId: string | null;
  errorMessage: string | null;
};

export type AlltagshilfeMonthlyReport = {
  month: number; // 0–11
  year: number;
  summary: AlltagshilfeMonthlySummary;
  rows: AlltagshilfeRow[];
  /** Per-employee roll-up across all clients in the period. */
  byEmployee: AlltagshilfeEmployeeSummary[];
  /** Latest delivery row for this period, or null if never sent. */
  latestDelivery: AlltagshilfeDelivery | null;
  /** When the next automated send would fire (1st of next month, 06:00 CET). */
  nextRunAt: string;
};

const HOURLY_RATE_CENTS = 1720; // €17.20

/** Builds the monthly Alltagshilfe report. RLS scopes to the org. */
export async function loadAlltagshilfeMonthly(
  year: number,
  month: number, // 0–11
  locale: AppLocale = "de",
): Promise<AlltagshilfeMonthlyReport> {
  const supabase = await createSupabaseServerClient();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const prevStart = new Date(year, month - 1, 1);
  const prevEnd = monthStart;

  // Pre-fetch the alltagshilfe client ids first, narrow the (potentially
  // huge) shifts pull to properties owned by those clients in the next
  // round-trip. Without this step we'd fetch every shift in the month
  // and filter client-side — which OOMs the lambda on large orgs.
  const [clientsRes, prevHoursRes, employeesRes, latestDeliveryRes] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, display_name, insurance_provider, insurance_number, care_level, cleaning_rhythm",
      )
      .eq("customer_type", "alltagshilfe")
      .is("deleted_at", null),
    supabase
      .from("time_entries")
      .select("check_in_at, check_out_at, break_minutes, shift_id")
      .gte("check_in_at", prevStart.toISOString())
      .lt("check_in_at", prevEnd.toISOString())
      .limit(10000),
    supabase
      .from("employees")
      .select("id, status")
      .is("deleted_at", null)
      .limit(5000),
    // Most recent delivery row for this period. Ordered so a 'sent'
    // row beats any 'failed' attempts in the same period.
    supabase
      .from("monthly_report_deliveries")
      .select(
        "id, status, recipient, format, sent_at, created_at, email_provider_id, error_message",
      )
      .eq("report_type", "alltagshilfe")
      .eq("period_year", year)
      .eq("period_month", month)
      .order("status", { ascending: true }) // 'sent' sorts before 'queued'/'failed' alphabetically
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const altClientIds = (
    (clientsRes.data ?? []) as Array<{ id: string }>
  ).map((c) => c.id);

  // Resolve properties belonging to those clients so the shifts query
  // can use a property_id `.in()` filter instead of pulling everything.
  let altPropIds: string[] = [];
  if (altClientIds.length > 0) {
    const { data: propRows } = await supabase
      .from("properties")
      .select("id")
      .in("client_id", altClientIds)
      .is("deleted_at", null)
      .limit(5000);
    altPropIds = ((propRows ?? []) as Array<{ id: string }>).map((p) => p.id);
  }

  const currentShiftsRes = altPropIds.length === 0
    ? { data: [] as unknown[] }
    : await supabase
        .from("shifts")
        .select(
          `id, starts_at, ends_at, status,
           property:properties ( id, name, address_line1, city,
                                 client_id,
                                 client:clients ( id, display_name, customer_type, insurance_provider )
           ),
           employee:employees ( id, full_name )`,
        )
        .in("property_id", altPropIds)
        .gte("starts_at", monthStart.toISOString())
        .lt("starts_at", monthEnd.toISOString())
        .is("deleted_at", null)
        .limit(10000);

  type ClientRow = {
    id: string;
    display_name: string;
    insurance_provider: string | null;
    insurance_number: string | null;
    care_level: number | null;
    cleaning_rhythm:
      | "weekly"
      | "biweekly"
      | "monthly"
      | "on_demand"
      | null;
  };
  const clients = (clientsRes.data ?? []) as ClientRow[];
  const employees = (employeesRes.data ?? []) as Array<{
    id: string;
    status: string;
  }>;

  type ShiftRow = {
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    property: {
      id: string;
      name: string;
      address_line1: string;
      city: string;
      client_id: string;
      client: { id: string; display_name: string; customer_type: string; insurance_provider: string | null } | null;
    } | null;
    employee: { id: string; full_name: string } | null;
  };
  const shifts = (currentShiftsRes.data ?? []) as unknown as ShiftRow[];
  const altShifts = shifts.filter(
    (s) => s.property?.client?.customer_type === "alltagshilfe",
  );

  // Group by client → employee.
  const byClient = new Map<
    string,
    {
      client: AlltagshilfeRow["client"];
      byEmployee: Map<
        string,
        {
          name: string;
          visits: number;
          hours: number;
          firstVisit: Date;
          lastVisit: Date;
        }
      >;
    }
  >();

  for (const s of altShifts) {
    if (!s.property?.client) continue;
    const c = s.property.client;
    const key = c.id;
    const startsAt = new Date(s.starts_at);
    const endsAt = new Date(s.ends_at);
    const hours = Math.max(0, (endsAt.getTime() - startsAt.getTime()) / 3_600_000);
    const empId = s.employee?.id ?? "unassigned";
    const empName = s.employee?.full_name ?? "—";

    if (!byClient.has(key)) {
      const sourceClient = clients.find((cc) => cc.id === c.id);
      byClient.set(key, {
        client: {
          id: c.id,
          name: c.display_name,
          address: `${s.property.address_line1}, ${s.property.city}`,
          insurance: sourceClient?.insurance_provider ?? c.insurance_provider ?? "—",
          careLevel: sourceClient?.care_level ?? null,
          rhythm: sourceClient?.cleaning_rhythm ?? null,
        },
        byEmployee: new Map(),
      });
    }
    const bucket = byClient.get(key)!;
    const empBucket = bucket.byEmployee.get(empId) ?? {
      name: empName,
      visits: 0,
      hours: 0,
      firstVisit: startsAt,
      lastVisit: startsAt,
    };
    empBucket.visits += 1;
    empBucket.hours += hours;
    if (startsAt < empBucket.firstVisit) empBucket.firstVisit = startsAt;
    if (startsAt > empBucket.lastVisit) empBucket.lastVisit = startsAt;
    bucket.byEmployee.set(empId, empBucket);
  }

  const rows: AlltagshilfeRow[] = [];
  for (const bucket of byClient.values()) {
    let totalHours = 0;
    let totalAmount = 0;
    const staff = Array.from(bucket.byEmployee.entries()).map(([id, e]) => {
      const amount = Math.round(e.hours * HOURLY_RATE_CENTS);
      totalHours += e.hours;
      totalAmount += amount;
      return {
        id,
        name: e.name,
        qualifications: ["Pflegehelfer:in"],
        period: `${formatDayMonth(e.firstVisit, locale)} – ${formatDayMonth(
          e.lastVisit,
          locale,
        )}`,
        schedule: "—",
        visits: e.visits,
        hours: e.hours,
        rateCents: HOURLY_RATE_CENTS,
        amountCents: amount,
      };
    });
    rows.push({
      client: bucket.client,
      staff,
      totalHours,
      totalAmountCents: totalAmount,
    });
  }
  rows.sort((a, b) => b.totalHours - a.totalHours);

  // Summary
  const totalHours = rows.reduce((s, r) => s + r.totalHours, 0);
  const visitsCount = rows.reduce(
    (s, r) => s + r.staff.reduce((s2, e) => s2 + e.visits, 0),
    0,
  );
  const insurers = new Set(rows.map((r) => r.client.insurance));
  const involvedStaff = new Set(
    altShifts.map((s) => s.employee?.id).filter(Boolean) as string[],
  ).size;
  const qualifiedStaff = employees.filter((e) => e.status === "active").length;
  const totalAmount = rows.reduce((s, r) => s + r.totalAmountCents, 0);

  // Previous-month hours for the delta.
  const prevHours = (
    (prevHoursRes.data ?? []) as Array<{
      check_in_at: string;
      check_out_at: string | null;
      break_minutes: number | null;
    }>
  ).reduce((sum, r) => {
    if (!r.check_out_at) return sum;
    const ms =
      new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime();
    return sum + Math.max(0, ms / 3_600_000 - (r.break_minutes ?? 0) / 60);
  }, 0);
  const hoursDeltaPctVsPrev =
    prevHours === 0 ? (totalHours > 0 ? 100 : 0) : ((totalHours - prevHours) / prevHours) * 100;

  // ---------- Per-employee roll-up across all clients ----------
  // Rather than re-walk `rows` we re-walk altShifts so the employee
  // sees the same hours we already attributed to them in the per-client
  // bucket — no double rounding.
  const empBucket = new Map<
    string,
    {
      name: string;
      customers: Set<string>;
      visits: number;
      hours: number;
    }
  >();
  for (const s of altShifts) {
    if (!s.property?.client || !s.employee) continue;
    const empId = s.employee.id;
    const empName = s.employee.full_name;
    const clientId = s.property.client.id;
    const startsAt = new Date(s.starts_at);
    const endsAt = new Date(s.ends_at);
    const hours = Math.max(0, (endsAt.getTime() - startsAt.getTime()) / 3_600_000);

    const e = empBucket.get(empId) ?? {
      name: empName,
      customers: new Set<string>(),
      visits: 0,
      hours: 0,
    };
    e.customers.add(clientId);
    e.visits += 1;
    e.hours += hours;
    empBucket.set(empId, e);
  }
  const byEmployee: AlltagshilfeEmployeeSummary[] = Array.from(
    empBucket.entries(),
  )
    .map(([id, e]) => ({
      id,
      name: e.name,
      customersCount: e.customers.size,
      visits: e.visits,
      hours: e.hours,
      amountCents: Math.round(e.hours * HOURLY_RATE_CENTS),
    }))
    .sort((a, b) => b.hours - a.hours);

  // ---------- Latest delivery + next-run preview ----------
  type DeliveryRow = {
    id: string;
    status: AlltagshilfeDelivery["status"];
    recipient: string;
    format: string;
    sent_at: string | null;
    created_at: string;
    email_provider_id: string | null;
    error_message: string | null;
  };
  const deliveryRows = (latestDeliveryRes.data ?? []) as DeliveryRow[];
  const dRow = deliveryRows[0];
  const latestDelivery: AlltagshilfeDelivery | null = dRow
    ? {
        id: dRow.id,
        status: dRow.status,
        recipient: dRow.recipient,
        format: dRow.format,
        sentAt: dRow.sent_at,
        createdAt: dRow.created_at,
        emailProviderId: dRow.email_provider_id,
        errorMessage: dRow.error_message,
      }
    : null;

  // Next run: 1st of the month after the *current* period at 06:00 CET.
  // We render the wall-clock timestamp; the timezone label is computed
  // page-side via Intl since it varies between MEZ and MESZ.
  const nextRunAt = new Date(year, month + 1, 1, 6, 0, 0, 0).toISOString();

  return {
    month,
    year,
    summary: {
      totalHours,
      hoursDeltaPctVsPrev,
      totalClients: rows.length,
      activeClients: rows.length,
      visitsCount,
      insurersCount: insurers.size,
      involvedStaff,
      qualifiedStaff,
      amountCents: totalAmount,
      hourlyRateCents: HOURLY_RATE_CENTS,
    },
    rows,
    byEmployee,
    latestDelivery,
    nextRunAt,
  };
}

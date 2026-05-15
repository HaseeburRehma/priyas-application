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
  client: { id: string; name: string; address: string; insurance: string };
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

export type AlltagshilfeMonthlyReport = {
  month: number; // 0–11
  year: number;
  summary: AlltagshilfeMonthlySummary;
  rows: AlltagshilfeRow[];
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
  const [clientsRes, prevHoursRes, employeesRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, display_name, insurance_provider, insurance_number, care_level")
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
  };
}

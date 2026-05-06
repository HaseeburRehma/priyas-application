import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canReachRoute } from "@/lib/rbac/permissions";
import { format } from "date-fns";

/**
 * Working-time report — CSV export of every check-in/check-out pair for
 * one calendar month. Used by management for payroll + invoicing audits.
 *
 *   GET /api/reports/working-time?month=YYYY-MM&employee=<uuid>
 *
 * Without `?employee=` the report covers the whole org.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await canReachRoute("reports"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const month =
    url.searchParams.get("month") ?? format(new Date(), "yyyy-MM");
  const employee = url.searchParams.get("employee");

  // Compute month bounds.
  const monthStart = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(monthStart.getTime())) {
    return NextResponse.json({ error: "bad month" }, { status: 400 });
  }
  const next = new Date(monthStart);
  next.setUTCMonth(next.getUTCMonth() + 1);

  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("time_entries")
    .select(
      `id, kind, occurred_at, manual, distance_m, accuracy_m,
       shift:shifts ( id, starts_at, ends_at ),
       employee:employees ( id, full_name ),
       property:properties ( id, name )`,
    )
    .gte("occurred_at", monthStart.toISOString())
    .lt("occurred_at", next.toISOString())
    .order("occurred_at", { ascending: true });
  if (employee) q = q.eq("employee_id", employee);

  const { data: rows } = await q;
  type Row = {
    id: string;
    kind: "check_in" | "check_out";
    occurred_at: string;
    manual: boolean;
    distance_m: number | null;
    accuracy_m: number | null;
    shift: { id: string; starts_at: string; ends_at: string } | null;
    employee: { id: string; full_name: string } | null;
    property: { id: string; name: string } | null;
  };
  const list = (rows ?? []) as unknown as Row[];

  // Pair check-ins with check-outs by shift+employee so we can compute hours.
  type Bucket = {
    employee_name: string;
    property_name: string;
    shift_start: string | null;
    shift_end: string | null;
    in: string | null;
    out: string | null;
    manual: boolean;
  };
  const buckets = new Map<string, Bucket>();
  for (const r of list) {
    const key = `${r.shift?.id ?? "?"}-${r.employee?.id ?? "?"}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        employee_name: r.employee?.full_name ?? "—",
        property_name: r.property?.name ?? "—",
        shift_start: r.shift?.starts_at ?? null,
        shift_end: r.shift?.ends_at ?? null,
        in: null,
        out: null,
        manual: false,
      };
      buckets.set(key, b);
    }
    if (r.kind === "check_in") b.in = r.occurred_at;
    if (r.kind === "check_out") b.out = r.occurred_at;
    if (r.manual) b.manual = true;
  }

  const csvLines = [
    [
      "employee",
      "property",
      "shift_start",
      "shift_end",
      "checked_in_at",
      "checked_out_at",
      "hours",
      "manual",
    ].join(","),
  ];
  for (const b of buckets.values()) {
    let hours = "";
    if (b.in && b.out) {
      const dur =
        (new Date(b.out).getTime() - new Date(b.in).getTime()) / 36e5;
      hours = dur.toFixed(2);
    }
    csvLines.push(
      [
        csv(b.employee_name),
        csv(b.property_name),
        b.shift_start ?? "",
        b.shift_end ?? "",
        b.in ?? "",
        b.out ?? "",
        hours,
        b.manual ? "yes" : "",
      ].join(","),
    );
  }

  return new NextResponse(csvLines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="working-time-${month}${
        employee ? "-" + employee.slice(0, 8) : ""
      }.csv"`,
      "cache-control": "no-store",
    },
  });
}

function csv(s: string): string {
  if (!/[",\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

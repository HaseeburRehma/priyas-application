import "server-only";
import { startOfWeek, endOfWeek, addDays, format, getISOWeek } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ScheduleClosure,
  ScheduleVacation,
  ScheduleWeek,
  ServiceLane,
  ShiftEvent,
  ShiftStatus,
} from "./schedule.types";

export type {
  ScheduleClosure,
  ScheduleVacation,
  ScheduleWeek,
  ServiceLane,
  ShiftEvent,
  ShiftStatus,
} from "./schedule.types";

const TONES = ["primary", "secondary", "accent", "warning"] as const;
const initialsOf = (n: string | null | undefined) =>
  (n ?? "—")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/**
 * Loads a single ISO week of shifts (Monday → Sunday by default), joined
 * with property + client + employee. Used to render the calendar grid.
 */
export async function loadScheduleWeek(
  anchor: Date = new Date(),
): Promise<ScheduleWeek> {
  const supabase = await createSupabaseServerClient();
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(anchor, { weekStartsOn: 1 });

  const { data } = await supabase
    .from("shifts")
    .select(
      `id, starts_at, ends_at, status, notes, employee_id,
       property:properties (
         id, name,
         client:clients ( id, display_name, customer_type )
       ),
       employee:employees ( id, full_name )`,
    )
    .is("deleted_at", null)
    .gte("starts_at", weekStart.toISOString())
    .lte("starts_at", weekEnd.toISOString())
    .order("starts_at", { ascending: true });

  type Row = {
    id: string;
    starts_at: string;
    ends_at: string;
    status: ShiftStatus;
    notes: string | null;
    employee_id: string | null;
    property: {
      id: string;
      name: string;
      client: { id: string; display_name: string; customer_type: string } | null;
    } | null;
    employee: { id: string; full_name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const events: ShiftEvent[] = rows.map((r, idx) => {
    const customerType = r.property?.client?.customer_type ?? "commercial";
    const lane: ServiceLane =
      customerType === "alltagshilfe" ? "alltagshilfe" : "priyas";
    return {
      id: r.id,
      title: r.property?.name ?? "—",
      property_id: r.property?.id ?? "",
      property_name: r.property?.name ?? "—",
      client_id: r.property?.client?.id ?? "",
      client_name: r.property?.client?.display_name ?? "—",
      service_lane: lane,
      status: r.status,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      team: r.employee
        ? [
            {
              id: r.employee.id,
              initials: initialsOf(r.employee.full_name),
              tone: TONES[idx % TONES.length] ?? "primary",
            },
          ]
        : [],
      notes: r.notes,
    };
  });

  const days = Array.from({ length: 7 }, (_, i) =>
    format(addDays(weekStart, i), "yyyy-MM-dd"),
  );

  // Closures + vacations that intersect this week — used for inline overlays.
  const weekStartIso = format(weekStart, "yyyy-MM-dd");
  const weekEndIso = format(weekEnd, "yyyy-MM-dd");

  const [closuresRes, vacationsRes] = await Promise.all([
    supabase
      .from("property_closures")
      .select(
        "id, property_id, start_date, end_date, reason, property:properties ( id, name )",
      )
      .lte("start_date", weekEndIso)
      .gte("end_date", weekStartIso),
    supabase
      .from("vacation_requests")
      .select(
        "id, employee_id, start_date, end_date, status, employee:employees ( id, full_name )",
      )
      .eq("status", "approved")
      .lte("start_date", weekEndIso)
      .gte("end_date", weekStartIso),
  ]);

  type ClosureRow = {
    id: string;
    property_id: string;
    start_date: string;
    end_date: string;
    reason: ScheduleClosure["reason"];
    property: { id: string; name: string } | null;
  };
  type VacationRow = {
    id: string;
    employee_id: string;
    start_date: string;
    end_date: string;
    employee: { id: string; full_name: string } | null;
  };

  const closures: ScheduleClosure[] = (
    (closuresRes.data ?? []) as unknown as ClosureRow[]
  ).map((c) => ({
    id: c.id,
    property_id: c.property_id,
    property_name: c.property?.name ?? "—",
    start_date: c.start_date,
    end_date: c.end_date,
    reason: c.reason,
  }));

  const vacations: ScheduleVacation[] = (
    (vacationsRes.data ?? []) as unknown as VacationRow[]
  ).map((v) => ({
    id: v.id,
    employee_id: v.employee_id,
    employee_name: v.employee?.full_name ?? "—",
    start_date: v.start_date,
    end_date: v.end_date,
  }));

  return {
    days,
    events,
    closures,
    vacations,
    weekLabel: `${format(weekStart, "d. MMM")} – ${format(weekEnd, "d. MMM yyyy")}`,
    isoWeek: getISOWeek(weekStart),
  };
}

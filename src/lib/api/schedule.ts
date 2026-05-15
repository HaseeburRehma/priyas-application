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

/**
 * Hard cap on the date span any caller can ask for in one go. The
 * calendar UI clamps to 6 weeks (42 days); deep-link / API callers that
 * exceed this are clamped so the shifts pull stays bounded.
 */
const MAX_RANGE_DAYS = 42;
const SHIFTS_HARD_LIMIT = 2000;

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
 * Loads an arbitrary date range of shifts (inclusive on both sides), joined
 * with property + client + employee. Foundation loader used by all calendar
 * views — Week, Day, Month and List — via thin wrappers below.
 *
 * `from` and `to` are interpreted as absolute UTC instants for the SQL
 * filter. Callers must compute these from Berlin wall-clock day boundaries
 * (the `Europe/Berlin` calendar day is what the UI buckets shifts onto).
 *
 * The `days` array in the returned `ScheduleWeek` lists every yyyy-MM-dd
 * day in the range (UTC `from`..`to`), Monday-first iteration semantics
 * not enforced — for ranges that aren't a full Mon..Sun week the caller
 * should treat `days` as the list of day-buckets it spans.
 */
export async function loadScheduleRange(
  from: Date,
  to: Date,
): Promise<ScheduleWeek> {
  const supabase = await createSupabaseServerClient();

  // Clamp ranges that exceed our defensive cap. We narrow `to`
  // rather than throw so a malformed deep-link still renders a sane
  // window instead of a 500.
  const spanMs = to.getTime() - from.getTime();
  const maxMs = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
  if (spanMs > maxMs) {
    to = new Date(from.getTime() + maxMs);
  }

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
    .gte("starts_at", from.toISOString())
    .lte("starts_at", to.toISOString())
    .order("starts_at", { ascending: true })
    .limit(SHIFTS_HARD_LIMIT);

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
      employee_id: r.employee_id,
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

  // Iterate days inclusive from..to. Use the calendar date in UTC for
  // bucketing; the UI re-buckets via Berlin day keys for display correctness.
  const days: string[] = [];
  for (
    let cursor = new Date(from.getTime());
    cursor.getTime() <= to.getTime();
    cursor = addDays(cursor, 1)
  ) {
    days.push(format(cursor, "yyyy-MM-dd"));
    if (days.length > 400) break; // safety guard
  }

  const fromIso = format(from, "yyyy-MM-dd");
  const toIso = format(to, "yyyy-MM-dd");

  const [closuresRes, vacationsRes] = await Promise.all([
    supabase
      .from("property_closures")
      .select(
        "id, property_id, start_date, end_date, reason, property:properties ( id, name )",
      )
      .lte("start_date", toIso)
      .gte("end_date", fromIso),
    supabase
      .from("vacation_requests")
      .select(
        "id, employee_id, start_date, end_date, status, employee:employees ( id, full_name )",
      )
      .eq("status", "approved")
      .lte("start_date", toIso)
      .gte("end_date", fromIso),
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
    weekLabel: `${format(from, "d. MMM")} – ${format(to, "d. MMM yyyy")}`,
    isoWeek: getISOWeek(from),
  };
}

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
    .order("starts_at", { ascending: true })
    .limit(SHIFTS_HARD_LIMIT);

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
      // employee_id powers the "is this my shift?" check that gates
      // the CheckInButton on the detail panel.
      employee_id: r.employee_id,
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

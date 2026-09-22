import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ShiftOptionsResponse = {
  properties: {
    id: string;
    name: string;
    client_name: string;
    client_customer_type: string;
    /**
     * Feature-update #12: true when the property's client has the
     * requested weekday in their `recommended_weekdays`. Only present
     * when the route was called with `?date=YYYY-MM-DD` — otherwise
     * every property has this as false and the picker falls back to
     * name-order only.
     */
    recommended_for_day?: boolean;
  }[];
  employees: {
    id: string;
    full_name: string;
    status: string;
    service_type: "priya" | "alltagshilfe" | "both";
    /**
     * Feature-update #14 · Staff-fit score for the currently-selected
     * property. Computed only when the route was called with
     * `?property_id=<uuid>`. Higher = better fit. Components:
     *   +3  availability_status = 'active' (available this week)
     *   +2  service_type matches the property's customer_type (or 'both')
     *   +1 per past shift at this property in the last 30 days (cap +3)
     * Rendered as a chip strip + ★ prefix in PlanShiftDialog; ignored
     * when the field is undefined (no property picked yet).
     */
    staff_fit_score?: number;
  }[];
};

/**
 * GET /api/shifts/options — fetches property + employee picker data
 * for the "Plan shift" modal. RLS keeps results scoped to the org.
 *
 * When `?date=YYYY-MM-DD` is passed, each returned property carries
 * `recommended_for_day` — true if the client has that weekday in
 * their `recommended_weekdays` array (JS Date convention:
 * 0 = Sunday .. 6 = Saturday). The client uses this to surface a
 * "Empfohlen für Montag" chip strip at the top of the picker.
 */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  // Feature-update #14: when a property is picked, we compute a
  // staff-fit score per employee. Validate as a UUID-shape token
  // before spending a query on it — a bad value silently falls back
  // to unscored employees.
  const propertyIdParam = url.searchParams.get("property_id");
  const propertyIdValid =
    propertyIdParam &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      propertyIdParam,
    )
      ? propertyIdParam
      : null;

  let weekdayForDate: number | null = null;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    // Local-time parse for a bare date — same convention the schedule
    // grid uses when it renders weekday headers. `new Date("2026-01-05")`
    // would be UTC-midnight and drift a day for negative-offset zones;
    // splitting explicitly keeps the weekday stable.
    const parts = dateParam.split("-").map(Number);
    if (
      parts.length === 3 &&
      parts.every((n) => Number.isFinite(n))
    ) {
      const [y, mo, d] = parts as [number, number, number];
      const local = new Date(y, mo - 1, d);
      const dow = local.getDay();
      if (dow >= 0 && dow <= 6) weekdayForDate = dow;
    }
  }

  // Extended employee select pulls availability_status so the
  // staff-fit scorer can distinguish "on the roster" from "actually
  // available this week".
  const [propsRes, empsRes, propertyRes, recentShiftsRes] = await Promise.all([
    supabase
      .from("properties")
      .select(
        // Extended embed pulls recommended_weekdays for the flag below.
        `id, name,
         client:clients ( display_name, customer_type, recommended_weekdays )`,
      )
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(500),
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (
      supabase
        .from("employees")
        .select(
          "id, full_name, status, service_type, availability_status",
        ) as any
    )
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name", { ascending: true })
      .limit(500),
    /* eslint-enable @typescript-eslint/no-explicit-any */
    // Only queried when a property is picked — otherwise a resolved
    // Promise so the destructure stays symmetric.
    propertyIdValid
      ? supabase
          .from("properties")
          .select("client:clients ( customer_type )")
          .eq("id", propertyIdValid)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    propertyIdValid
      ? supabase
          .from("shifts")
          .select("employee_id")
          .eq("property_id", propertyIdValid)
          .is("deleted_at", null)
          .not("employee_id", "is", null)
          .gte(
            "starts_at",
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          )
          .limit(500)
      : Promise.resolve({ data: [] }),
  ]);

  type PropRow = {
    id: string;
    name: string;
    client: {
      display_name: string;
      customer_type: string;
      recommended_weekdays: number[] | null;
    } | null;
  };
  const properties = ((propsRes.data ?? []) as unknown as PropRow[]).map((p) => {
    const isRecommended =
      weekdayForDate !== null &&
      (p.client?.recommended_weekdays ?? []).includes(weekdayForDate);
    return {
      id: p.id,
      name: p.name,
      client_name: p.client?.display_name ?? "—",
      client_customer_type: p.client?.customer_type ?? "commercial",
      recommended_for_day: isRecommended,
    };
  });
  // When a date is given, sort recommended properties to the top so
  // the picker naturally shows them first even without a chip strip.
  if (weekdayForDate !== null) {
    properties.sort((a, b) => {
      if (a.recommended_for_day === b.recommended_for_day) return 0;
      return a.recommended_for_day ? -1 : 1;
    });
  }

  // Property → customer_type lookup for the service-line match part of
  // the score. Null when no property was picked (score sits undefined).
  const pickedType =
    ((propertyRes.data as { client: { customer_type: string } | null } | null)
      ?.client?.customer_type ?? null);

  // Recent-shift-count map: employee_id -> assignments in last 30 days
  // at the picked property.
  const recentByEmp = new Map<string, number>();
  if (propertyIdValid) {
    for (const row of ((recentShiftsRes.data ?? []) as Array<{
      employee_id: string | null;
    }>)) {
      if (!row.employee_id) continue;
      recentByEmp.set(
        row.employee_id,
        (recentByEmp.get(row.employee_id) ?? 0) + 1,
      );
    }
  }

  const employees = (
    (empsRes.data ?? []) as Array<{
      id: string;
      full_name: string;
      status: string;
      service_type: "priya" | "alltagshilfe" | "both" | null;
      availability_status: "active" | "inactive" | "on_vacation" | "sick" | null;
    }>
  ).map((e) => {
    const svc = e.service_type ?? "both";
    let score: number | undefined = undefined;
    if (propertyIdValid) {
      // Score components — order matches the type doc comment above.
      const availableNow = (e.availability_status ?? "active") === "active";
      const serviceMatch =
        svc === "both" ||
        (pickedType === "alltagshilfe" ? svc === "alltagshilfe" : svc === "priya");
      const recentCap = Math.min(recentByEmp.get(e.id) ?? 0, 3);
      score = (availableNow ? 3 : 0) + (serviceMatch ? 2 : 0) + recentCap;
    }
    return {
      id: e.id,
      full_name: e.full_name,
      status: e.status,
      service_type: svc,
      ...(score !== undefined ? { staff_fit_score: score } : {}),
    };
  });

  // When a property is picked, surface top-scored employees first so
  // the picker's natural order already reflects the recommendation
  // (chip strip in the dialog adds the visual cue).
  if (propertyIdValid) {
    employees.sort((a, b) => (b.staff_fit_score ?? 0) - (a.staff_fit_score ?? 0));
  }

  const body: ShiftOptionsResponse = { properties, employees };
  return NextResponse.json(body);
}

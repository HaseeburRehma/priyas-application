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

  const dateParam = new URL(request.url).searchParams.get("date");
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

  const [propsRes, empsRes] = await Promise.all([
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("employees").select("id, full_name, status, service_type") as any)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name", { ascending: true })
      .limit(500),
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

  const employees = (
    (empsRes.data ?? []) as Array<{
      id: string;
      full_name: string;
      status: string;
      service_type: "priya" | "alltagshilfe" | "both" | null;
    }>
  ).map((e) => ({
    id: e.id,
    full_name: e.full_name,
    status: e.status,
    service_type: e.service_type ?? "both",
  }));

  const body: ShiftOptionsResponse = { properties, employees };
  return NextResponse.json(body);
}

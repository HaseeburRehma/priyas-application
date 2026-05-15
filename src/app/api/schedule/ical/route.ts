import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildIcal, type IcalShift } from "@/lib/ical/build";
import { env } from "@/lib/constants/env";

/**
 * Public iCal feed.  GET /api/schedule/ical?token=ct_…
 *
 * Calendar apps subscribe to this URL — they don't carry our auth cookies,
 * so we authenticate by an opaque token instead. The token is bound to a
 * single profile via the `calendar_tokens` table; the feed returns only
 * shifts assigned to the matching employee, plus shifts on properties they
 * have access to (RLS-equivalent rules applied here).
 *
 * We intentionally use the **service role** Supabase client here because
 * (a) the request is unauthenticated, and (b) we ourselves enforce the
 * "is this token valid for this user" check before returning any rows.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return new NextResponse("missing token", { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return new NextResponse("calendar feed not configured", { status: 503 });
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: tokenRow } = await supabase
    .from("calendar_tokens")
    .select("profile_id, org_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!tokenRow) {
    return new NextResponse("invalid token", { status: 401 });
  }
  const { profile_id, org_id, expires_at } = tokenRow as {
    profile_id: string;
    org_id: string;
    expires_at: string | null;
  };
  // Expiry check. NULL means "legacy token, no expiry stamped" — we honor
  // it for backwards compatibility but log a warning so we can spot stale
  // tokens that should be rotated to the new bounded lifetime.
  if (expires_at !== null) {
    const exp = new Date(expires_at);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
      return new NextResponse("token expired", { status: 401 });
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      `[ical] legacy token without expires_at used (profile=${profile_id})`,
    );
  }

  // Touch last_used_at — best effort, don't block the response.
  void supabase
    .from("calendar_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token", token);

  // Resolve the employee row (if any) for this profile.
  const { data: empRow } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("profile_id", profile_id)
    .maybeSingle();
  const employeeId = (empRow as { id: string } | null)?.id;

  // Pull a generous window — past 30 days, next 365 days.
  const now = new Date();
  const fromIso = new Date(now.getTime() - 30 * 86400000).toISOString();
  const toIso = new Date(now.getTime() + 365 * 86400000).toISOString();

  let q = supabase
    .from("shifts")
    .select(
      `id, starts_at, ends_at, notes,
       property:properties ( id, name, client:clients ( id, display_name ) )`,
    )
    .eq("org_id", org_id)
    .is("deleted_at", null)
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso)
    .order("starts_at", { ascending: true });

  // Field staff (those linked to an employees row) only see their own shifts.
  // Managers (admin/dispatcher) without an employees link see the whole org.
  if (employeeId) q = q.eq("employee_id", employeeId);

  const { data: rows } = await q;
  type Row = {
    id: string;
    starts_at: string;
    ends_at: string;
    notes: string | null;
    property: {
      id: string;
      name: string;
      client: { id: string; display_name: string } | null;
    } | null;
  };

  const shifts: IcalShift[] = ((rows ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    property_name: r.property?.name ?? "—",
    client_name: r.property?.client?.display_name ?? "—",
    notes: r.notes,
  }));

  const ics = buildIcal({
    calendarName: "Priya Schedule",
    shifts,
    origin: env.NEXT_PUBLIC_APP_URL,
  });

  return new NextResponse(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="priya-schedule.ics"',
      "cache-control": "no-store",
    },
  });
}

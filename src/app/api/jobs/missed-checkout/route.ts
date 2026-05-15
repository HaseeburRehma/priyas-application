import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/constants/env";
import { sendPushToProfile } from "@/lib/push/send";

/**
 * Constant-time string comparison — protects the CRON_SECRET check
 * against timing-side-channel guessing. Plain `===` short-circuits on
 * the first mismatching byte.
 */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Missed-checkout sweep.
 *
 *   POST /api/jobs/missed-checkout
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * Finds shifts whose `ends_at` was more than 30 minutes ago, that had a
 * check-in but no check-out, and emits an in-app + push notification to
 * the assigned field staff. Idempotent — once a notification with the
 * tag `missed_checkout:<shift_id>` exists, we skip.
 *
 * Schedule it via Vercel Cron, GitHub Actions, or any other minute-grade
 * cron — every 15 minutes is plenty.
 */
export const dynamic = "force-dynamic";

const GRACE_MINUTES = 30;

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  if (!safeEqual(auth, `Bearer ${expected}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "service key missing" }, { status: 503 });
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  const cutoff = new Date(Date.now() - GRACE_MINUTES * 60_000).toISOString();
  const recent = new Date(Date.now() - 6 * 3600_000).toISOString();

  const { data: shifts } = await supabase
    .from("shifts")
    .select(
      `id, org_id, employee_id, ends_at, status,
       property:properties ( id, name ),
       employee:employees ( id, profile_id, full_name )`,
    )
    .is("deleted_at", null)
    .neq("status", "completed")
    .lt("ends_at", cutoff)
    .gt("ends_at", recent)
    .order("ends_at", { ascending: false })
    .limit(200);

  type Shift = {
    id: string;
    org_id: string;
    employee_id: string | null;
    ends_at: string;
    status: string;
    property: { id: string; name: string } | null;
    employee: { id: string; profile_id: string | null; full_name: string } | null;
  };
  const list = (shifts ?? []) as unknown as Shift[];

  let sent = 0;
  for (const s of list) {
    if (!s.employee_id || !s.employee?.profile_id) continue;

    // Already checked out? Skip.
    const { data: out } = await supabase
      .from("time_entries")
      .select("id")
      .eq("shift_id", s.id)
      .eq("employee_id", s.employee_id)
      .eq("kind", "check_out")
      .limit(1);
    if ((out ?? []).length > 0) continue;

    // Did they ever check in? If no check-in, no missed check-out either.
    const { data: ins } = await supabase
      .from("time_entries")
      .select("id")
      .eq("shift_id", s.id)
      .eq("employee_id", s.employee_id)
      .eq("kind", "check_in")
      .limit(1);
    if ((ins ?? []).length === 0) continue;

    // Have we already notified this user about THIS shift?
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", s.employee.profile_id)
      .eq("category", "missed_checkin")
      .ilike("link_url", `%shift=${s.id}%`)
      .limit(1);
    if ((existing ?? []).length > 0) continue;

    const title = "Check-out vergessen";
    const body = `${s.property?.name ?? "Schicht"} · endete ${new Date(
      s.ends_at,
    ).toLocaleTimeString()}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("notifications") as any)).insert({
      org_id: s.org_id,
      user_id: s.employee.profile_id,
      channel: "in_app",
      category: "missed_checkin",
      title,
      body,
      link_url: `/schedule?shift=${s.id}`,
    });

    try {
      await sendPushToProfile(s.employee.profile_id, {
        title,
        body,
        url: `/schedule?shift=${s.id}`,
        tag: `missed_checkout:${s.id}`,
      });
    } catch {
      /* best-effort */
    }
    sent += 1;
  }

  return NextResponse.json({
    ok: true,
    candidates: list.length,
    notified: sent,
  });
}

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/constants/env";
import { runAlltagshilfeMonthlyReport } from "@/lib/alltagshilfe/monthly-report-core";

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
 * Monthly Alltagshilfe report — automated version of the "Send to
 * management" button on the Alltagshilfe report page.
 *
 *   POST /api/jobs/alltagshilfe-monthly
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * Runs early on the 1st of the month for the *previous* calendar month
 * (same convention as lexware-monthly), once per organization. Shares
 * the report-building/PDF/CSV/email logic with the manual button via
 * `runAlltagshilfeMonthlyReport` — the only difference is this uses a
 * service-role client (no user session) and `sentByUserId: null`, which
 * both the delivery row and the audit entry record as system-generated.
 *
 * Idempotent per org+period: the unique index on
 * (org, report_type, period) where status='sent' means a re-run after a
 * partial failure only resends orgs that don't already have a 'sent' row.
 *
 * Suggested Vercel cron schedule (UTC): `0 5 1 * *` — after the Lexware
 * monthly job (`0 3 1 * *`) so both don't compete for cold-start resources
 * at exactly the same minute.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "cron not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!safeEqual(auth, `Bearer ${expected}`)) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "service key missing" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  // Previous month — works correctly across year boundaries because
  // JavaScript's Date constructor normalises out-of-range months/days.
  const today = new Date();
  const prev = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
  );
  const year = prev.getUTCFullYear();
  const month = prev.getUTCMonth(); // 0-indexed

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgRows, error: orgErr } = await (supabase.from("organizations") as any).select("id");
  if (orgErr) {
    return NextResponse.json(
      { error: orgErr.message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  const orgIds = ((orgRows ?? []) as Array<{ id: string }>).map((o) => o.id);

  const results = await Promise.all(
    orgIds.map(async (orgId) => {
      const result = await runAlltagshilfeMonthlyReport(
        supabase,
        orgId,
        year,
        month,
        "de",
        null,
      );
      return { orgId, ...result };
    }),
  );

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json(
    { year, month, orgsProcessed: orgIds.length, sent, failed },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

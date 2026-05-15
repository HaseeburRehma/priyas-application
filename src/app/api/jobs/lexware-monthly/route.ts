import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { runMonthlyInvoicesAsService } from "@/lib/lexware/monthly";

/**
 * Constant-time string comparison. Plain `a === b` short-circuits on the
 * first mismatching byte, which leaks the length of the matching prefix
 * to an attacker that can time HTTP responses precisely. Using
 * crypto.timingSafeEqual on equal-length Buffers prevents that.
 */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Monthly Lexware billing sweep.
 *
 *   POST /api/jobs/lexware-monthly
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * Computes the previous calendar month (this cron is scheduled to run early
 * on the 1st), gathers completed shifts per client, drafts an invoice and
 * pushes it to Lexware. Idempotent — the partial unique index on
 * `(client_id, period_year, period_month) WHERE source='auto_monthly'`
 * prevents the same client + month being billed twice.
 *
 * Suggested Vercel cron schedule (UTC): `0 3 1 * *` — 03:00 UTC on the
 * 1st of every month.
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

  // Previous month — works correctly across year boundaries because
  // JavaScript's Date constructor normalises out-of-range months/days.
  const today = new Date();
  const prev = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
  );
  const year = prev.getUTCFullYear();
  const month = prev.getUTCMonth(); // 0-indexed

  const summary = await runMonthlyInvoicesAsService({
    year,
    month,
    dryRun: false,
  });

  return NextResponse.json(
    { year, month, ...summary },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

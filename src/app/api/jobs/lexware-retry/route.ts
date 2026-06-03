import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/constants/env";
import { retryLexwarePushSweep } from "@/lib/lexware/reconcile";

/**
 * Nightly retry sweep for failed Lexware pushes.
 *
 *   POST /api/jobs/lexware-retry
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * Looks for invoices where:
 *   • export_target = 'lexware'
 *   • lexware_id IS NULL  (push never succeeded)
 *   • status in ('sent', 'overdue', 'paid')
 *   • last attempt is either NULL or older than the cooldown (30 min)
 *
 * Re-runs `LexwareExporter.push()` for each candidate, stamping
 * `lexware_last_attempt_at` / `lexware_last_error` so the UI can
 * surface the result on next page load.
 *
 * Wired into vercel.json daily at 03:15 UTC — 15 minutes after the
 * monthly cron (03:00) so we don't trample its concurrent writes.
 */
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  if (!auth.startsWith("Bearer ") || !safeEqual(auth.slice(7), expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 503 },
    );
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 30-min cooldown matches the missed-checkout pattern. 100 invoices
  // per run is the soft cap — the partial index in migration 000040
  // keeps the query cheap even at 6-figure invoice counts.
  const result = await retryLexwarePushSweep(supabase, {
    cooldownMinutes: 30,
    limit: 100,
  });
  return NextResponse.json({ ok: true, ...result });
}

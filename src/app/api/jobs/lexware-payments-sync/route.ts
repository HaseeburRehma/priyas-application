import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/constants/env";
import { pullLexwarePaymentsForAllOrgs } from "@/lib/lexware/reconcile";

/**
 * Nightly payment poll from Lexware → app.
 *
 *   POST /api/jobs/lexware-payments-sync
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * Pulls every paid voucher from Lexware since the org's last successful
 * sync (stored in settings.data.lexware.lastPaymentSyncAt) and inserts
 * matching `invoice_payments` rows. Idempotent: re-running with the
 * same cursor yields zero duplicates thanks to the partial unique index
 * `uniq_inv_pay_lexware_voucher`.
 *
 * Wired into vercel.json daily at 03:30 UTC — 15 minutes after the
 * retry sweep, so a freshly-pushed invoice from the same run can be
 * reconciled on the same night.
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

  const perOrg = await pullLexwarePaymentsForAllOrgs(supabase);
  const totals = Object.values(perOrg).reduce(
    (acc, r) => ({
      pulled: acc.pulled + r.pulled,
      applied: acc.applied + r.applied,
      skipped: acc.skipped + r.skipped,
      errors: acc.errors + r.errors.length,
    }),
    { pulled: 0, applied: 0, skipped: 0, errors: 0 },
  );
  return NextResponse.json({ ok: true, perOrg, totals });
}

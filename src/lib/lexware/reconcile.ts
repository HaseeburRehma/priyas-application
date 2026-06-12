/**
 * Lexware reconciliation primitives.
 *
 * Shared between:
 *   - /api/jobs/lexware-retry (nightly retry sweep)
 *   - /api/jobs/lexware-payments-sync (nightly payment poll)
 *   - manual server actions on the invoice detail page
 *
 * Pure DB orchestration — no permissions, no auth. Callers do that.
 */
import "server-only";
import { createLexwareClient } from "@/lib/integrations/lexware";
import { getLexwareConfig, lexwareListPaidVouchers } from "@/lib/lexware/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ===========================================================================
 * Retry push
 * ========================================================================= */

export type RetryPushResult = {
  invoiceId: string;
  ok: boolean;
  foreignId?: string;
  error?: string;
};

/**
 * Re-attempt the Lexware push for a single invoice. Stamps
 * `lexware_last_attempt_at` + `lexware_attempts` + `lexware_last_error`
 * regardless of outcome so the UI can show progress.
 *
 * Idempotent on success: once `lexware_id` is set the row's
 * `lexware_sync_status` flips to 'synced' and subsequent calls become
 * no-ops.
 */
export async function retryLexwarePushForInvoice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  invoiceId: string,
): Promise<RetryPushResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invRow } = await ((supabase.from("invoices") as any))
    .select(
      `id, invoice_number, invoice_kind, issue_date, due_date,
       total_cents, subtotal_cents, tax_cents, notes, pdf_path,
       export_target, lexware_id, lexware_attempts,
       client:clients (
         id, display_name, contact_name, email, billing_email, phone, tax_id,
         customer_type, insurance_provider, insurance_number, service_code,
         lexware_contact_id
       ),
       items:invoice_items ( description, quantity, unit_price_cents, tax_rate )`,
    )
    .eq("id", invoiceId)
    .maybeSingle();
  type Row = {
    id: string;
    invoice_number: string;
    invoice_kind: "regular" | "alltagshilfe";
    issue_date: string;
    due_date: string | null;
    total_cents: number | null;
    subtotal_cents: number | null;
    tax_cents: number | null;
    notes: string | null;
    pdf_path: string | null;
    export_target: "internal" | "lexware";
    lexware_id: string | null;
    lexware_attempts: number;
    client: {
      id: string;
      display_name: string;
      contact_name: string | null;
      email: string | null;
      billing_email: string | null;
      phone: string | null;
      tax_id: string | null;
      customer_type: "residential" | "commercial" | "alltagshilfe";
      insurance_provider: string | null;
      insurance_number: string | null;
      service_code: string | null;
      lexware_contact_id: string | null;
    } | null;
    items: Array<{
      description: string;
      quantity: number;
      unit_price_cents: number;
      tax_rate: number;
    }>;
  };
  const inv = invRow as Row | null;
  if (!inv) return { invoiceId, ok: false, error: "invoice_not_found" };
  if (inv.lexware_id) {
    // Already synced — nothing to do, but mark the chip 'synced' just in
    // case migration backfill missed this row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("invoices") as any))
      .update({ lexware_sync_status: "synced" })
      .eq("id", inv.id);
    return { invoiceId, ok: true, foreignId: inv.lexware_id };
  }
  if (inv.export_target !== "lexware" || !inv.client) {
    return { invoiceId, ok: false, error: "not_eligible" };
  }

  const nowIso = new Date().toISOString();
  const lex = createLexwareClient();
  try {
    const result = await lex.pushInvoice({
      invoiceNumber: inv.invoice_number,
      issueDate: inv.issue_date,
      dueDate: inv.due_date,
      notes: inv.notes,
      customerEmail: inv.client.billing_email ?? inv.client.email,
      totalCents: Number(inv.total_cents ?? 0),
      pdfUrl: inv.pdf_path,
      client: {
        display_name: inv.client.display_name,
        contact_name: inv.client.contact_name,
        email: inv.client.billing_email ?? inv.client.email,
        phone: inv.client.phone,
        tax_id: inv.client.tax_id,
        customer_type: inv.client.customer_type,
        lexware_contact_id: inv.client.lexware_contact_id,
      },
      items: (inv.items ?? []).map((it) => ({
        description: it.description,
        quantity: Number(it.quantity),
        unit_price_cents: Number(it.unit_price_cents),
        tax_rate_percent: Number(it.tax_rate),
      })),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("invoices") as any))
      .update({
        lexware_id: result.id,
        lexware_sync_status: "synced",
        lexware_last_attempt_at: nowIso,
        lexware_last_error: null,
        lexware_attempts: inv.lexware_attempts + 1,
      })
      .eq("id", inv.id);
    if (result.contactId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ((supabase.from("clients") as any))
        .update({ lexware_contact_id: result.contactId })
        .eq("id", inv.client.id);
    }
    return { invoiceId, ok: true, foreignId: result.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "lexware_push_failed";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("invoices") as any))
      .update({
        lexware_sync_status: "failed",
        lexware_last_attempt_at: nowIso,
        lexware_last_error: msg.slice(0, 500),
        lexware_attempts: inv.lexware_attempts + 1,
      })
      .eq("id", inv.id);
    return { invoiceId, ok: false, error: msg };
  }
}

/**
 * Sweep retry — pulls every invoice that's eligible (export_target=lexware,
 * lexware_id IS NULL, status sent/overdue/paid) and whose last attempt is
 * older than `cooldownMinutes`. Default cooldown of 30 min keeps the
 * cron from hammering Lexware in tight loops when their API is down.
 */
export async function retryLexwarePushSweep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  opts: { cooldownMinutes?: number; limit?: number } = {},
): Promise<{ attempted: number; succeeded: number; failed: number }> {
  const cooldown = opts.cooldownMinutes ?? 30;
  const limit = opts.limit ?? 100;
  const cutoff = new Date(Date.now() - cooldown * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await ((supabase.from("invoices") as any))
    .select("id")
    .is("deleted_at", null)
    .is("lexware_id", null)
    .eq("export_target", "lexware")
    .in("status", ["sent", "overdue", "paid"])
    .or(`lexware_last_attempt_at.is.null,lexware_last_attempt_at.lt.${cutoff}`)
    .limit(limit);
  const candidates = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);

  let succeeded = 0;
  let failed = 0;
  for (const id of candidates) {
    const r = await retryLexwarePushForInvoice(supabase, id);
    if (r.ok) succeeded += 1;
    else failed += 1;
  }
  return { attempted: candidates.length, succeeded, failed };
}

/* ===========================================================================
 * Payment poll
 * ========================================================================= */

export type PaymentSyncResult = {
  pulled: number;
  applied: number;
  skipped: number;
  errors: string[];
};

/**
 * Pull paid vouchers from Lexware since the org's last successful sync,
 * insert any new payments into `invoice_payments` (deduped by
 * `lexware_voucher_id`), and update the source invoice's
 * `paid_amount_cents` + status.
 *
 * Idempotent: re-running with the same cursor produces no duplicate rows
 * because of `uniq_inv_pay_lexware_voucher`.
 */
export async function pullLexwarePaymentsForOrg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  orgId: string,
): Promise<PaymentSyncResult> {
  const result: PaymentSyncResult = {
    pulled: 0,
    applied: 0,
    skipped: 0,
    errors: [],
  };

  const cfg = getLexwareConfig();
  if (!cfg) {
    result.errors.push("Lexware not configured");
    return result;
  }

  // Resolve the last-sync cursor from settings.data.lexware.lastPaymentSyncAt.
  // First run defaults to 30 days ago — enough to bootstrap without flooding.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settingsRow } = await ((supabase.from("settings") as any))
    .select("data")
    .eq("org_id", orgId)
    .maybeSingle();
  type SettingsData = {
    data: { lexware?: { lastPaymentSyncAt?: string } } | null;
  };
  const sinceIso =
    (settingsRow as SettingsData | null)?.data?.lexware?.lastPaymentSyncAt ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let paid: Awaited<ReturnType<typeof lexwareListPaidVouchers>>;
  try {
    paid = await lexwareListPaidVouchers(cfg, sinceIso);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "lex_list_failed");
    return result;
  }
  result.pulled = paid.length;

  for (const v of paid) {
    // Match by our `lexware_id` (foreign voucher id we cached when pushing).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invRow } = await ((supabase.from("invoices") as any))
      .select("id, org_id, total_cents, paid_amount_cents, status")
      .eq("lexware_id", v.voucherId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    const inv = invRow as
      | {
          id: string;
          org_id: string;
          total_cents: number;
          paid_amount_cents: number;
          status: string;
        }
      | null;
    if (!inv) {
      result.skipped += 1;
      continue;
    }

    // Dedup: if we've already inserted a payment row for this voucher,
    // skip. The unique index would reject the insert anyway, but checking
    // up-front avoids a wasted round-trip.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingPay } = await ((supabase.from("invoice_payments") as any))
      .select("id")
      .eq("lexware_voucher_id", v.voucherId)
      .maybeSingle();
    if (existingPay) {
      result.skipped += 1;
      continue;
    }

    // Insert a payment row covering whatever's still outstanding on our
    // side, capped at the invoice total. If Lexware reports a smaller
    // amount than what's outstanding, we trust Lexware and only book
    // that partial.
    const outstanding = Math.max(0, inv.total_cents - inv.paid_amount_cents);
    const toApply = Math.min(outstanding, v.totalCents);
    if (toApply <= 0) {
      result.skipped += 1;
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: payErr } = await ((supabase.from("invoice_payments") as any))
      .insert({
        org_id: orgId,
        invoice_id: inv.id,
        amount_cents: toApply,
        paid_at: v.paidAt,
        method: v.paymentMethod ?? "lexware",
        reference: v.voucherNumber || null,
        notes: `Auto-imported from Lexware voucher ${v.voucherId}`,
        lexware_voucher_id: v.voucherId,
      });
    if (payErr) {
      // Most likely the unique-index trip if a parallel run beat us to
      // it. Treat that as a skip, not an error.
      const msg = payErr.message ?? "";
      if (msg.includes("duplicate key value")) {
        result.skipped += 1;
        continue;
      }
      result.errors.push(`insert ${v.voucherId}: ${msg}`);
      continue;
    }

    const newPaid = inv.paid_amount_cents + toApply;
    const fullyPaid = newPaid >= inv.total_cents;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("invoices") as any))
      .update({
        paid_amount_cents: newPaid,
        status: fullyPaid ? "paid" : inv.status,
        paid_at: fullyPaid ? v.paidAt : null,
      })
      .eq("id", inv.id);
    result.applied += 1;
  }

  // Advance the cursor only on a clean run; if any error happened we'll
  // pull the same window again next time, which is safe due to the
  // dedup index.
  if (result.errors.length === 0) {
    const data =
      (settingsRow as SettingsData | null)?.data ?? ({} as Record<string, unknown>);
    const merged = {
      ...data,
      lexware: {
        ...((data as { lexware?: object }).lexware ?? {}),
        lastPaymentSyncAt: new Date().toISOString(),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("settings") as any))
      .upsert({ org_id: orgId, data: merged }, { onConflict: "org_id" });
  }

  return result;
}

/**
 * Iterate over every org and pull payments. The cron handler invokes
 * this once per run; per-invoice manual sync can call
 * `pullLexwarePaymentsForOrg` with a specific orgId.
 */
export async function pullLexwarePaymentsForAllOrgs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
): Promise<Record<string, PaymentSyncResult>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgs } = await ((supabase.from("organizations") as any))
    .select("id");
  const out: Record<string, PaymentSyncResult> = {};
  for (const o of ((orgs ?? []) as Array<{ id: string }>)) {
    out[o.id] = await pullLexwarePaymentsForOrg(supabase, o.id);
  }
  return out;
}

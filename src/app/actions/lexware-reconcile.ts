"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PermissionError, requirePermission, getCurrentRole } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import {
  pullLexwarePaymentsForOrg,
  retryLexwarePushForInvoice,
} from "@/lib/lexware/reconcile";
import { getCachedUser } from "@/lib/api/current-user";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function audit(action: string, recordId: string, message: string) {
  const supabase = await createSupabaseServerClient();
  const user = await getCachedUser();
  if (!user) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile as { org_id: string | null } | null)?.org_id;
  if (!orgId) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("audit_log") as any)).insert({
    org_id: orgId,
    user_id: user.id,
    action,
    table_name: "invoices",
    record_id: recordId,
    after: { message, meta: "via WebApp" },
  });
}

/**
 * Manual "retry Lexware sync" — same logic as the nightly cron, but
 * scoped to a single invoice and gated on `invoice.lexware_sync`.
 */
export async function retrySyncInvoiceAction(
  invoiceId: string,
): Promise<
  ActionResult<{
    /** Per-retry outcome; false means the push failed again. */
    pushed: boolean;
    foreignId?: string;
    pushError?: string;
  }>
> {
  try {
    await requirePermission("invoice.lexware_sync");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const { rateLimit } = await import("@/lib/rate-limit/guard");
  const rl = await rateLimit("heavy", "invoice.lexware_sync");
  if (rl) return { ok: false, error: rl };

  const supabase = await createSupabaseServerClient();
  const result = await retryLexwarePushForInvoice(supabase, invoiceId);
  await audit(
    "lexware_retry",
    invoiceId,
    result.ok
      ? `Lexware-Push erfolgreich (ID ${result.foreignId}).`
      : `Lexware-Push fehlgeschlagen: ${result.error}`,
  );
  revalidatePath(routes.invoice(invoiceId));
  revalidatePath(routes.invoices);
  return {
    ok: true,
    data: {
      pushed: result.ok,
      foreignId: result.foreignId,
      pushError: result.ok ? undefined : result.error,
    },
  };
}

/**
 * Bulk retry — runs the same per-invoice push for every invoice in the
 * caller's org that is either `failed` or `pending` and has been idle
 * for at least 30 minutes (same cooldown the nightly cron uses).
 *
 * Returns aggregate counts so the UI can toast a summary like
 * "Pushed 4 · 1 failed".
 */
export async function bulkRetrySyncAction(): Promise<
  ActionResult<{ attempted: number; pushed: number; failed: number; errors: string[] }>
> {
  try {
    await requirePermission("invoice.lexware_sync");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const { rateLimit } = await import("@/lib/rate-limit/guard");
  const rl = await rateLimit("heavy", "invoice.lexware_sync");
  if (rl) return { ok: false, error: rl };

  const { orgId } = await getCurrentRole();
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  const supabase = await createSupabaseServerClient();
  // Candidate rows: same shape the partial index targets — pending or
  // failed, not yet synced, and either never tried or last-tried > 30
  // min ago. We don't enforce the cooldown here because the manual
  // button is the user's explicit "try now" — they know the cost.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await ((supabase.from("invoices") as any))
    .select("id")
    .eq("org_id", orgId)
    .in("lexware_sync_status", ["failed", "pending"])
    .is("lexware_id", null)
    .in("status", ["sent", "overdue", "paid"])
    .limit(50);
  if (error) return { ok: false, error: error.message };
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);

  let pushed = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const r = await retryLexwarePushForInvoice(supabase, id);
    if (r.ok) {
      pushed++;
    } else {
      failed++;
      errors.push(`${id.slice(0, 8)}: ${r.error}`);
    }
  }
  await audit(
    "lexware_bulk_retry",
    orgId,
    `Lexware-Bulk-Retry: ${pushed} gepusht / ${failed} fehlgeschlagen.`,
  );
  revalidatePath(routes.invoices);
  return { ok: true, data: { attempted: ids.length, pushed, failed, errors } };
}

/**
 * Manual "pull payments from Lexware" — runs the same delta-poll the
 * nightly cron does, restricted to the caller's org.
 */
export async function pullPaymentsAction(): Promise<
  ActionResult<{ pulled: number; applied: number; skipped: number; errors: string[] }>
> {
  try {
    await requirePermission("invoice.lexware_sync");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "Forbidden",
    };
  }
  const { rateLimit } = await import("@/lib/rate-limit/guard");
  const rl = await rateLimit("heavy", "invoice.lexware_sync");
  if (rl) return { ok: false, error: rl };

  const { orgId } = await getCurrentRole();
  if (!orgId) return { ok: false, error: "Profile not attached to org" };

  const supabase = await createSupabaseServerClient();
  const result = await pullLexwarePaymentsForOrg(supabase, orgId);
  // No per-invoice audit row — the action affects N invoices; log a
  // single summary entry instead.
  await audit(
    "lexware_payments_pull",
    orgId,
    `Lexware-Zahlungssync: ${result.applied} verbucht / ${result.skipped} übersprungen / ${result.errors.length} Fehler.`,
  );
  revalidatePath(routes.invoices);
  return { ok: true, data: result };
}

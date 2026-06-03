"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PermissionError, requirePermission, getCurrentRole } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import {
  pullLexwarePaymentsForOrg,
  retryLexwarePushForInvoice,
} from "@/lib/lexware/reconcile";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function audit(action: string, recordId: string, message: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

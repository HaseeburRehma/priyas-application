"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { routes } from "@/lib/constants/routes";
import {
  runMonthlyInvoices,
  type GenerateMonthlyArgs,
  type GenerateMonthlyResult,
  type LastRunSummary,
} from "@/lib/lexware/monthly";

/**
 * Admin / UI entry-point for the monthly Lexware billing run.
 *
 * The heavy lifting lives in `@/lib/lexware/monthly` so the cron route can
 * call it without going through a server-action import.
 */
export async function generateMonthlyInvoicesAction(
  args: GenerateMonthlyArgs,
): Promise<GenerateMonthlyResult> {
  try {
    await requirePermission("invoice.create");
  } catch (err) {
    return {
      ok: false,
      generated: 0,
      skipped: 0,
      errors: [
        {
          clientId: "",
          clientName: "—",
          reason:
            err instanceof PermissionError ? err.message : "forbidden",
        },
      ],
      totalEur: 0,
    };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const result = await runMonthlyInvoices(
    supabase as unknown as SupabaseClient,
    args,
    user?.id ?? null,
  );
  if (!args.dryRun) revalidatePath(routes.invoices);
  return result;
}

/* ---------------------------------------------------------------------------
 * Read the last run from audit_log — used by the admin panel.
 * ------------------------------------------------------------------------- */

export async function loadLastMonthlyRun(): Promise<LastRunSummary> {
  try {
    await requirePermission("invoice.create");
  } catch {
    return null;
  }
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase.from("audit_log") as any))
    .select("after, created_at")
    .eq("action", "lexware_monthly_generate")
    .is("record_id", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const list = (data ?? []) as Array<{
    after: { meta?: Record<string, unknown> } | null;
    created_at: string;
  }>;
  const row = list[0];
  if (!row || !row.after?.meta) return null;
  const meta = row.after.meta as Record<string, unknown>;
  return {
    at: row.created_at,
    dryRun: Boolean(meta.dry_run),
    generated: Number(meta.generated ?? 0),
    skipped: Number(meta.skipped ?? 0),
    errorsCount: Number(meta.errors_count ?? 0),
    totalCents: Number(meta.total_cents ?? 0),
    year: Number(meta.year ?? 0),
    month: Number(meta.month ?? 0),
  };
}

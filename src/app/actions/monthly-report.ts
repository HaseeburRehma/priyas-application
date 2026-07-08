"use server";

/**
 * "Send to management" — emails the current Alltagshilfe monthly report
 * to the configured management address with both PDF and CSV attached.
 *
 * RBAC + session/org resolution live here; the actual report-building,
 * PDF/CSV rendering, email send, and delivery tracking are shared with
 * the automated end-of-month cron (`/api/jobs/alltagshilfe-monthly`)
 * via `runAlltagshilfeMonthlyReport` — see that file for the full flow.
 *
 * Locale handling: the action runs server-side via next-intl's
 * `getLocale()` so the email language matches whatever the sender is
 * using in the UI. The cron path has no request/session, so it defaults
 * to "de" there instead.
 */

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import {
  runAlltagshilfeMonthlyReport,
  type MonthlyReportResult,
} from "@/lib/alltagshilfe/monthly-report-core";
import { routes } from "@/lib/constants/routes";
import { asAppLocale } from "@/lib/utils/i18n-format";

type ActionResult = MonthlyReportResult;

export async function sendMonthlyReportToManagementAction(args: {
  year: number;
  month: number; // 0–11
}): Promise<ActionResult> {
  try {
    await requirePermission("report.alltagshilfe.export");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "forbidden",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId =
    (profile as { org_id: string | null } | null)?.org_id ?? null;
  if (!orgId) return { ok: false, error: "no_org" };

  const locale = asAppLocale(await getLocale());
  const result = await runAlltagshilfeMonthlyReport(
    supabase,
    orgId,
    args.year,
    args.month,
    locale,
    user.id,
  );

  if (result.ok) revalidatePath(routes.alltagshilfeReport);
  return result;
}

/**
 * Re-fire the email for a period that already has a delivery row.
 * Same wire format as the first send; the unique index on (org, type,
 * period) where status='sent' lets us replay even after a successful
 * send because the previous row keeps its 'sent' status — the new row
 * lands as 'queued' → 'sent' and the index sees only one final.
 *
 * Actually that's a constraint violation: we'd have two 'sent' rows
 * for the same (org, type, period). To avoid that we first demote the
 * previous 'sent' row to 'manual_skipped' so the new one can take its
 * place. The audit chain stays intact because we never delete.
 */
export async function resendMonthlyReportAction(args: {
  year: number;
  month: number;
}): Promise<ActionResult> {
  try {
    await requirePermission("report.alltagshilfe.export");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof PermissionError ? err.message : "forbidden",
    };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await ((supabase.from("profiles") as any))
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId =
    (profile as { org_id: string | null } | null)?.org_id ?? null;
  if (!orgId) return { ok: false, error: "no_org" };

  // Demote any prior 'sent' row for this period so the unique partial
  // index doesn't reject the new send.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("monthly_report_deliveries") as any))
    .update({ status: "manual_skipped" })
    .eq("org_id", orgId)
    .eq("report_type", "alltagshilfe")
    .eq("period_year", args.year)
    .eq("period_month", args.month)
    .eq("status", "sent");

  return sendMonthlyReportToManagementAction(args);
}

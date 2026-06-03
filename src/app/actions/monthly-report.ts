"use server";

/**
 * "Send to management" — emails the current Alltagshilfe monthly report
 * to the configured management address with both PDF and CSV attached.
 *
 * Flow:
 *   1. RBAC gate (report.alltagshilfe.export).
 *   2. Build the report payload via loadAlltagshilfeMonthly.
 *   3. Insert a 'queued' delivery row up-front so a network-timeout
 *      retry won't double-send. The unique index on
 *      (org, type, period) where status='sent' guarantees idempotency.
 *   4. Render PDF + CSV, base64-encode for the email API.
 *   5. POST to Resend.
 *   6. Patch the delivery row → 'sent' on success, 'failed' otherwise.
 *
 * Locale handling: the action runs server-side via next-intl's
 * `getLocale()` / `getTranslations()` so the email language matches
 * whatever the sender is using in the UI.
 */

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PermissionError,
  requirePermission,
} from "@/lib/rbac/permissions";
import { loadAlltagshilfeMonthly } from "@/lib/api/alltagshilfe";
import { renderAlltagshilfePdf } from "@/lib/pdf/alltagshilfe-pdf";
import { renderMonthlyReportEmailHtml } from "@/lib/email/monthly-report";
import { sendEmail } from "@/lib/email/resend";
import { routes } from "@/lib/constants/routes";
import {
  asAppLocale,
  formatCurrencyCents,
  formatPattern,
} from "@/lib/utils/i18n-format";

type ActionResult =
  | { ok: true; deliveryId: string; recipient: string; emailId: string }
  | { ok: false; error: string };

/**
 * Resolves the recipient address: settings.management_email on the
 * organization record first, then `MANAGEMENT_EMAIL` env, then a sane
 * fallback that surfaces in the error so the user can act on it.
 */
async function resolveRecipient(orgId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await ((supabase.from("organizations") as any))
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  const fromSettings = (
    data as { settings: { management_email?: string } | null } | null
  )?.settings?.management_email?.trim();
  if (fromSettings) return fromSettings;
  const fromEnv = process.env.MANAGEMENT_EMAIL?.trim();
  if (fromEnv) return fromEnv;
  return null;
}

/**
 * Build a CSV of (client, employee, visits, hours, amount). RFC 4180
 * quoting + formula-injection guard for the spreadsheet that will
 * eventually open this. Mirrors the logic in the export route so the
 * file we *attach* matches the file management would download
 * manually from the page.
 */
function buildCsv(
  rows: Awaited<ReturnType<typeof loadAlltagshilfeMonthly>>["rows"],
): string {
  const esc = (s: string): string => {
    let out = s;
    if (out.length > 0 && /^[=+\-@\t\r]/.test(out)) {
      out = `'${out}`;
    }
    if (/[",\n\r]/.test(out)) {
      out = `"${out.replace(/"/g, '""')}"`;
    }
    return out;
  };
  const lines: string[] = [
    "client,address,insurance,employee,visits,hours,rate_eur,amount_eur",
  ];
  for (const r of rows) {
    for (const e of r.staff) {
      lines.push(
        [
          esc(r.client.name),
          esc(r.client.address),
          esc(r.client.insurance),
          esc(e.name),
          String(e.visits),
          e.hours.toFixed(2),
          (e.rateCents / 100).toFixed(2),
          (e.amountCents / 100).toFixed(2),
        ].join(","),
      );
    }
  }
  return lines.join("\n");
}

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

  const recipient = await resolveRecipient(orgId);
  if (!recipient) {
    return {
      ok: false,
      error:
        "Keine Management-E-Mail hinterlegt. Bitte unter Einstellungen → Allgemein eintragen.",
    };
  }

  const locale = asAppLocale(await getLocale());
  const t = await getTranslations("monthlyReportEmail");
  const report = await loadAlltagshilfeMonthly(args.year, args.month, locale);

  const periodLabel = formatPattern(
    new Date(args.year, args.month, 1),
    "LLLL yyyy",
    locale,
  );
  const totalHoursLabel = `${report.summary.totalHours.toFixed(1)} h`;
  const totalAmountLabel = formatCurrencyCents(
    report.summary.amountCents,
    locale,
  );

  // ---- Insert queued delivery row up front (idempotency hook) ----
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deliveriesTable = supabase.from("monthly_report_deliveries") as any;
  const { data: deliveryRow, error: insertErr } = await deliveriesTable
    .insert({
      org_id: orgId,
      report_type: "alltagshilfe",
      period_year: args.year,
      period_month: args.month,
      status: "queued",
      recipient,
      format: "PDF · CSV",
      total_hours: report.summary.totalHours,
      total_amount_cents: report.summary.amountCents,
      customers_count: report.summary.activeClients,
      staff_count: report.summary.involvedStaff,
      sent_by: user.id,
    })
    .select("id")
    .single();
  if (insertErr || !deliveryRow) {
    return {
      ok: false,
      error: insertErr?.message ?? "delivery_insert_failed",
    };
  }
  const deliveryId = (deliveryRow as { id: string }).id;

  // ---- Build attachments ----
  // Look up the org name once so the PDF header carries the same
  // wordmark the recipient sees in the email signature.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgRow } = await ((supabase.from("organizations") as any))
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  const orgName =
    (orgRow as { name: string | null } | null)?.name ??
    "Priya's Reinigungsservice";

  let pdfBase64: string;
  try {
    const pdfBytes = await renderAlltagshilfePdf(report, { name: orgName });
    pdfBase64 = Buffer.from(pdfBytes).toString("base64");
  } catch (err) {
    await markFailed(
      orgId,
      deliveryId,
      `pdf_render_failed: ${stringifyErr(err)}`,
    );
    return { ok: false, error: "PDF konnte nicht erzeugt werden." };
  }

  const csvText = buildCsv(report.rows);
  const csvBase64 = Buffer.from(csvText, "utf-8").toString("base64");

  // ---- Render email body + send ----
  const html = renderMonthlyReportEmailHtml({
    periodLabel,
    totalHoursLabel,
    totalAmountLabel,
    customersCount: report.summary.activeClients,
    staffCount: report.summary.involvedStaff,
    copy: {
      subject: t("subject", { period: periodLabel }),
      greeting: t("greeting"),
      intro: t("intro"),
      statsLabel: t("statsLabel"),
      hoursLabel: t("hoursLabel"),
      customersLabel: t("customersLabel"),
      staffLabel: t("staffLabel"),
      amountLabel: t("amountLabel"),
      attachmentsLine: t("attachmentsLine"),
      nextActionTitle: t("nextActionTitle"),
      nextActionBody: t("nextActionBody"),
      closing: t("closing"),
      signature: t("signature"),
      footerNote: t("footerNote"),
    },
  });

  const slugDate = `${args.year}-${String(args.month + 1).padStart(2, "0")}`;
  const sendRes = await sendEmail({
    to: recipient,
    subject: t("subject", { period: periodLabel }),
    html,
    attachments: [
      {
        filename: `alltagshilfe-${slugDate}.pdf`,
        content: pdfBase64,
        contentType: "application/pdf",
      },
      {
        filename: `alltagshilfe-${slugDate}.csv`,
        content: csvBase64,
        contentType: "text/csv",
      },
    ],
  });

  if (!sendRes.ok) {
    await markFailed(orgId, deliveryId, sendRes.error);
    return { ok: false, error: sendRes.error };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("monthly_report_deliveries") as any))
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      email_provider_id: sendRes.id,
    })
    .eq("id", deliveryId);

  // Audit (non-blocking).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void ((supabase.from("audit_log") as any)).insert({
    org_id: orgId,
    user_id: user.id,
    action: "monthly_report.sent",
    table_name: "monthly_report_deliveries",
    record_id: deliveryId,
    after: {
      report_type: "alltagshilfe",
      period: { year: args.year, month: args.month },
      recipient,
      provider_id: sendRes.id,
    },
  });

  revalidatePath(routes.alltagshilfeReport);
  return {
    ok: true,
    deliveryId,
    recipient,
    emailId: sendRes.id,
  };
}

async function markFailed(
  orgId: string,
  deliveryId: string,
  message: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("monthly_report_deliveries") as any))
    .update({
      status: "failed",
      error_message: message.slice(0, 500),
    })
    .eq("id", deliveryId)
    .eq("org_id", orgId);
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
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

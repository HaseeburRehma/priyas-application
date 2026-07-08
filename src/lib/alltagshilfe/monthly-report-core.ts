import "server-only";
import { getTranslations } from "next-intl/server";
import { loadAlltagshilfeMonthly } from "@/lib/api/alltagshilfe";
import { renderAlltagshilfePdf } from "@/lib/pdf/alltagshilfe-pdf";
import { renderMonthlyReportEmailHtml } from "@/lib/email/monthly-report";
import { sendEmail } from "@/lib/email/resend";
import { formatCurrencyCents, formatPattern } from "@/lib/utils/i18n-format";

export type MonthlyReportResult =
  | { ok: true; deliveryId: string; recipient: string; emailId: string }
  | { ok: false; error: string };

/**
 * Resolves the recipient address: settings.management_email on the
 * organization record first, then `MANAGEMENT_EMAIL` env, then null so
 * the caller can decide how to surface the missing-config error.
 */
async function resolveRecipient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
): Promise<string | null> {
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

async function markFailed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  deliveryId: string,
  message: string,
): Promise<void> {
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
 * Shared core behind both the manual "Send to management" button
 * (`sendMonthlyReportToManagementAction`) and the automated end-of-month
 * cron (`/api/jobs/alltagshilfe-monthly`). Takes an already-resolved
 * `supabase` client, `orgId`, and `locale` — the caller is responsible
 * for RBAC (manual path) or none at all (service-role cron path), and
 * for picking the client (session-scoped vs. service-role).
 *
 * `sentByUserId` is null for the automated cron run — the delivery row
 * and audit entry both accept a null actor to mean "system-generated".
 */
export async function runAlltagshilfeMonthlyReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  year: number,
  month: number, // 0–11
  locale: "de" | "en" | "ta",
  sentByUserId: string | null,
): Promise<MonthlyReportResult> {
  const recipient = await resolveRecipient(supabase, orgId);
  if (!recipient) {
    return {
      ok: false,
      error:
        "Keine Management-E-Mail hinterlegt. Bitte unter Einstellungen → Allgemein eintragen.",
    };
  }

  const t = await getTranslations({ locale, namespace: "monthlyReportEmail" });
  const report = await loadAlltagshilfeMonthly(year, month, locale, {
    supabase,
    orgId,
  });

  const periodLabel = formatPattern(
    new Date(year, month, 1),
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
      period_year: year,
      period_month: month,
      status: "queued",
      recipient,
      format: "PDF · CSV",
      total_hours: report.summary.totalHours,
      total_amount_cents: report.summary.amountCents,
      customers_count: report.summary.activeClients,
      staff_count: report.summary.involvedStaff,
      sent_by: sentByUserId,
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
      supabase,
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

  const slugDate = `${year}-${String(month + 1).padStart(2, "0")}`;
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
    await markFailed(supabase, orgId, deliveryId, sendRes.error);
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
    user_id: sentByUserId,
    action: "monthly_report.sent",
    table_name: "monthly_report_deliveries",
    record_id: deliveryId,
    after: {
      report_type: "alltagshilfe",
      period: { year, month },
      recipient,
      provider_id: sendRes.id,
      source: sentByUserId ? "manual" : "auto_monthly",
    },
  });

  return {
    ok: true,
    deliveryId,
    recipient,
    emailId: sendRes.id,
  };
}

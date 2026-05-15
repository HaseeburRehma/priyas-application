/**
 * Send an invoice to the client by email with the PDF attached.
 *
 * The email body is in German, branded simply, and includes the invoice
 * number, total, due date and a one-paragraph payment note. The PDF is
 * fetched from Supabase Storage as base64 and attached.
 */
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadInvoiceDetail } from "@/lib/api/invoices";
import { renderAndStoreInvoicePdf, getInvoicePdfSignedUrl } from "@/lib/pdf/invoice-pdf-store";
import { formatDateDE, formatEUR } from "@/lib/billing/money";
import { sendEmail } from "./resend";

const BUCKET = "invoices-pdf";

export type QueueInvoiceEmailResult =
  | { ok: true; emailId: string; recipient: string }
  | { ok: false; error: string };

export async function queueInvoiceEmail(invoiceId: string): Promise<QueueInvoiceEmailResult> {
  const invoice = await loadInvoiceDetail(invoiceId);
  if (!invoice) return { ok: false, error: "invoice_not_found" };

  const recipient =
    invoice.client.billing_email?.trim() || invoice.client.email?.trim() || "";
  if (!recipient) {
    return { ok: false, error: "Kunde hat keine E-Mail-Adresse hinterlegt." };
  }

  // Ensure a PDF exists.
  let pdfPath = invoice.pdf_path;
  if (!pdfPath) {
    pdfPath = await renderAndStoreInvoicePdf(invoice.id);
  }

  // Fetch the PDF as base64.
  const supabase = await createSupabaseServerClient();
  let attachmentBase64: string | null = null;
  try {
    const { data } = await supabase.storage.from(BUCKET).download(pdfPath);
    if (data) {
      const buf = Buffer.from(await data.arrayBuffer());
      attachmentBase64 = buf.toString("base64");
    }
  } catch {
    // If storage download fails we still send the email with a link.
  }
  const signedUrl = await getInvoicePdfSignedUrl(pdfPath, 60 * 60 * 24 * 7).catch(
    () => null,
  );

  const isAH = invoice.invoice_kind === "alltagshilfe";
  const subject = `Rechnung ${invoice.invoice_number} – Priya's Reinigungsservice`;
  const html = renderEmailHtml({
    invoiceNumber: invoice.invoice_number,
    customerName: invoice.client.display_name,
    isAlltagshilfe: isAH,
    totalLabel: formatEUR(invoice.total_cents),
    dueDateLabel: formatDateDE(invoice.due_date),
    issueDateLabel: formatDateDE(invoice.issue_date),
    pdfLink: signedUrl,
  });

  // Flip status → queued before the network call so a retry won't double-send.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("invoices") as any))
    .update({ email_status: "queued", email_recipient: recipient })
    .eq("id", invoice.id);

  const res = await sendEmail({
    to: recipient,
    subject,
    html,
    attachments: attachmentBase64
      ? [
          {
            filename: `${invoice.invoice_number}.pdf`,
            content: attachmentBase64,
            contentType: "application/pdf",
          },
        ]
      : undefined,
  });
  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ((supabase.from("invoices") as any))
      .update({
        email_status: "failed",
        email_last_event_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
    return { ok: false, error: res.error };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ((supabase.from("invoices") as any))
    .update({
      email_status: "sent",
      email_sent_at: new Date().toISOString(),
      email_last_event_at: new Date().toISOString(),
      email_provider_id: res.id,
    })
    .eq("id", invoice.id);

  return { ok: true, emailId: res.id, recipient };
}

function renderEmailHtml(args: {
  invoiceNumber: string;
  customerName: string;
  isAlltagshilfe: boolean;
  totalLabel: string;
  dueDateLabel: string;
  issueDateLabel: string;
  pdfLink: string | null;
}): string {
  const linkBlock = args.pdfLink
    ? `<p style="margin:16px 0"><a href="${args.pdfLink}" style="color:#1f6f96;font-weight:600">Rechnung als PDF öffnen</a></p>`
    : "";
  const ahBlock = args.isAlltagshilfe
    ? `<p style="font-size:13px;color:#555">Bitte reichen Sie diese Rechnung wie gewohnt bei Ihrer Pflegekasse ein. Sie ist gemäß § 4 Nr. 16 UStG umsatzsteuerfrei.</p>`
    : "";
  return `<!doctype html>
<html lang="de">
  <body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f7faf5;margin:0;padding:32px 0;color:#2b2b2b">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:white;border:1px solid #e3e8de;border-radius:10px;overflow:hidden">
      <tr>
        <td style="background:#16587c;color:white;padding:18px 24px;font-size:18px;font-weight:600">
          Priya's Reinigungsservice
        </td>
      </tr>
      <tr>
        <td style="padding:24px">
          <p style="margin:0 0 12px">Guten Tag ${escapeHtml(args.customerName)},</p>
          <p style="margin:0 0 12px">anbei finden Sie unsere Rechnung <strong>${escapeHtml(args.invoiceNumber)}</strong>.</p>
          <table cellspacing="0" cellpadding="0" style="margin:18px 0;border-collapse:collapse">
            <tr><td style="padding:4px 12px 4px 0;color:#777">Rechnungsdatum</td><td>${escapeHtml(args.issueDateLabel)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#777">Fällig am</td><td>${escapeHtml(args.dueDateLabel)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#777">Gesamtbetrag</td><td style="font-weight:700;color:#16587c">${escapeHtml(args.totalLabel)}</td></tr>
          </table>
          ${linkBlock}
          ${ahBlock}
          <p style="margin:18px 0 0;font-size:13px;color:#555">Bei Fragen antworten Sie einfach auf diese E-Mail.</p>
          <p style="margin:6px 0 0;font-size:13px;color:#555">Mit freundlichen Grüßen<br>Ihr Team Priya's Reinigungsservice</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

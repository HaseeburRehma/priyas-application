import "server-only";

/**
 * HTML body of the monthly billing report email sent to management.
 *
 * Brand-aligned with the invoice email (same teal header, same body
 * card) so the inbox feels coherent. The CSV attachment is the
 * machine-readable companion — the PDF in this same email is the
 * human-readable artefact the recipient forwards to the Krankenkasse.
 *
 * All copy is rendered server-side from translated strings rather than
 * hard-coded so future locales (English/Tamil for diaspora ops staff)
 * drop in for free.
 */

export type MonthlyReportEmailArgs = {
  periodLabel: string; // "March 2026"
  totalHoursLabel: string; // "184.5 h"
  totalAmountLabel: string; // "€3,172.00"
  customersCount: number;
  staffCount: number;
  /** Localised greeting / body / signoff strings. The caller threads in
   *  next-intl translations so the email language matches the sender. */
  copy: {
    subject: string;
    greeting: string;
    intro: string;
    statsLabel: string;
    hoursLabel: string;
    customersLabel: string;
    staffLabel: string;
    amountLabel: string;
    attachmentsLine: string;
    nextActionTitle: string;
    nextActionBody: string;
    closing: string;
    signature: string;
    footerNote: string;
  };
};

export function renderMonthlyReportEmailHtml(
  args: MonthlyReportEmailArgs,
): string {
  return `<!doctype html>
<html lang="de">
  <body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f7faf5;margin:0;padding:32px 0;color:#2b2b2b">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:white;border:1px solid #e3e8de;border-radius:10px;overflow:hidden">
      <tr>
        <td style="background:#16587c;color:white;padding:18px 24px;font-size:18px;font-weight:600">
          <span style="display:inline-block;width:32px;height:32px;border-radius:6px;background:#72a94f;color:white;font-weight:800;text-align:center;line-height:32px;margin-right:10px;vertical-align:middle">P</span>
          Priya&apos;s Reinigungsservice
        </td>
      </tr>
      <tr>
        <td style="padding:24px">
          <p style="margin:0 0 12px">${escapeHtml(args.copy.greeting)}</p>
          <p style="margin:0 0 12px">
            ${escapeHtml(args.copy.intro).replace(
              "{period}",
              `<strong>${escapeHtml(args.periodLabel)}</strong>`,
            )}
          </p>

          <div style="margin:18px 0;padding:16px;background:#fef6f6;border-left:4px solid #c44545;border-radius:6px">
            <div style="font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;font-weight:600">
              ${escapeHtml(args.copy.statsLabel)}
            </div>
            <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:13px">
              <tr>
                <td style="padding:4px 0;color:#555">${escapeHtml(args.copy.hoursLabel)}</td>
                <td style="padding:4px 0;text-align:right;font-weight:600;color:#c44545">${escapeHtml(args.totalHoursLabel)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#555">${escapeHtml(args.copy.customersLabel)}</td>
                <td style="padding:4px 0;text-align:right;font-weight:600">${args.customersCount}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#555">${escapeHtml(args.copy.staffLabel)}</td>
                <td style="padding:4px 0;text-align:right;font-weight:600">${args.staffCount}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#555">${escapeHtml(args.copy.amountLabel)}</td>
                <td style="padding:4px 0;text-align:right;font-weight:700;color:#16587c">${escapeHtml(args.totalAmountLabel)}</td>
              </tr>
            </table>
          </div>

          <p style="margin:0 0 12px;font-size:13px;color:#555">
            📎 ${escapeHtml(args.copy.attachmentsLine)}
          </p>

          <div style="margin-top:18px;padding:14px;background:#f5f8f1;border-radius:6px">
            <div style="font-size:13px;font-weight:600;color:#16587c;margin-bottom:6px">
              ${escapeHtml(args.copy.nextActionTitle)}
            </div>
            <div style="font-size:13px;color:#555;line-height:1.5">
              ${escapeHtml(args.copy.nextActionBody)}
            </div>
          </div>

          <p style="margin:18px 0 0;font-size:13px;color:#555">${escapeHtml(args.copy.closing)}</p>
          <p style="margin:6px 0 0;font-size:13px;color:#555">${escapeHtml(args.copy.signature)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px;background:#fafaf9;border-top:1px solid #eee;font-size:11px;color:#999">
          ${escapeHtml(args.copy.footerNote)}
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

/**
 * Welcome-email template + send helper for feature-update #3.
 *
 * Triggered when a manager uploads a signed contract for a new
 * customer via uploadClientDocumentAction (category = 'contract').
 * The customer receives a friendly welcome message and the contract
 * attached as PDF.
 *
 * Kept as a hand-rolled string template because the repo has no other
 * transactional email that uses one, and pulling in a templating
 * library for a single email would out-weigh the maintenance win.
 * If more automated emails follow, promote this to a shared
 * `email/templates/*.tsx` shape with `@react-email/render`.
 */
import "server-only";

import { sendEmail } from "./resend";

const BRAND_NAME = "Priya's Reinigungsservice";
const BRAND_COLOR = "#5D8E3F"; // primary-600 from tailwind.config
const CONTACT_EMAIL =
  process.env.RESEND_FROM_EMAIL?.trim() || "info@priyas.de";

export type WelcomeEmailArgs = {
  to: string;
  customerName: string;
  contract?: {
    filename: string;
    /** Base64-encoded contract file. */
    base64: string;
    contentType?: string;
  };
};

/**
 * Build + send the welcome email. Idempotency is the caller's
 * responsibility — this fires every time it's called.
 */
export async function sendWelcomeEmail(args: WelcomeEmailArgs) {
  const subject = `Willkommen bei ${BRAND_NAME}`;
  const greeting = args.customerName?.trim()
    ? `Hallo ${escapeHtml(args.customerName.trim())},`
    : "Hallo,";
  const attachmentLine = args.contract
    ? `<p style="margin:0 0 16px;color:#374151;">Anbei findest du deinen unterschriebenen Vertrag als PDF-Datei zur Ablage.</p>`
    : "";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6faf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6faf3;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,60,84,0.06);">
            <tr>
              <td style="background:${BRAND_COLOR};padding:20px 28px;color:#ffffff;">
                <div style="font-size:14px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;opacity:0.9;">Priya's Reinigungsservice</div>
                <div style="font-size:22px;font-weight:800;margin-top:4px;">Willkommen an Bord</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 16px;font-size:16px;color:#0f3c54;">${greeting}</p>
                <p style="margin:0 0 16px;color:#374151;line-height:1.55;">
                  vielen Dank, dass du dich für ${BRAND_NAME} entschieden hast!
                  Ab jetzt sind wir dein Ansprechpartner rund um Reinigung und
                  Alltagshilfe. Unser Team meldet sich in den kommenden Tagen
                  mit den ersten Terminen.
                </p>
                ${attachmentLine}
                <p style="margin:24px 0 0;color:#374151;line-height:1.55;">
                  Bei Fragen erreichst du uns jederzeit unter
                  <a href="mailto:${CONTACT_EMAIL}" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">${CONTACT_EMAIL}</a>.
                </p>
                <p style="margin:24px 0 0;color:#374151;">
                  Herzliche Grüße<br/>
                  Dein Team von ${BRAND_NAME}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f6faf3;color:#6b7280;font-size:12px;text-align:center;">
                ${BRAND_NAME} · ${CONTACT_EMAIL}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    subject,
    "",
    args.customerName?.trim() ? `Hallo ${args.customerName.trim()},` : "Hallo,",
    "",
    `vielen Dank, dass du dich für ${BRAND_NAME} entschieden hast!`,
    "Ab jetzt sind wir dein Ansprechpartner rund um Reinigung und Alltagshilfe.",
    args.contract
      ? "Anbei findest du deinen unterschriebenen Vertrag als PDF-Datei zur Ablage."
      : "",
    "",
    `Bei Fragen: ${CONTACT_EMAIL}`,
    "",
    "Herzliche Grüße",
    `Dein Team von ${BRAND_NAME}`,
  ]
    .filter(Boolean)
    .join("\n");

  return sendEmail({
    to: args.to,
    subject,
    html,
    text,
    attachments: args.contract
      ? [
          {
            filename: args.contract.filename,
            content: args.contract.base64,
            contentType: args.contract.contentType,
          },
        ]
      : undefined,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

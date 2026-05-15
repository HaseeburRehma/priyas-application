/**
 * Tiny Resend REST client. No SDK dep — Resend's POST /emails API is
 * straightforward and bundling another package just for one endpoint is
 * not worth the size.
 *
 * Falls back to a no-op stub when `RESEND_API_KEY` is unset so local dev
 * keeps working.
 */
import "server-only";

type Attachment = {
  filename: string;
  /** Base64-encoded file content. */
  content: string;
  contentType?: string;
};

export type SendEmailArgs = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Attachment[];
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "no-reply@example.com";
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn("[resend-stub] RESEND_API_KEY missing — would send", {
      to: args.to,
      subject: args.subject,
      attachments: (args.attachments ?? []).map((a) => a.filename),
    });
    return { ok: true, id: `stub_${Date.now()}` };
  }

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(args.to) ? args.to : [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: args.replyTo,
        attachments: args.attachments,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch_failed";
    return { ok: false, error: `resend_fetch_failed: ${msg}` };
  }
  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!res.ok) {
    return { ok: false, error: body.message ?? `resend_http_${res.status}` };
  }
  return { ok: true, id: body.id ?? "" };
}

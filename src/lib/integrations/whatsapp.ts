import "server-only";

/**
 * WhatsApp adapter via Twilio's WhatsApp Business API.
 *
 * Spec §4.6 / §4.7 / §6 — WhatsApp is one of the three supported
 * notification channels. Settings → Notifications lets users toggle
 * which events go through it; this module is what the notifications
 * fan-out (`emitNotification`) actually calls when the toggle is on.
 *
 * Configuration (.env.local):
 *   TWILIO_ACCOUNT_SID         — your Twilio account SID
 *   TWILIO_AUTH_TOKEN          — auth token (server-only!)
 *   TWILIO_WHATSAPP_FROM       — sandbox or approved sender number,
 *                                 e.g. "whatsapp:+14155238886"
 *
 * If any of these are missing the adapter returns a stub that just
 * logs the intended message — same pattern as the Lexware client.
 * That keeps local dev unblocked without forcing every contributor to
 * set up a Twilio account.
 */

export interface WhatsAppClient {
  /** Send a plain-text WhatsApp message. */
  sendText(to: string, body: string): Promise<{ id: string | null }>;
}

type TwilioConfig = {
  accountSid: string;
  authToken: string;
  from: string;
};

function getTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from };
}

/**
 * Twilio expects WhatsApp numbers in the form `whatsapp:+E164`.
 * We accept either a bare `+E164` phone or the already-prefixed form
 * and normalise to the prefixed shape.
 */
function normalizeWhatsAppNumber(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  // Accept anything with a leading + that looks vaguely like E.164.
  if (/^\+[1-9]\d{6,15}$/.test(trimmed)) return `whatsapp:${trimmed}`;
  return null;
}

class StubWhatsAppClient implements WhatsAppClient {
  async sendText(to: string, body: string) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp-stub] would send", { to, body });
    return { id: null };
  }
}

class TwilioWhatsAppClient implements WhatsAppClient {
  constructor(private cfg: TwilioConfig) {}

  async sendText(to: string, body: string) {
    const normalized = normalizeWhatsAppNumber(to);
    if (!normalized) {
      throw new Error(`whatsapp: invalid recipient ${to}`);
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.cfg.accountSid}/Messages.json`;
    // Twilio's REST endpoint takes form-encoded params, not JSON.
    const form = new URLSearchParams({
      From: this.cfg.from,
      To: normalized,
      // Twilio caps WhatsApp body at 1600 chars; truncate defensively.
      Body: body.length > 1600 ? `${body.slice(0, 1597)}...` : body,
    });
    // HTTP Basic auth (account SID + auth token).
    const auth = Buffer.from(
      `${this.cfg.accountSid}:${this.cfg.authToken}`,
    ).toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`twilio ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { sid?: string };
    return { id: data.sid ?? null };
  }
}

/** Returns the real client when Twilio is configured, the stub otherwise. */
export function createWhatsAppClient(): WhatsAppClient {
  const cfg = getTwilioConfig();
  if (cfg) return new TwilioWhatsAppClient(cfg);
  return new StubWhatsAppClient();
}

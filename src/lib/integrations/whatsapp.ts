/**
 * WhatsApp adapter — stubbed. Designed to back into Twilio's WhatsApp API
 * once TWILIO_* env vars are configured.
 */

export interface WhatsAppClient {
  sendText(to: string, body: string): Promise<void>;
}

class StubWhatsAppClient implements WhatsAppClient {
  async sendText(to: string, body: string) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp-stub] would send", { to, body });
  }
}

export function createWhatsAppClient(): WhatsAppClient {
  return new StubWhatsAppClient();
}

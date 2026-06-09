import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WhatsAppMessage {
  to: string;
  body: string;
}

interface MetaErrorResponse {
  error?: { message?: string; type?: string; code?: number };
}

/**
 * Meta WhatsApp Cloud API client. Mirrors EmailService's pattern: if the
 * provider isn't configured, runs in "log mode" so dev flows still work.
 *
 * Production sends require pre-approved message templates. For this v1 we
 * use the same text body for both opt-in session messages and template
 * fallbacks; we always attempt a plain-text first (works inside the 24h
 * customer-service window) and let Meta reject with a clear error if the
 * window has closed — the failure is logged and never bubbles up to the
 * caller, matching the email service contract.
 *
 * Configurable via env:
 *   WHATSAPP_META_PHONE_NUMBER_ID — phone-number ID issued in Meta dashboard
 *   WHATSAPP_META_ACCESS_TOKEN    — permanent system-user token
 *   WHATSAPP_META_GRAPH_VERSION   — graph version (default v21.0)
 */
@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private phoneNumberId: string | null = null;
  private accessToken: string | null = null;
  private graphVersion = 'v21.0';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.phoneNumberId = this.config.get<string>('WHATSAPP_META_PHONE_NUMBER_ID') ?? null;
    this.accessToken = this.config.get<string>('WHATSAPP_META_ACCESS_TOKEN') ?? null;
    this.graphVersion = this.config.get<string>('WHATSAPP_META_GRAPH_VERSION', 'v21.0');
    if (!this.phoneNumberId || !this.accessToken) {
      this.logger.warn(
        'WhatsApp Meta credentials not set — WhatsAppService running in log-only mode',
      );
      return;
    }
    this.logger.log(`WhatsAppService initialized (phone_number_id=${this.phoneNumberId})`);
  }

  /** Best-effort send. Failures log and swallow. */
  async send(message: WhatsAppMessage): Promise<void> {
    const to = this.normalizeNumber(message.to);
    if (!to) {
      this.logger.warn(`Refusing to send WhatsApp — empty/invalid number`);
      return;
    }
    if (!this.phoneNumberId || !this.accessToken) {
      this.logger.log(`[whatsapp/log] To: ${to}\n${message.body}`);
      return;
    }
    const url = `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { preview_url: false, body: message.body },
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as MetaErrorResponse;
        const reason = payload.error?.message ?? `HTTP ${res.status}`;
        this.logger.error(`WhatsApp send failed (${to}): ${reason}`);
      }
    } catch (err) {
      this.logger.error(`WhatsApp send error (${to}): ${(err as Error).message}`);
    }
  }

  /**
   * Strip whitespace and a leading "+" so the number matches Meta's expected
   * E.164-without-plus format. Returns null for clearly-empty input so the
   * caller can short-circuit.
   */
  private normalizeNumber(raw: string): string | null {
    const trimmed = raw.replace(/[\s\-()]/g, '').trim();
    if (!trimmed) return null;
    return trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  }
}

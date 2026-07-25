import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

// Sparrow-SMS-style HTTP API (Nepal's common transactional SMS gateway).
// Silent no-op when unconfigured — callers never need to guard this
// themselves, so wiring in an order-ready/confirmation text is a one-liner
// that's harmless on a restaurant that hasn't set up SMS yet.
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  constructor(private readonly settings: SettingsService) {}

  async send(phone: string | null | undefined, text: string): Promise<{ sent: boolean; reason?: string }> {
    if (!phone) return { sent: false, reason: 'No phone number' };
    const cfg = await this.settings.getGatewayConfig();
    if (!cfg.sms.apiKey) return { sent: false, reason: 'SMS gateway not configured' };
    const cleanPhone = phone.replace(/\D/g, '').replace(/^977/, '');
    if (cleanPhone.length !== 10) return { sent: false, reason: 'Invalid phone number' };
    const base = process.env.SMS_API_URL ?? 'https://api.sparrowsms.com/v2/sms/';
    const url = new URL(base);
    url.searchParams.set('token', cfg.sms.apiKey);
    url.searchParams.set('from', cfg.sms.senderId ?? 'INFO');
    url.searchParams.set('to', cleanPhone);
    url.searchParams.set('text', text);
    try {
      const res = await fetch(url.toString());
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.logger.warn(`SMS send failed (${res.status}): ${JSON.stringify(body)}`);
        return { sent: false, reason: body?.response ?? `HTTP ${res.status}` };
      }
      return { sent: true };
    } catch (e) {
      this.logger.warn(`SMS send error: ${(e as Error).message}`);
      return { sent: false, reason: (e as Error).message };
    }
  }
}

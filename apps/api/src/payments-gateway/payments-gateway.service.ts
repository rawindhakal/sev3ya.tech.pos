import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { SettingsService } from '../settings/settings.service';
import { OrdersService } from '../orders/orders.service';

// Real merchant integrations for Nepal's three common payment gateways.
// Inactive (throws a clear "not configured" error) until Settings has real
// merchant credentials — see settings.service.ts getGatewayConfig(). Field
// names/endpoints follow each provider's publicly documented API as of this
// writing; re-verify against their current docs/sandbox before going live,
// since payment-gateway APIs occasionally change without much notice.
//
// For simplicity, a gateway payment always covers the order's FULL
// remaining total (not a partial/split payment) — matches the common
// "customer pays the whole bill via QR" self-order/online-order case.
@Injectable()
export class PaymentsGatewayService {
  constructor(
    private readonly settings: SettingsService,
    private readonly orders: OrdersService,
  ) {}

  // ── eSewa (ePay v2) — https://developer.esewa.com.np/pages/Epay#epay-v2 ──
  // Flow: build a signed field set → the frontend auto-submits an HTML form
  // (POST) to `formUrl` → eSewa redirects back with a base64 `data` query
  // param → verifyEsewa() decodes it and double-checks with eSewa's own
  // status API before trusting it.
  async initiateEsewa(orderId: string, successUrl: string, failureUrl: string) {
    const cfg = await this.settings.getGatewayConfig();
    if (!cfg.esewa.merchantCode || !cfg.esewa.secretKey)
      throw new BadRequestException('eSewa is not configured — add the merchant code and secret key in Settings');
    const order = await this.orders.findOne(orderId);
    const amount = order.totalCents / 100;
    const transactionUuid = `${order.number}-${Date.now()}`;
    const signedFieldNames = 'total_amount,transaction_uuid,product_code';
    const message = `total_amount=${amount},transaction_uuid=${transactionUuid},product_code=${cfg.esewa.merchantCode}`;
    const signature = createHmac('sha256', cfg.esewa.secretKey).update(message).digest('base64');
    return {
      formUrl: process.env.ESEWA_FORM_URL ?? 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
      fields: {
        amount: String(amount),
        tax_amount: '0',
        total_amount: String(amount),
        transaction_uuid: transactionUuid,
        product_code: cfg.esewa.merchantCode,
        product_service_charge: '0',
        product_delivery_charge: '0',
        success_url: successUrl,
        failure_url: failureUrl,
        signed_field_names: signedFieldNames,
        signature,
      },
    };
  }

  async verifyEsewa(orderId: string, base64Data: string) {
    const cfg = await this.settings.getGatewayConfig();
    if (!cfg.esewa.merchantCode || !cfg.esewa.secretKey) throw new BadRequestException('eSewa is not configured');
    let decoded: any;
    try {
      decoded = JSON.parse(Buffer.from(base64Data, 'base64').toString('utf8'));
    } catch {
      throw new BadRequestException('Malformed eSewa response');
    }
    if (decoded.status !== 'COMPLETE') throw new BadRequestException(`eSewa payment ${decoded.status}`);
    const statusUrl = new URL(process.env.ESEWA_STATUS_URL ?? 'https://rc.esewa.com.np/api/epay/transaction/status/');
    statusUrl.searchParams.set('product_code', cfg.esewa.merchantCode);
    statusUrl.searchParams.set('total_amount', decoded.total_amount);
    statusUrl.searchParams.set('transaction_uuid', decoded.transaction_uuid);
    const res = await fetch(statusUrl.toString());
    const status: any = await res.json();
    if (status.status !== 'COMPLETE') throw new BadRequestException(`eSewa did not confirm this payment (${status.status})`);
    return this.orders.pay(orderId, {
      payments: [{
        method: 'ESEWA',
        amountCents: Math.round(parseFloat(decoded.total_amount) * 100),
        gatewayRef: decoded.transaction_code ?? decoded.transaction_uuid,
      }],
    });
  }

  // ── Khalti (ePayment / KPG-2) — https://docs.khalti.com/khalti-epayment/ ──
  async initiateKhalti(orderId: string, returnUrl: string, websiteUrl: string) {
    const cfg = await this.settings.getGatewayConfig();
    if (!cfg.khalti.secretKey) throw new BadRequestException('Khalti is not configured — add the secret key in Settings');
    const order = await this.orders.findOne(orderId);
    const base = process.env.KHALTI_API_URL ?? 'https://a.khalti.com/api/v2';
    const res = await fetch(`${base}/epayment/initiate/`, {
      method: 'POST',
      headers: { Authorization: `Key ${cfg.khalti.secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        return_url: returnUrl,
        website_url: websiteUrl,
        amount: order.totalCents, // Khalti expects paisa == our cents unit 1:1
        purchase_order_id: order.id,
        purchase_order_name: `Order #${order.number}`,
      }),
    });
    if (!res.ok) throw new BadRequestException(`Khalti initiate failed: ${await res.text()}`);
    return res.json(); // { pidx, payment_url, expires_at, ... }
  }

  async verifyKhalti(orderId: string, pidx: string) {
    const cfg = await this.settings.getGatewayConfig();
    if (!cfg.khalti.secretKey) throw new BadRequestException('Khalti is not configured');
    const base = process.env.KHALTI_API_URL ?? 'https://a.khalti.com/api/v2';
    const res = await fetch(`${base}/epayment/lookup/`, {
      method: 'POST',
      headers: { Authorization: `Key ${cfg.khalti.secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pidx }),
    });
    const status: any = await res.json();
    if (status.status !== 'Completed') throw new BadRequestException(`Khalti payment ${status.status}`);
    return this.orders.pay(orderId, {
      payments: [{ method: 'KHALTI', amountCents: status.total_amount, gatewayRef: pidx }],
    });
  }

  // ── FonePay — merchant redirect flow (HMAC-SHA512 signed) ──
  // Field names/endpoints vary by FonePay merchant onboarding package;
  // confirm against your merchant's integration packet before going live.
  async initiateFonepay(orderId: string, returnUrl: string) {
    const cfg = await this.settings.getGatewayConfig();
    if (!cfg.fonepay.merchantCode || !cfg.fonepay.secretKey)
      throw new BadRequestException('FonePay is not configured — add the merchant code and secret key in Settings');
    const order = await this.orders.findOne(orderId);
    const amount = (order.totalCents / 100).toFixed(2);
    const prn = `${order.number}-${Date.now()}`; // merchant's payment reference number
    const message = `${cfg.fonepay.merchantCode},${amount},${prn},NPR,PAYMENT`;
    const dv = createHmac('sha512', cfg.fonepay.secretKey).update(message).digest('hex');
    const base = process.env.FONEPAY_FORM_URL ?? 'https://dev-clientapi.fonepay.com/api/merchantRequest';
    const url = new URL(base);
    url.searchParams.set('PID', cfg.fonepay.merchantCode);
    url.searchParams.set('MD', 'P');
    url.searchParams.set('AMT', amount);
    url.searchParams.set('CRN', 'NPR');
    url.searchParams.set('DT', new Date().toLocaleDateString('en-US'));
    url.searchParams.set('R1', `Order ${order.number}`);
    url.searchParams.set('R2', 'POS');
    url.searchParams.set('RU', returnUrl);
    url.searchParams.set('PRN', prn);
    url.searchParams.set('DV', dv);
    return { redirectUrl: url.toString(), prn };
  }

  async verifyFonepay(orderId: string, prn: string) {
    const cfg = await this.settings.getGatewayConfig();
    if (!cfg.fonepay.merchantCode || !cfg.fonepay.secretKey) throw new BadRequestException('FonePay is not configured');
    const base = process.env.FONEPAY_VERIFY_URL ?? 'https://dev-clientapi.fonepay.com/api/merchantRequest/verificationLink';
    const url = new URL(base);
    url.searchParams.set('PID', cfg.fonepay.merchantCode);
    url.searchParams.set('PRN', prn);
    url.searchParams.set('DV', createHmac('sha512', cfg.fonepay.secretKey).update(`${cfg.fonepay.merchantCode},${prn}`).digest('hex'));
    const res = await fetch(url.toString());
    const status: any = await res.json();
    if (status.status !== 'success' && status.paymentStatus !== 'success')
      throw new BadRequestException('FonePay did not confirm this payment');
    const order = await this.orders.findOne(orderId);
    return this.orders.pay(orderId, {
      payments: [{ method: 'FONEPAY', amountCents: order.totalCents, gatewayRef: prn }],
    });
  }
}

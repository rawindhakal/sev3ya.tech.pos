'use client';

// Printable end-of-day (Z) report for a cash-drawer session ("business day" =
// terminal open → close). Prints via #print-area (body.print-receipt).
import { formatMoney } from '@/lib/api';
import { PAYMENT_METHOD_LABEL } from '@/lib/constants';
import type { PaymentMethod, Settings } from '@/lib/types';

export interface DayReportData {
  session: { id: string; openedAt: string; closedAt?: string | null; openedBy?: string | null; closedBy?: string | null; openingFloatCents: number; countedCents?: number | null };
  sales: { orders: number; grossCents: number; subtotalCents: number; vatCents: number; discountCents: number; serviceChargeCents: number; guests: number };
  byPayment: { method: PaymentMethod; amountCents: number; count: number }[];
  byType: { type: string; totalCents: number; count: number }[];
  cash: { openingFloatCents: number; cashSalesCents: number; payInCents: number; payOutCents: number; expectedCents: number; countedCents?: number | null; varianceCents?: number | null };
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function DayReport({ report, settings }: { report: DayReportData | null; settings: Settings | null }) {
  if (!report) return null;
  const { session, sales, byPayment, byType, cash } = report;

  return (
    <div id="print-area">
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{settings?.restaurantName ?? 'CakeZake'}</div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>*** DAY-END (Z) REPORT ***</div>
      </div>

      <div style={{ fontSize: 12, borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0' }}>
        <div>Opened: {new Date(session.openedAt).toLocaleString()}{session.openedBy ? ` · ${session.openedBy}` : ''}</div>
        <div>Closed: {session.closedAt ? new Date(session.closedAt).toLocaleString() : '—'}{session.closedBy ? ` · ${session.closedBy}` : ''}</div>
      </div>

      <div style={{ fontSize: 12, marginTop: 6 }}>
        <div style={{ fontWeight: 700 }}>Sales</div>
        <Row label="Orders" value={String(sales.orders)} />
        <Row label="Guests" value={String(sales.guests)} />
        <Row label="Gross sales" value={formatMoney(sales.grossCents)} />
        {sales.discountCents > 0 && <Row label="Discounts" value={`-${formatMoney(sales.discountCents)}`} />}
        {sales.serviceChargeCents > 0 && <Row label="Service charge" value={formatMoney(sales.serviceChargeCents)} />}
        <Row label="VAT" value={formatMoney(sales.vatCents)} />
      </div>

      <div style={{ fontSize: 12, marginTop: 6, borderTop: '1px dashed #000', paddingTop: 4 }}>
        <div style={{ fontWeight: 700 }}>By payment method</div>
        {byPayment.map((p) => <Row key={p.method} label={`${PAYMENT_METHOD_LABEL[p.method] ?? p.method} (${p.count})`} value={formatMoney(p.amountCents)} />)}
      </div>

      <div style={{ fontSize: 12, marginTop: 6, borderTop: '1px dashed #000', paddingTop: 4 }}>
        <div style={{ fontWeight: 700 }}>By order type</div>
        {byType.map((t) => <Row key={t.type} label={`${t.type.replace('_', ' ')} (${t.count})`} value={formatMoney(t.totalCents)} />)}
      </div>

      <div style={{ fontSize: 12, marginTop: 6, borderTop: '1px dashed #000', paddingTop: 4 }}>
        <div style={{ fontWeight: 700 }}>Cash reconciliation</div>
        <Row label="Opening float" value={formatMoney(cash.openingFloatCents)} />
        <Row label="+ Cash sales" value={formatMoney(cash.cashSalesCents)} />
        <Row label="+ Pay-ins" value={formatMoney(cash.payInCents)} />
        <Row label="− Pay-outs" value={formatMoney(cash.payOutCents)} />
        <div style={{ borderTop: '1px solid #000', marginTop: 3, paddingTop: 3 }}>
          <Row label="Expected in drawer" value={formatMoney(cash.expectedCents)} bold />
        </div>
        {cash.countedCents != null && <Row label="Counted" value={formatMoney(cash.countedCents)} />}
        {cash.varianceCents != null && (
          <Row label={`Variance ${cash.varianceCents < 0 ? '(short)' : cash.varianceCents > 0 ? '(over)' : ''}`} value={formatMoney(cash.varianceCents)} bold />
        )}
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, marginTop: 10 }}>— end of day —</div>
    </div>
  );
}

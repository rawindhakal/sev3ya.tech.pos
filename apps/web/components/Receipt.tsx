'use client';

// Rendered off-screen; becomes the only visible element when window.print()
// is called (see #print-area rules in globals.css). `mode` switches between a
// kitchen ticket (KOT) and a customer bill.
import { formatMoney } from '@/lib/api';
import type { Order, Settings } from '@/lib/types';

export default function Receipt({
  order,
  settings,
  mode,
}: {
  order: Order | null;
  settings: Settings | null;
  mode: 'KOT' | 'BILL';
}) {
  if (!order) return <div id="print-area" />;
  const when = new Date(order.createdAt).toLocaleString();

  return (
    <div id="print-area">
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        {mode === 'BILL' ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {settings?.restaurantName ?? 'CakeZake'}
            </div>
            {settings?.address && <div style={{ fontSize: 11 }}>{settings.address}</div>}
            {settings?.phone && <div style={{ fontSize: 11 }}>Tel: {settings.phone}</div>}
            {settings?.taxId && <div style={{ fontSize: 11 }}>{settings.taxId}</div>}
            <div style={{ fontSize: 11, marginTop: 2 }}>Tax Invoice</div>
            {settings?.receiptHeader && (
              <div style={{ fontSize: 11, marginTop: 4 }}>{settings.receiptHeader}</div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 18, fontWeight: 700 }}>*** KITCHEN ORDER (KOT) ***</div>
        )}
      </div>

      <div style={{ fontSize: 12, borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0' }}>
        <div>Order #{order.number} · {order.type.replace('_', ' ')}</div>
        {order.table && <div>Table: {order.table.name}</div>}
        {order.waiter && <div>Waiter: {order.waiter.name}</div>}
        <div>Guests: {order.guestCount}</div>
        <div>{when}</div>
      </div>

      <table style={{ width: '100%', fontSize: 12, marginTop: 6 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #000' }}>
            <th style={{ textAlign: 'left' }}>Item</th>
            <th style={{ textAlign: 'center' }}>Qty</th>
            {mode === 'BILL' && <th style={{ textAlign: 'right' }}>Amt</th>}
          </tr>
        </thead>
        <tbody>
          {order.items.map((it) => {
            const mods = Array.isArray(it.modifiers) ? it.modifiers : [];
            const modCents = mods.reduce((s, m) => s + m.priceCents, 0);
            const lineTotal = (it.unitPriceCents + modCents) * it.quantity;
            return (
              <tr key={it.id} style={{ verticalAlign: 'top' }}>
                <td style={{ textAlign: 'left' }}>
                  {it.nameSnapshot}
                  {mods.length > 0 && (
                    <div style={{ fontSize: 10 }}>+ {mods.map((m) => m.name).join(', ')}</div>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                {mode === 'BILL' && <td style={{ textAlign: 'right' }}>{formatMoney(lineTotal)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>

      {mode === 'BILL' && (
        <div style={{ fontSize: 12, borderTop: '1px dashed #000', marginTop: 6, paddingTop: 4 }}>
          <Row label="Subtotal" value={formatMoney(order.subtotalCents)} />
          {order.discountCents > 0 && <Row label="Discount" value={`-${formatMoney(order.discountCents)}`} />}
          <Row
            label={`VAT (${Math.round((settings?.vatRate ?? 0.13) * 100)}%)`}
            value={formatMoney(order.taxCents)}
          />
          <div style={{ borderTop: '1px solid #000', marginTop: 4, paddingTop: 4 }}>
            <Row label="TOTAL" value={formatMoney(order.totalCents)} bold />
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: 11, marginTop: 10 }}>
        {mode === 'BILL'
          ? settings?.receiptFooter || 'Thank you! Please visit again.'
          : '— send to kitchen —'}
      </div>
      {mode === 'BILL' && settings?.wifiPassword && (
        <div style={{ textAlign: 'center', fontSize: 10, marginTop: 4 }}>
          WiFi: {settings.wifiPassword}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

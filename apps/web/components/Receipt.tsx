'use client';

// Rendered off-screen; becomes the only visible element when window.print()
// is called (see #print-area rules in globals.css).
// Modes: BILL (customer invoice), KOT (kitchen), BOT (bar), CANCEL (voided items).
// Layout is driven by the editable templates under Settings → Printing.
import { formatMoney } from '@/lib/api';
import { formatBs } from '@/lib/bs-date';
import { billTemplateOf, kotTemplateOf } from '@/lib/printing';
import type { Order, OrderItem, Settings } from '@/lib/types';

export type ReceiptMode = 'BILL' | 'KOT' | 'BOT' | 'CANCEL';

export default function Receipt({
  order,
  settings,
  mode,
  items,
  docTitle,
}: {
  order: Order | null;
  settings: Settings | null;
  mode: ReceiptMode;
  items?: OrderItem[]; // explicit items for KOT/BOT/CANCEL; defaults to the bill
  docTitle?: string;   // overrides the bill document title (Estimated Bill / Tax Invoice / Invoice)
}) {
  if (!order) return null;
  const when = new Date().toLocaleString();
  const list = items ?? order.items.filter((i) => !i.cancelledAt);
  const isBill = mode === 'BILL';
  const bt = billTemplateOf(settings);
  const kt = kotTemplateOf(settings);
  const fs = isBill ? bt.fontSize : kt.fontSize;
  const sub = Math.max(fs - 3, 8);

  const ticketTitle =
    mode === 'KOT' ? kt.kotTitle : mode === 'BOT' ? kt.botTitle : '*** ITEM CANCELLATION ***';

  return (
    <div id="print-area" style={{ fontSize: fs }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        {isBill ? (
          <>
            <div style={{ fontSize: fs + 6, fontWeight: 700 }}>{settings?.restaurantName ?? 's3vya'}</div>
            {bt.showAddress && settings?.address && <div>{settings.address}</div>}
            {bt.showPhone && settings?.phone && <div>Tel: {settings.phone}</div>}
            {bt.showTaxId && settings?.taxId && <div>{settings.taxId}</div>}
            <div style={{ marginTop: 2, fontWeight: docTitle ? 700 : 400 }}>{docTitle ?? bt.title}</div>
            {(bt.headerText || settings?.receiptHeader) && (
              <div style={{ marginTop: 4 }}>{bt.headerText || settings?.receiptHeader}</div>
            )}
          </>
        ) : (
          <div style={{ fontSize: fs + 3, fontWeight: 700 }}>{ticketTitle}</div>
        )}
      </div>

      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0' }}>
        <div>
          Order #{order.number}
          {(isBill || kt.showOrderType) && <> · {order.type.replace('_', ' ')}</>}
        </div>
        {isBill && order.fiscalInvoiceNo != null && (
          <div>Invoice No: {order.fiscalInvoiceNo} · FY {order.fiscalYear}</div>
        )}
        {(isBill ? bt.showTable : kt.showTable) && order.table && <div>Table: {order.table.name}</div>}
        {(isBill ? bt.showWaiter : kt.showWaiter) && order.waiter && <div>Waiter: {order.waiter.name}</div>}
        {isBill && bt.showCustomer && order.customerName && (
          <div>Customer: {order.customerName}{order.customerPhone ? ` (${order.customerPhone})` : ''}</div>
        )}
        {isBill && bt.showGuests && <div>Guests: {order.guestCount}</div>}
        {(isBill || kt.showTime) && <div>{when}{isBill && ` · BS ${formatBs(new Date())}`}</div>}
      </div>

      <table style={{ width: '100%', marginTop: 6 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #000' }}>
            <th style={{ textAlign: 'left' }}>Item</th>
            <th style={{ textAlign: 'center' }}>Qty</th>
            {isBill && <th style={{ textAlign: 'right' }}>Amt</th>}
          </tr>
        </thead>
        <tbody>
          {list.map((it) => {
            const mods = Array.isArray(it.modifiers) ? it.modifiers : [];
            const modCents = mods.reduce((s, m) => s + m.priceCents, 0);
            const lineTotal = (it.unitPriceCents + modCents) * it.quantity;
            const showNotes = isBill ? bt.showItemNotes : kt.showItemNotes;
            return (
              <tr key={it.id} style={{ verticalAlign: 'top' }}>
                <td style={{ textAlign: 'left' }}>
                  {mode === 'CANCEL' ? '❌ ' : ''}{it.nameSnapshot}
                  {mods.length > 0 && <div style={{ fontSize: sub }}>+ {mods.map((m) => m.name).join(', ')}</div>}
                  {showNotes && it.notes && <div style={{ fontSize: sub, fontStyle: 'italic' }}>» {it.notes}</div>}
                </td>
                <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                {isBill && <td style={{ textAlign: 'right' }}>{formatMoney(lineTotal)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>

      {isBill && (
        <div style={{ borderTop: '1px dashed #000', marginTop: 6, paddingTop: 4 }}>
          {bt.showVatBreakdown && (
            <>
              <Row label="Subtotal" value={formatMoney(order.subtotalCents)} />
              {order.discountCents > 0 && <Row label="Discount" value={`-${formatMoney(order.discountCents)}`} />}
              {order.serviceChargeCents > 0 && (
                <Row label={`Service charge (${Math.round((settings?.serviceChargeRate ?? 0) * 100)}%)`} value={formatMoney(order.serviceChargeCents)} />
              )}
              <Row label={`VAT (${Math.round((settings?.vatRate ?? 0.13) * 100)}%)`} value={formatMoney(order.taxCents)} />
            </>
          )}
          <div style={{ borderTop: '1px solid #000', marginTop: 4, paddingTop: 4 }}>
            <Row label="TOTAL" value={formatMoney(order.totalCents)} bold />
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 10 }}>
        {isBill
          ? bt.footerText || settings?.receiptFooter || 'Thank you! Please visit again.'
          : mode === 'CANCEL' ? '— void from station —' : '— fire to station —'}
      </div>
      {isBill && bt.showWifi && settings?.wifiPassword && (
        <div style={{ textAlign: 'center', fontSize: sub, marginTop: 4 }}>WiFi: {settings.wifiPassword}</div>
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

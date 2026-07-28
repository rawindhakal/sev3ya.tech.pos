'use client';

// Rendered off-screen; becomes the only visible element when window.print()
// is called (see #print-area rules in globals.css).
// Modes: BILL (customer invoice), KOT (kitchen), BOT (bar), CANCEL (voided items).
// Layout is driven by the editable templates under Settings → Printing.
import { formatMoney } from '@/lib/api';
import { formatBs } from '@/lib/bs-date';
import { PAYMENT_METHOD_LABEL } from '@/lib/constants';
import { billTemplateOf, kotTemplateOf, ticketDate, ticketTime } from '@/lib/printing';
import type { Order, OrderItem, Settings } from '@/lib/types';

export type ReceiptMode = 'BILL' | 'KOT' | 'BOT' | 'CANCEL';

export default function Receipt({
  order,
  settings,
  mode,
  items,
  docTitle,
  copyNumber,
}: {
  order: Order | null;
  settings: Settings | null;
  mode: ReceiptMode;
  items?: OrderItem[]; // explicit items for KOT/BOT/CANCEL; defaults to the bill
  docTitle?: string;   // overrides the bill document title (Estimated Bill / Tax Invoice / Invoice)
  copyNumber?: number; // set only for reprints (e.g. from Sales Reports) — stamps "COPY #n", never on the original checkout print
}) {
  if (!order) return null;
  const now = new Date();
  const list = items ?? order.items.filter((i) => !i.cancelledAt);
  const isBill = mode === 'BILL';
  const bt = billTemplateOf(settings);
  const kt = kotTemplateOf(settings);
  const fs = isBill ? bt.fontSize : kt.fontSize;
  const bold = isBill ? bt.boldTotals : kt.boldTotals;
  const sub = Math.max(fs - 3, 9);

  const ticketTitle =
    mode === 'KOT' ? kt.kotTitle : mode === 'BOT' ? kt.botTitle : '*** ITEM CANCELLATION ***';
  const docNo = isBill
    ? order.fiscalInvoiceNo != null ? `INV-${order.fiscalInvoiceNo}` : `INV-${order.number}`
    : `${mode === 'BOT' ? 'BOT' : 'KOT'}-${String(order.number).padStart(5, '0')}`;

  // Two-column metadata grid: [label, value] pairs laid out two-per-row,
  // e.g. "Bill No: INV-89201    Date: 28-Jul-2026".
  const metaPairs: [string, string][] = isBill
    ? [
        ['Bill No', docNo],
        ['Date', ticketDate(now)],
        ['Time', ticketTime(now)],
        ...(bt.showTable && order.table ? [['Table No', order.table.name] as [string, string]] : []),
        ...(bt.showGuests ? [['Guest Count', String(order.guestCount)] as [string, string]] : []),
        ...(bt.showCashier && order.cashierName ? [['Cashier', order.cashierName] as [string, string]] : []),
      ]
    : [
        [`${mode === 'BOT' ? 'BOT' : 'KOT'} No`, docNo],
        ['Date', ticketDate(now)],
        ...(kt.showTime ? [['Time', ticketTime(now)] as [string, string]] : []),
        ...(kt.showOrderType ? [['Order Type', order.type.replace('_', ' ')] as [string, string]] : []),
        ...(kt.showTable && order.table ? [['Table No', order.table.name] as [string, string]] : []),
        ...(kt.showGuests ? [['Guest Count', String(order.guestCount)] as [string, string]] : []),
      ];
  const metaRows: [string, string][][] = [];
  for (let i = 0; i < metaPairs.length; i += 2) metaRows.push([metaPairs[i], metaPairs[i + 1]].filter(Boolean) as [string, string][]);

  const orderTakenByName = isBill ? null : (kt.showWaiter && order.waiter?.name) || null;
  // total − VAT is the correct pre-VAT base in both pricing modes: when menu
  // prices are VAT-exclusive this equals subtotal−discount+service (VAT was
  // added on top, so subtracting it back out returns exactly that); when
  // prices already include VAT, totalCents IS the chargeable base with VAT
  // embedded, so subtracting the (back-calculated) VAT portion correctly
  // reduces it — Sub Total above stays at the gross, menu-listed price
  // (matching what the customer was actually shown per item), and this line
  // is the one place VAT-inclusive pricing gets "unwound" for the invoice.
  const netBeforeTax = order.totalCents - order.taxCents;

  return (
    <div id="print-area" style={{ fontSize: fs, fontWeight: bold ? 500 : 400 }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        {isBill ? (
          <>
            <div style={{ fontSize: fs + 8, fontWeight: 800 }}>{settings?.restaurantName ?? 's3vya'}</div>
            {bt.showAddress && settings?.address && <div>{settings.address}</div>}
            {bt.showTaxId && settings?.taxId && <div>PAN/VAT No: {settings.taxId}</div>}
            {bt.showPhone && settings?.phone && <div>Contact: {settings.phone}</div>}
            <div style={{ marginTop: 3, fontWeight: 800, fontSize: fs + 1 }}>{(docTitle ?? bt.title).toUpperCase()}</div>
            {(bt.headerText || settings?.receiptHeader) && (
              <div style={{ marginTop: 4 }}>{bt.headerText || settings?.receiptHeader}</div>
            )}
            {!!copyNumber && (
              <div style={{
                marginTop: 6, display: 'inline-block', border: '2px solid #000', borderRadius: 4,
                padding: '2px 10px', fontWeight: 800, fontSize: fs + 2, letterSpacing: 1,
              }}>
                *** COPY #{copyNumber} ***
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: fs + 6, fontWeight: 800 }}>{ticketTitle}</div>
        )}
      </div>

      <div style={{ borderTop: '2px dashed #000', borderBottom: '2px dashed #000', padding: '4px 0' }}>
        {!isBill && (
          <div style={{ fontWeight: 700 }}>
            Order #{order.number}
          </div>
        )}
        {metaRows.map((pair, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '1px 0' }}>
            {pair.map(([label, value]) => (
              <span key={label}>{label}: <b>{value}</b></span>
            ))}
          </div>
        ))}
        {orderTakenByName && <div style={{ padding: '1px 0' }}>Order Taken By: <b>{orderTakenByName}</b></div>}
        {isBill && bt.showWaiter && order.waiter && <div style={{ padding: '1px 0' }}>Waiter: <b>{order.waiter.name}</b></div>}
        {isBill && bt.showCustomer && order.customerName && (
          <div style={{ padding: '1px 0' }}>Customer: {order.customerName}{order.customerPhone ? ` (${order.customerPhone})` : ''}</div>
        )}
        {isBill && <div style={{ fontSize: sub, marginTop: 2 }}>BS {formatBs(now)}</div>}
      </div>

      <table style={{ width: '100%', marginTop: 6, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #000' }}>
            <th style={{ textAlign: 'center', width: '2.2em' }}>Qty</th>
            <th style={{ textAlign: 'left' }}>Item</th>
            {isBill && bt.showRate && <th style={{ textAlign: 'right' }}>Rate</th>}
            {isBill && <th style={{ textAlign: 'right' }}>Amount</th>}
          </tr>
        </thead>
        <tbody>
          {list.map((it) => {
            const mods = Array.isArray(it.modifiers) ? it.modifiers : [];
            const modCents = mods.reduce((s, m) => s + m.priceCents, 0);
            const rate = it.unitPriceCents + modCents;
            const lineTotal = rate * it.quantity;
            const showNotes = isBill ? bt.showItemNotes : kt.showItemNotes;
            return (
              <tr key={it.id} style={{ verticalAlign: 'top' }}>
                <td style={{ textAlign: 'center', fontWeight: 800, padding: '3px 0' }}>{it.quantity}</td>
                <td style={{ textAlign: 'left', fontWeight: bold ? 700 : 500, padding: '3px 0' }}>
                  {mode === 'CANCEL' ? '❌ ' : ''}{it.nameSnapshot}
                  {mods.length > 0 && <div style={{ fontSize: sub, fontWeight: 400 }}>+ {mods.map((m) => m.name).join(', ')}</div>}
                  {showNotes && it.notes && <div style={{ fontSize: sub, fontStyle: 'italic', fontWeight: 400 }}>» {it.notes}</div>}
                </td>
                {isBill && bt.showRate && <td style={{ textAlign: 'right' }}>{(rate / 100).toFixed(2)}</td>}
                {isBill && <td style={{ textAlign: 'right' }}>{formatMoney(lineTotal)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>

      {isBill && (
        <div style={{ borderTop: '2px dashed #000', marginTop: 6, paddingTop: 4 }}>
          {bt.showVatBreakdown && (
            <>
              <Row label="Sub Total" value={formatMoney(order.subtotalCents)} />
              {order.discountCents > 0 && (
                <Row label={order.discountLabel ? `Discount (${order.discountLabel})` : 'Discount'} value={`-${formatMoney(order.discountCents)}`} />
              )}
              {order.serviceChargeCents > 0 && (
                <Row label={`Service charge (${Math.round((settings?.serviceChargeRate ?? 0) * 100)}%)`} value={formatMoney(order.serviceChargeCents)} />
              )}
              {settings?.pricesIncludeVat && (
                <Row label="Net Amount Before Tax" value={formatMoney(netBeforeTax)} />
              )}
              <Row label={`VAT (${Math.round((settings?.vatRate ?? 0.13) * 100)}%)`} value={formatMoney(order.taxCents)} />
            </>
          )}
          <div style={{ borderTop: '2px solid #000', marginTop: 4, paddingTop: 4 }}>
            <Row label="GRAND TOTAL" value={formatMoney(order.totalCents)} bold big />
          </div>
        </div>
      )}

      {isBill && bt.showPaymentMode && order.payments && order.payments.length > 0 && (
        <div style={{ borderTop: '2px dashed #000', marginTop: 6, paddingTop: 4 }}>
          {order.payments.map((p) => (
            <div key={p.id}>
              Payment Mode: <b>{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</b>{p.gatewayRef ? ` (Txn ID: ${p.gatewayRef})` : ''} — {formatMoney(p.amountCents)}
            </div>
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 10, fontWeight: 700 }}>
        {isBill
          ? bt.footerText || settings?.receiptFooter || 'Thank you! Please visit again.'
          : mode === 'CANCEL' ? '— void from station —' : '— fire to station —'}
      </div>
      {isBill && bt.showWifi && settings?.wifiPassword && (
        <div style={{ textAlign: 'center', fontSize: sub, marginTop: 4, fontWeight: 400 }}>WiFi: {settings.wifiPassword}</div>
      )}
    </div>
  );
}

function Row({ label, value, bold, big }: { label: string; value: string; bold?: boolean; big?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 800 : 400, fontSize: big ? '1.15em' : undefined }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

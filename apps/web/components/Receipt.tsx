'use client';

// Rendered off-screen; becomes the only visible element when window.print()
// is called (see #print-area rules in globals.css).
// Modes: BILL (customer invoice), KOT (kitchen), BOT (bar), CANCEL (voided items).
// Layout is driven by the editable templates under Settings → Printing.
import { formatMoney, formatMoneyPlain, formatMoneyRounded } from '@/lib/api';
import { formatBs } from '@/lib/bs-date';
import { PAYMENT_METHOD_LABEL } from '@/lib/constants';
import { amountInWords } from '@/lib/number-to-words';
import { billTemplateOf, kotTemplateOf, kotMetaPairs, ticketDate, ticketTime } from '@/lib/printing';
import type { TemplateLine } from '@/lib/printing';
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
  // number === 0 is the "not yet assigned" sentinel for an order that was
  // created offline and hasn't synced to the server yet — there is no real
  // fiscal invoice number (or order number) until it does, so show a
  // provisional placeholder instead of a misleading INV-0 / KOT-00000.
  const unsynced = order.number === 0;
  const docNo = order.fiscalInvoiceNo != null ? `INV-${order.fiscalInvoiceNo}` : unsynced ? 'PROVISIONAL' : `INV-${order.number}`;
  // Bill amounts respect the "Currency symbol" toggle; KOT/BOT never show
  // money at all so this only matters in the isBill branches below.
  const money = bt.showCurrencySymbol ? formatMoney : formatMoneyPlain;

  // Resolves a bill metaLine's id to its live value for this order — mirrors
  // kotMetaPairs' own per-id resolver (lib/printing.ts) so both templates'
  // "every line customizable" behavior works the same way.
  const billMetaValueOf = (id: string): string | null => {
    switch (id) {
      case 'time': return ticketTime(now);
      case 'table': return order.table?.name || null;
      case 'guestCount': return String(order.guestCount);
      case 'cashier': return order.cashierName || null;
      case 'waiter': return order.waiter?.name || null;
      case 'customer': return order.customerName ? `${order.customerName}${order.customerPhone ? ` (${order.customerPhone})` : ''}` : null;
      case 'area': return order.table?.area || null;
      case 'fiscalYear': return order.fiscalYear || null;
      case 'terminal': return order.terminal?.name || null;
      case 'nepaliDate': return formatBs(now);
      default: return null;
    }
  };
  // Two-column metadata grid: [label, value] pairs laid out two-per-row,
  // e.g. "Bill No: INV-89201    Date: 28-Jul-2026". Bill No/Date always
  // print first, fixed — every other line's visibility/label/order comes
  // from the template (Settings → Printing).
  const metaPairs: [string, string][] = isBill
    ? [
        ['Bill No', docNo] as [string, string],
        ['Date', ticketDate(now)] as [string, string],
        ...[...bt.metaLines]
          .sort((a, b) => a.order - b.order)
          .filter((l) => l.enabled)
          .map((l): [string, string | null] => [l.label, billMetaValueOf(l.id)])
          .filter((pair): pair is [string, string] => pair[1] != null),
      ]
    // Shared with kotTicketHtml (lib/printing.ts) — the exact same function
    // builds the auto-printed KOT/BOT's meta grid, so a manually-printed
    // ticket and an auto-printed one always show identical fields/order.
    : kotMetaPairs({
        template: kt,
        station: mode === 'BOT' ? 'BAR' : 'KITCHEN',
        // Dedicated daily KOT/BOT ticket number — falls back to the order
        // number only if this order predates the ticket-numbering feature
        // or hasn't synced yet (never has one assigned).
        ticketNo: (mode === 'BOT' ? order.botNo : order.kotNo) ?? order.number,
        orderType: order.type,
        table: order.table?.name,
        waiter: order.waiter?.name,
        guestCount: order.guestCount,
        unsynced,
      });
  const metaRows: [string, string][][] = [];
  for (let i = 0; i < metaPairs.length; i += 2) metaRows.push([metaPairs[i], metaPairs[i + 1]].filter(Boolean) as [string, string][]);

  // total − VAT is the correct pre-VAT base in both pricing modes: when menu
  // prices are VAT-exclusive this equals subtotal−discount+service (VAT was
  // added on top, so subtracting it back out returns exactly that); when
  // prices already include VAT, totalCents IS the chargeable base with VAT
  // embedded, so subtracting the (back-calculated) VAT portion correctly
  // reduces it — Sub Total above stays at the gross, menu-listed price
  // (matching what the customer was actually shown per item), and this line
  // is the one place VAT-inclusive pricing gets "unwound" for the invoice.
  const netBeforeTax = order.totalCents - order.taxCents;
  // Only meaningful for a cash tender the cashier over-typed on — most
  // orders settle exactly, so this is 0 (and the Received/Change block
  // stays hidden) the overwhelming majority of the time.
  const totalReceivedCents = (order.payments ?? []).reduce((s, p) => s + (p.receivedCents ?? p.amountCents), 0);
  const totalAppliedCents = (order.payments ?? []).reduce((s, p) => s + p.amountCents, 0);
  const changeDueCents = totalReceivedCents - totalAppliedCents;

  return (
    <div id="print-area" style={{ fontSize: fs, fontWeight: bold ? 500 : 400, fontFamily: isBill ? bt.fontFamily : kt.fontFamily }}>
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
            Order {unsynced ? 'OFFLINE' : `#${order.number}`}
          </div>
        )}
        {isBill && bt.metaLayout === 'list'
          ? metaPairs.map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '1px 0' }}>
                <span>{label}: <b>{value}</b></span>
              </div>
            ))
          : metaRows.map((pair, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '1px 0' }}>
                {pair.map(([label, value]) => (
                  <span key={label}>{label}: <b>{value}</b></span>
                ))}
              </div>
            ))}
      </div>

      <table style={{ width: '100%', marginTop: 6, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #000' }}>
            <th style={{ textAlign: 'center', width: '2.2em' }}>Qty</th>
            <th style={{ textAlign: 'left' }}>Item</th>
            {isBill && bt.showHsCode && <th style={{ textAlign: 'left' }}>HS Code</th>}
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
                {isBill && bt.showHsCode && <td style={{ textAlign: 'left' }}>{it.hsCodeSnapshot || '—'}</td>}
                {isBill && bt.showRate && <td style={{ textAlign: 'right' }}>{(rate / 100).toFixed(2)}</td>}
                {isBill && <td style={{ textAlign: 'right' }}>{money(lineTotal)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>

      {isBill && (
        <div style={{ borderTop: '2px dashed #000', marginTop: 6, paddingTop: 4 }}>
          {[...bt.totalsLines]
            .sort((a, b) => a.order - b.order)
            .filter((l) => l.enabled)
            .map((l) => totalsRowFor(l, order, settings, netBeforeTax, money))
            .filter((row): row is { label: string; value: string } => row != null)
            .map((row) => <Row key={row.label} label={row.label} value={row.value} />)}
          <div style={{ borderTop: '2px solid #000', marginTop: 4, paddingTop: 4 }}>
            <Row label="GRAND TOTAL" value={bt.showCurrencySymbol ? formatMoney(order.totalCents) : formatMoneyRounded(order.totalCents)} bold big />
          </div>
        </div>
      )}

      {isBill && bt.showAmountInWords && (
        <div style={{ marginTop: 4 }}>In Words: {amountInWords(order.totalCents)}</div>
      )}

      {isBill && bt.showPaymentMode && order.payments && order.payments.length > 0 && (
        <div style={{
          borderTop: '2px dashed #000', marginTop: 6, paddingTop: 4,
          ...(bt.boxedPaymentMode ? { border: '1px solid #000', borderRadius: 3, padding: '4px 6px' } : {}),
        }}>
          {order.payments.map((p) => (
            <div key={p.id}>
              Payment Mode: <b>{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</b>{p.gatewayRef ? ` (Txn ID: ${p.gatewayRef})` : ''} — {money(p.amountCents)}
            </div>
          ))}
        </div>
      )}

      {isBill && bt.showReceivedChange && changeDueCents > 0 && (
        <div style={{ marginTop: 4 }}>
          <Row label="Received Amount" value={money(totalReceivedCents)} />
          <Row label="Change" value={money(changeDueCents)} />
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
      {isBill && bt.showSignatureLines && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, fontSize: sub }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '9em', borderTop: '1px solid #000', marginBottom: 2 }} />
            Cashier
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '9em', borderTop: '1px solid #000', marginBottom: 2 }} />
            Customer
          </div>
        </div>
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

// Resolves a totalsLine's id to its live label/value for this order — each
// money row only appears when its underlying amount actually applies (a
// zero discount/service charge stays hidden even if the line is enabled),
// same gating as before this became template-driven. Grand Total is not
// part of this list — it's always rendered fixed, last.
function totalsRowFor(
  line: TemplateLine,
  order: Order,
  settings: Settings | null,
  netBeforeTax: number,
  money: (cents: number) => string,
): { label: string; value: string } | null {
  switch (line.id) {
    case 'subtotal':
      return { label: line.label, value: money(order.subtotalCents) };
    case 'discount':
      if (order.discountCents <= 0) return null;
      return { label: order.discountLabel ? `${line.label} (${order.discountLabel})` : line.label, value: `-${money(order.discountCents)}` };
    case 'serviceCharge':
      if (order.serviceChargeCents <= 0) return null;
      return { label: `${line.label} (${Math.round((settings?.serviceChargeRate ?? 0) * 100)}%)`, value: money(order.serviceChargeCents) };
    case 'netBeforeTax':
      if (!settings?.pricesIncludeVat) return null;
      return { label: line.label, value: money(netBeforeTax) };
    case 'vat':
      return { label: `${line.label} (${Math.round((settings?.vatRate ?? 0.13) * 100)}%)`, value: money(order.taxCents) };
    default:
      return null;
  }
}

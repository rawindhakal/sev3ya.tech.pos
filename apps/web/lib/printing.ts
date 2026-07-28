// Printing support: ticket templates (editable under Settings → Printing),
// per-device printer preferences, and standalone ticket HTML for the desktop
// shell's silent printer.

import type { Settings } from './types';
import { notify } from './dialog';

// ── Desktop bridge typing (exposed by apps/desktop/preload.js) ──
export interface DesktopPrinter { name: string; displayName: string; isDefault: boolean }
declare global {
  interface Window {
    cakezakeDesktop?: {
      isDesktop: boolean;
      platform: string;
      listPrinters?: () => Promise<DesktopPrinter[]>;
      printHtml?: (opts: { html: string; printerName?: string; widthMm?: number }) => Promise<{ ok: boolean; error?: string; warning?: string }>;
      // Remembered cashier session (Remember me / auto sign-in), encrypted
      // via the OS keychain in the main process.
      saveCreds?: (restaurant: string, username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
      loadCreds?: () => Promise<{ restaurant: string; username: string; password: string } | null>;
      clearCreds?: () => Promise<{ ok: boolean }>;
    };
  }
}

export const isDesktopShell = () =>
  typeof window !== 'undefined' && !!window.cakezakeDesktop?.isDesktop;

// ── Templates ────────────────────────────────────────
export interface BillTemplate {
  title: string;            // e.g. "Tax Invoice"
  headerText: string;       // promo line under the header
  footerText: string;       // thank-you line
  fontSize: number;         // base px
  paperWidthMm: 58 | 80;
  boldTotals: boolean;      // bold + larger totals/header for legibility on thermal paper
  showAddress: boolean;
  showPhone: boolean;
  showTaxId: boolean;
  showTable: boolean;
  showWaiter: boolean;
  showGuests: boolean;
  showCustomer: boolean;
  showItemNotes: boolean;
  showVatBreakdown: boolean;
  showRate: boolean;        // per-unit rate column in the item table
  showCashier: boolean;
  showPaymentMode: boolean; // payment method + gateway/txn ref, once paid
  showWifi: boolean;
}

export interface KotTemplate {
  kotTitle: string;
  botTitle: string;
  fontSize: number;
  paperWidthMm: 58 | 80;
  boldTotals: boolean;
  showOrderType: boolean;
  showTable: boolean;
  showWaiter: boolean;
  showGuests: boolean;
  showTime: boolean;
  showItemNotes: boolean;
}

export const DEFAULT_BILL_TEMPLATE: BillTemplate = {
  title: 'Tax Invoice',
  headerText: '',
  footerText: 'Thank you! Please visit again.',
  fontSize: 14,
  paperWidthMm: 80,
  boldTotals: true,
  showAddress: true,
  showPhone: true,
  showTaxId: true,
  showTable: true,
  showWaiter: true,
  showGuests: true,
  showCustomer: true,
  showItemNotes: true,
  showVatBreakdown: true,
  showRate: true,
  showCashier: true,
  showPaymentMode: true,
  showWifi: true,
};

export const DEFAULT_KOT_TEMPLATE: KotTemplate = {
  kotTitle: '*** KITCHEN ORDER — KOT ***',
  botTitle: '*** BAR ORDER — BOT ***',
  fontSize: 15,
  paperWidthMm: 80,
  boldTotals: true,
  showOrderType: true,
  showTable: true,
  showWaiter: true,
  showGuests: true,
  showTime: true,
  showItemNotes: true,
};

export const billTemplateOf = (s: Settings | null | undefined): BillTemplate => ({
  ...DEFAULT_BILL_TEMPLATE,
  ...((s?.billTemplate as Partial<BillTemplate>) ?? {}),
});
export const kotTemplateOf = (s: Settings | null | undefined): KotTemplate => ({
  ...DEFAULT_KOT_TEMPLATE,
  ...((s?.kotTemplate as Partial<KotTemplate>) ?? {}),
});

// ── Per-device printer preferences (this till's printers) ──
export interface PrinterPrefs {
  kot?: string;  // kitchen ticket printer
  bot?: string;  // bar ticket printer
  bill?: string; // customer bill printer
  autoPrintKot: boolean;
}

const PREFS_KEY = 's3vya-printers';

export function getPrinterPrefs(): PrinterPrefs {
  if (typeof window === 'undefined') return { autoPrintKot: true };
  try {
    return { autoPrintKot: true, ...(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<PrinterPrefs>) };
  } catch {
    return { autoPrintKot: true };
  }
}

export function savePrinterPrefs(p: PrinterPrefs) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
}

// ── KOT queue item (from GET /orders/kot-queue) ──────
export interface KotQueueItem {
  id: string;
  orderId: string;
  orderNumber: number;
  orderType: string;
  table: string | null;
  waiter: string | null;
  guestCount?: number | null;
  name: string;
  quantity: number;
  station: 'KITCHEN' | 'BAR' | 'BILLING';
  notes?: string | null;
  modifiers?: { name: string }[] | null;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// "28-Jul-2026" / "07:15 PM" — matches the printed-ticket convention used
// throughout the restaurant (bills, KOT, BOT all share this format).
export const ticketDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
export const ticketTime = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

// Silently print whatever is currently rendered in #print-area (Receipt /
// DayReport) through the desktop shell — no printer dialog. The components use
// inline styles, so the captured markup is self-contained. Returns false when
// not in the desktop shell (caller falls back to window.print()).
export async function silentPrintArea(opts: { printer?: string; widthMm?: number; fontSize?: number }): Promise<boolean> {
  if (typeof window === 'undefined' || !window.cakezakeDesktop?.printHtml) return false; // not the desktop shell — caller falls back to window.print()
  const el = document.getElementById('print-area');
  if (!el) return false;
  const w = opts.widthMm ?? 80;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 0; }
    body { font-family: ui-monospace, Menlo, monospace; color: #000; background: #fff;
           width: ${w - 6}mm; margin: 0 auto; padding: 4px 2px; font-size: ${opts.fontSize ?? 12}px; }
    #print-area { display: block !important; }
    table { border-collapse: collapse; }
    th, td { padding: 1px 0; }
  </style></head><body>${el.outerHTML}</body></html>`;
  try {
    const res = await window.cakezakeDesktop.printHtml!({ html, printerName: opts.printer, widthMm: w });
    if (!res?.ok) {
      notify(`Silent print failed: ${res?.error || 'unknown error'} — falling back to the print dialog.`, 'error');
      return false;
    }
    if (res.warning) notify(res.warning, 'info');
    return true;
  } catch (err) {
    notify(`Silent print failed: ${(err as Error).message} — falling back to the print dialog.`, 'error');
    return false;
  }
}

// Standalone, self-contained ticket HTML for silent printing in the desktop
// shell (thermal-receipt style, monospace, no external assets).
export function kotTicketHtml(opts: {
  template: KotTemplate;
  station: 'KITCHEN' | 'BAR';
  orderNumber: number;
  orderType: string;
  table?: string | null;
  waiter?: string | null;
  guestCount?: number | null;
  items: KotQueueItem[];
}): string {
  const t = opts.template;
  const title = opts.station === 'BAR' ? t.botTitle : t.kotTitle;
  const now = new Date();
  const kotNo = `K-${String(opts.orderNumber).padStart(5, '0')}`;
  const rows = opts.items
    .map(
      (i) => `
      <tr>
        <td class="nm">${esc(i.name)}${
          Array.isArray(i.modifiers) && i.modifiers.length
            ? `<div class="sub">+ ${esc(i.modifiers.map((m) => m.name).join(', '))}</div>`
            : ''
        }${t.showItemNotes && i.notes ? `<div class="sub it">» ${esc(i.notes)}</div>` : ''}</td>
        <td class="qty">${i.quantity}</td>
      </tr>`,
    )
    .join('');
  // Two-column metadata grid — matches the printed convention:
  //   KOT No: K-10492           Date: 28-Jul-2026
  //   Time: 07:15 PM            Order Type: Dine-In
  //   Table No: T-04            Guest Count: 4
  //   Order Taken By: Captain Ramesh
  const meta: [string, string][] = [
    [`${opts.station === 'BAR' ? 'BOT' : 'KOT'} No`, kotNo],
    ['Date', ticketDate(now)],
  ];
  if (t.showTime) meta.push(['Time', ticketTime(now)]);
  if (t.showOrderType) meta.push(['Order Type', opts.orderType.replace('_', ' ')]);
  if (t.showTable && opts.table) meta.push(['Table No', opts.table]);
  if (t.showGuests && opts.guestCount) meta.push(['Guest Count', String(opts.guestCount)]);
  const metaRows: string[] = [];
  for (let i = 0; i < meta.length; i += 2) {
    const [l1, v1] = meta[i];
    const pair = meta[i + 1];
    metaRows.push(
      `<div class="row"><span>${esc(l1)}: <b>${esc(v1)}</b></span>${pair ? `<span>${esc(pair[0])}: <b>${esc(pair[1])}</b></span>` : ''}</div>`,
    );
  }
  const orderTakenBy = t.showWaiter && opts.waiter ? `<div class="row"><span>Order Taken By: <b>${esc(opts.waiter)}</b></span></div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 0; }
    body { font-family: ui-monospace, Menlo, monospace; font-size: ${t.fontSize}px; font-weight: ${t.boldTotals ? 600 : 400}; color: #000;
           width: ${t.paperWidthMm - 6}mm; margin: 0 auto; padding: 4px 2px; }
    .ttl { text-align: center; font-weight: 800; font-size: ${t.fontSize + 6}px; margin-bottom: 4px; }
    .meta { border-top: 2px dashed #000; border-bottom: 2px dashed #000; padding: 4px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { border-bottom: 2px solid #000; text-align: left; font-size: ${t.fontSize}px; padding-bottom: 2px; }
    th.qty, td.qty { text-align: center; width: 2.5em; vertical-align: top; font-weight: 800; }
    td.nm { padding: 3px 0; font-weight: ${t.boldTotals ? 700 : 500}; }
    .sub { font-size: ${Math.max(t.fontSize - 3, 9)}px; font-weight: 400; }
    .it { font-style: italic; }
    .foot { text-align: center; margin-top: 8px; font-size: ${Math.max(t.fontSize - 2, 10)}px; font-weight: 700; }
  </style></head><body>
    <div class="ttl">${esc(title)}</div>
    <div class="meta">
      ${metaRows.join('')}
      ${orderTakenBy}
    </div>
    <table><thead><tr><th>Item</th><th class="qty">Qty</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="foot">— fire to station —</div>
  </body></html>`;
}

// Printing support: ticket templates (editable under Settings → Printing),
// per-device printer preferences, and standalone ticket HTML for the desktop
// shell's silent printer.

import type { Settings } from './types';

// ── Desktop bridge typing (exposed by apps/desktop/preload.js) ──
export interface DesktopPrinter { name: string; displayName: string; isDefault: boolean }
declare global {
  interface Window {
    cakezakeDesktop?: {
      isDesktop: boolean;
      platform: string;
      listPrinters?: () => Promise<DesktopPrinter[]>;
      printHtml?: (opts: { html: string; printerName?: string; widthMm?: number }) => Promise<{ ok: boolean; error?: string }>;
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
  showAddress: boolean;
  showPhone: boolean;
  showTaxId: boolean;
  showTable: boolean;
  showWaiter: boolean;
  showGuests: boolean;
  showCustomer: boolean;
  showItemNotes: boolean;
  showVatBreakdown: boolean;
  showWifi: boolean;
}

export interface KotTemplate {
  kotTitle: string;
  botTitle: string;
  fontSize: number;
  paperWidthMm: 58 | 80;
  showOrderType: boolean;
  showTable: boolean;
  showWaiter: boolean;
  showTime: boolean;
  showItemNotes: boolean;
}

export const DEFAULT_BILL_TEMPLATE: BillTemplate = {
  title: 'Tax Invoice',
  headerText: '',
  footerText: 'Thank you! Please visit again.',
  fontSize: 12,
  paperWidthMm: 80,
  showAddress: true,
  showPhone: true,
  showTaxId: true,
  showTable: true,
  showWaiter: true,
  showGuests: true,
  showCustomer: true,
  showItemNotes: true,
  showVatBreakdown: true,
  showWifi: true,
};

export const DEFAULT_KOT_TEMPLATE: KotTemplate = {
  kotTitle: '*** KITCHEN ORDER — KOT ***',
  botTitle: '*** BAR ORDER — BOT ***',
  fontSize: 13,
  paperWidthMm: 80,
  showOrderType: true,
  showTable: true,
  showWaiter: true,
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
  name: string;
  quantity: number;
  station: 'KITCHEN' | 'BAR' | 'BILLING';
  notes?: string | null;
  modifiers?: { name: string }[] | null;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Standalone, self-contained ticket HTML for silent printing in the desktop
// shell (thermal-receipt style, monospace, no external assets).
export function kotTicketHtml(opts: {
  template: KotTemplate;
  station: 'KITCHEN' | 'BAR';
  orderNumber: number;
  orderType: string;
  table?: string | null;
  waiter?: string | null;
  items: KotQueueItem[];
}): string {
  const t = opts.template;
  const title = opts.station === 'BAR' ? t.botTitle : t.kotTitle;
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
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 0; }
    body { font-family: ui-monospace, Menlo, monospace; font-size: ${t.fontSize}px; color: #000;
           width: ${t.paperWidthMm - 6}mm; margin: 0 auto; padding: 4px 2px; }
    .ttl { text-align: center; font-weight: 700; font-size: ${t.fontSize + 3}px; margin-bottom: 4px; }
    .meta { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 3px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { border-bottom: 1px solid #000; text-align: left; }
    th.qty, td.qty { text-align: center; width: 2.5em; vertical-align: top; }
    td.nm { padding: 2px 0; }
    .sub { font-size: ${Math.max(t.fontSize - 3, 8)}px; }
    .it { font-style: italic; }
    .foot { text-align: center; margin-top: 8px; font-size: ${Math.max(t.fontSize - 2, 9)}px; }
  </style></head><body>
    <div class="ttl">${esc(title)}</div>
    <div class="meta">
      <div>Order #${esc(opts.orderNumber)}${t.showOrderType ? ` · ${esc(opts.orderType.replace('_', ' '))}` : ''}</div>
      ${t.showTable && opts.table ? `<div>Table: ${esc(opts.table)}</div>` : ''}
      ${t.showWaiter && opts.waiter ? `<div>Waiter: ${esc(opts.waiter)}</div>` : ''}
      ${t.showTime ? `<div>${esc(new Date().toLocaleString())}</div>` : ''}
    </div>
    <table><thead><tr><th>Item</th><th class="qty">Qty</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="foot">— fire to station —</div>
  </body></html>`;
}

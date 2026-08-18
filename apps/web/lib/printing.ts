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
// A single customizable row on the bill/KOT — its visibility, display
// label, and position are all user-editable (Settings → Printing), instead
// of being fixed by source order like every other field on the template.
export interface TemplateLine {
  id: string;      // stable key the renderer resolves to a live value
  enabled: boolean;
  label: string;   // user-editable display label
  order: number;   // sort key within its section
}

// Curated, web-safe font stacks only — no external font loading, so every
// option is guaranteed to render identically through Chromium's print
// pipeline (both the desktop shell's silent print and the browser print
// dialog), with no FOUT/unavailable-font risk on an unattended till.
export const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'ui-monospace, Menlo, monospace', label: 'Monospace (classic receipt)' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial (sans-serif)' },
  { value: '"Segoe UI", Roboto, system-ui, sans-serif', label: 'System sans-serif' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana (sans-serif)' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma (sans-serif)' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia (serif)' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New (monospace)' },
];
const DEFAULT_FONT_FAMILY = FONT_OPTIONS[0].value;

export interface BillTemplate {
  title: string;            // e.g. "Tax Invoice"
  headerText: string;       // promo line under the header
  footerText: string;       // thank-you line
  fontSize: number;         // base px
  fontFamily: string;
  paperWidthMm: 58 | 80;
  marginMm: number;         // blank space left/right of the printed content, on top of paperWidthMm
  boldTotals: boolean;      // bold + larger totals/header for legibility on thermal paper
  showAddress: boolean;
  showPhone: boolean;
  showTaxId: boolean;
  // Order-info block (Bill No/Date always print first, fixed) — every other
  // row's visibility, label, and order is user-editable.
  metaLines: TemplateLine[];
  showItemNotes: boolean;
  // Money rows between the item table and Grand Total (which always prints
  // fixed, last) — visibility, label, and order all user-editable.
  totalsLines: TemplateLine[];
  showRate: boolean;        // per-unit rate column in the item table
  showPaymentMode: boolean; // payment method + gateway/txn ref, once paid
  showWifi: boolean;
  showCurrencySymbol: boolean; // false = plain numbers, no "Rs" prefix
  // 'grid' = today's two-per-row pairing; 'list' = one line per row.
  metaLayout: 'grid' | 'list';
  showHsCode: boolean;         // adds an HS Code column to the item table
  showAmountInWords: boolean;  // "In Words: One Thousand Fifteen Only", after Grand Total
  showReceivedChange: boolean; // Received Amount / Change, when a cash tender overpaid
  showSignatureLines: boolean; // blank Cashier / Customer signature lines at the bottom
  boxedPaymentMode: boolean;   // draws a border around the Payment Mode section
  paymentModeSideBySide: boolean; // Payment Mode box to the left, totals stacked to the right, instead of stacked vertically
}

export interface KotTemplate {
  kotTitle: string;
  botTitle: string;
  fontSize: number;
  fontFamily: string;
  paperWidthMm: 58 | 80;
  marginMm: number;         // blank space left/right of the printed content, on top of paperWidthMm
  boldTotals: boolean;
  // Order-info block (KOT/BOT No + Date always print first, fixed) — every
  // other row's visibility, label, and order is user-editable.
  metaLines: TemplateLine[];
  showItemNotes: boolean;
}

const DEFAULT_BILL_META_LINES: TemplateLine[] = [
  { id: 'panNo', enabled: false, label: 'Pan No', order: 0 },
  { id: 'time', enabled: true, label: 'Time', order: 1 },
  // 'table' shows the table's NAME (e.g. "T1") — 'tableNo' below is the
  // separate numeric Table No some tenants also track.
  { id: 'table', enabled: true, label: 'Table Name', order: 2 },
  { id: 'tableNo', enabled: false, label: 'Table No', order: 3 },
  { id: 'guestCount', enabled: true, label: 'Guest Count', order: 4 },
  { id: 'cashier', enabled: true, label: 'Cashier', order: 5 },
  { id: 'waiter', enabled: true, label: 'Waiter', order: 6 },
  { id: 'customer', enabled: true, label: 'Customer', order: 7 },
  { id: 'area', enabled: false, label: 'Area', order: 8 },
  { id: 'fiscalYear', enabled: false, label: 'Fiscal Year', order: 9 },
  { id: 'terminal', enabled: false, label: 'Service Provider', order: 10 },
  // Was a hardcoded, always-on line ("BS {date}") before this became
  // customizable — defaults enabled so nothing disappears from an existing
  // tenant's bill.
  { id: 'nepaliDate', enabled: true, label: 'Nepali Date', order: 11 },
  { id: 'transactionDate', enabled: false, label: 'Transaction Date', order: 12 },
  { id: 'invoiceIssueDate', enabled: false, label: 'Invoice Issue Date', order: 13 },
];
const DEFAULT_BILL_TOTALS_LINES: TemplateLine[] = [
  { id: 'subtotal', enabled: true, label: 'Sub Total', order: 0 },
  { id: 'discount', enabled: true, label: 'Discount', order: 1 },
  { id: 'serviceCharge', enabled: true, label: 'Service charge', order: 2 },
  { id: 'total', enabled: false, label: 'Total', order: 3 },
  { id: 'netBeforeTax', enabled: true, label: 'Net Amount Before Tax', order: 4 },
  { id: 'taxableAmt', enabled: false, label: 'Taxable AMT', order: 5 },
  { id: 'vat', enabled: true, label: 'VAT', order: 6 },
];
const DEFAULT_KOT_META_LINES: TemplateLine[] = [
  { id: 'time', enabled: true, label: 'Time', order: 0 },
  { id: 'orderType', enabled: true, label: 'Order Type', order: 1 },
  { id: 'table', enabled: true, label: 'Table Name', order: 2 },
  { id: 'tableNo', enabled: false, label: 'Table No', order: 3 },
  { id: 'area', enabled: false, label: 'Table Area', order: 4 },
  { id: 'guestCount', enabled: true, label: 'Guest Count', order: 5 },
  { id: 'waiter', enabled: true, label: 'Order Taken By', order: 6 },
  { id: 'userName', enabled: false, label: 'UserName', order: 7 },
  { id: 'serviceProvider', enabled: false, label: 'Service Provider', order: 8 },
];

export const DEFAULT_BILL_TEMPLATE: BillTemplate = {
  title: 'Tax Invoice',
  headerText: '',
  footerText: 'Thank you! Please visit again.',
  fontSize: 14,
  fontFamily: DEFAULT_FONT_FAMILY,
  paperWidthMm: 80,
  marginMm: 4,
  boldTotals: true,
  showAddress: true,
  showPhone: true,
  showTaxId: true,
  metaLines: DEFAULT_BILL_META_LINES,
  showItemNotes: true,
  totalsLines: DEFAULT_BILL_TOTALS_LINES,
  showRate: true,
  showPaymentMode: true,
  showWifi: true,
  showCurrencySymbol: true,
  metaLayout: 'grid',
  showHsCode: false,
  showAmountInWords: false,
  showReceivedChange: false,
  showSignatureLines: false,
  boxedPaymentMode: false,
  paymentModeSideBySide: false,
};

export const DEFAULT_KOT_TEMPLATE: KotTemplate = {
  kotTitle: '*** KITCHEN ORDER — KOT ***',
  botTitle: '*** BAR ORDER — BOT ***',
  fontSize: 15,
  fontFamily: DEFAULT_FONT_FAMILY,
  paperWidthMm: 80,
  marginMm: 4,
  boldTotals: true,
  metaLines: DEFAULT_KOT_META_LINES,
  showItemNotes: true,
};

// Pre-this-feature saved shape — kept only so an existing tenant's current
// on/off choices survive the one-time migration below instead of silently
// resetting to "everything enabled."
interface LegacyBillFields {
  showTable?: boolean; showWaiter?: boolean; showGuests?: boolean;
  showCustomer?: boolean; showCashier?: boolean; showVatBreakdown?: boolean;
}
interface LegacyKotFields {
  showOrderType?: boolean; showTable?: boolean; showWaiter?: boolean;
  showGuests?: boolean; showTime?: boolean;
}

// Ensures every id in `defaults` exists in `lines`, appending any missing
// ones (in their own default enabled/label, ordered after whatever's
// already there) — so a template saved before a given line id existed
// still picks it up on the next read instead of silently missing it
// forever. Cheap no-op once nothing's missing. General-purpose: this keeps
// working the same way for any future new line id, not just this deploy's.
function withMissingLines(lines: TemplateLine[], defaults: TemplateLine[]): TemplateLine[] {
  const have = new Set(lines.map((l) => l.id));
  const missing = defaults.filter((d) => !have.has(d.id));
  if (!missing.length) return lines;
  const maxOrder = lines.reduce((m, l) => Math.max(m, l.order), -1);
  return [...lines, ...missing.map((d, i) => ({ ...d, order: maxOrder + 1 + i }))];
}

export const billTemplateOf = (s: Settings | null | undefined): BillTemplate => {
  const saved = ((s?.billTemplate as (Partial<BillTemplate> & LegacyBillFields)) ?? {});
  const hasLegacyMetaFields = 'showTable' in saved || 'showWaiter' in saved || 'showGuests' in saved || 'showCustomer' in saved || 'showCashier' in saved;
  const metaLinesBase = saved.metaLines ?? (hasLegacyMetaFields
    ? DEFAULT_BILL_META_LINES.map((l) => ({
        ...l,
        enabled:
          l.id === 'table' ? saved.showTable ?? l.enabled
          : l.id === 'waiter' ? saved.showWaiter ?? l.enabled
          : l.id === 'guestCount' ? saved.showGuests ?? l.enabled
          : l.id === 'cashier' ? saved.showCashier ?? l.enabled
          : l.id === 'customer' ? saved.showCustomer ?? l.enabled
          : l.enabled, // 'time' had no prior toggle — stays enabled
      }))
    : DEFAULT_BILL_META_LINES);
  const metaLines = withMissingLines(metaLinesBase, DEFAULT_BILL_META_LINES);
  const totalsLines = saved.totalsLines ?? ('showVatBreakdown' in saved
    ? DEFAULT_BILL_TOTALS_LINES.map((l) => ({ ...l, enabled: saved.showVatBreakdown ?? l.enabled }))
    : DEFAULT_BILL_TOTALS_LINES);
  return { ...DEFAULT_BILL_TEMPLATE, ...saved, metaLines, totalsLines };
};

export const kotTemplateOf = (s: Settings | null | undefined): KotTemplate => {
  const saved = ((s?.kotTemplate as (Partial<KotTemplate> & LegacyKotFields)) ?? {});
  const hasLegacyMetaFields = 'showOrderType' in saved || 'showTable' in saved || 'showWaiter' in saved || 'showGuests' in saved || 'showTime' in saved;
  const metaLinesBase = saved.metaLines ?? (hasLegacyMetaFields
    ? DEFAULT_KOT_META_LINES.map((l) => ({
        ...l,
        enabled:
          l.id === 'time' ? saved.showTime ?? l.enabled
          : l.id === 'orderType' ? saved.showOrderType ?? l.enabled
          : l.id === 'table' ? saved.showTable ?? l.enabled
          : l.id === 'guestCount' ? saved.showGuests ?? l.enabled
          : l.id === 'waiter' ? saved.showWaiter ?? l.enabled
          : l.enabled,
      }))
    : DEFAULT_KOT_META_LINES);
  const metaLines = withMissingLines(metaLinesBase, DEFAULT_KOT_META_LINES);
  return { ...DEFAULT_KOT_TEMPLATE, ...saved, metaLines };
};

// Restricts to characters that can legitimately appear in a CSS font-family
// value (letters, spaces, commas, quotes, hyphens). fontFamily comes from a
// curated dropdown in the UI, but is stored as opaque, unvalidated JSON
// server-side — the silent-print HTML generators below build raw HTML/CSS
// strings (not React, which escapes automatically), so this guards against
// a hand-crafted API request breaking out of the <style> block.
export function sanitizeFontFamily(f: string | undefined): string {
  const safe = (f ?? '').replace(/[^a-zA-Z0-9 ,'"-]/g, '');
  return safe.trim() || DEFAULT_FONT_FAMILY;
}

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
  // Dedicated daily KOT/BOT ticket number for this item's own station —
  // resolved server-side (Order.kotNo/botNo), not the order number.
  ticketNo: number;
  orderType: string;
  table: string | null;
  tableNo?: number | null;
  area?: string | null;
  terminal?: string | null;
  waiter: string | null;
  guestCount?: number | null;
  name: string;
  quantity: number;
  station: 'KITCHEN' | 'BAR' | 'BILLING';
  notes?: string | null;
  modifiers?: { name: string }[] | null;
  printerName?: string | null;
}

// Which physical printer an item's ticket should go to: its own resolved
// printerName (item override, else category default — computed server-side
// so the auto-print and manual-print paths can never disagree), else this
// till's per-station KOT/BOT default (Settings → Printing).
export function resolveTargetPrinter(
  station: 'KITCHEN' | 'BAR',
  printerName: string | null | undefined,
  prefs: PrinterPrefs,
): string | undefined {
  if (printerName) return printerName;
  return station === 'BAR' ? prefs.bot || prefs.kot : prefs.kot;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// "28-Jul-2026" / "07:15 PM" — matches the printed-ticket convention used
// throughout the restaurant (bills, KOT, BOT all share this format).
export const ticketDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
export const ticketTime = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
// "08/11/2026 10:23:54 AM" — matches the Transaction Date / Invoice Issue
// Date convention on the reference invoice format (Settings → Printing).
export const ticketDateTime = (d: Date) => {
  const date = d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  return `${date} ${time}`;
};

// Silently print whatever is currently rendered in #print-area (Receipt /
// DayReport) through the desktop shell — no printer dialog. The components use
// inline styles, so the captured markup is self-contained. Returns false when
// not in the desktop shell (caller falls back to window.print()).
// `opts.widthMm` is the EXACT width to print, already net of margin (see
// printReceiptNow) — not the full paper roll width. Declaring the printed
// page as anything wider than the content and relying on the printer driver
// to honor a custom page size *and* center a narrower div inside it exactly
// is what caused real receipts to clip a few mm off both edges on physical
// thermal printers; requesting exactly the width we want removes that
// guesswork.
export async function silentPrintArea(opts: { printer?: string; widthMm?: number; fontSize?: number; fontFamily?: string }): Promise<boolean> {
  if (typeof window === 'undefined' || !window.cakezakeDesktop?.printHtml) return false; // not the desktop shell — caller falls back to window.print()
  const el = document.getElementById('print-area');
  if (!el) return false;
  const w = opts.widthMm ?? 72;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 0; }
    body { font-family: ${sanitizeFontFamily(opts.fontFamily)}; color: #000; background: #fff;
           width: 100%; margin: 0; padding: 4px 2px; font-size: ${opts.fontSize ?? 12}px; }
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

// Injects/updates a page-scoped <style> tag declaring the physical paper size
// for the browser print dialog (window.print() fallback, used outside the
// desktop shell). Without this the browser prints to whatever page size its
// dialog defaults to (usually A4/Letter) instead of the receipt's actual
// roll width, which is what clips/cuts printed bills on a thermal printer
// even though the on-screen preview looks correct. `widthMm` here is the
// exact content width to print (already net of margin) — the page IS the
// content, not a wider page with the content centered inside it (see
// printReceiptNow for why that centering approach used to clip real prints).
function applyPrintPageStyle(widthMm: number, fontFamily: string) {
  if (typeof document === 'undefined') return;
  let style = document.getElementById('ticket-print-style') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'ticket-print-style';
    document.head.appendChild(style);
  }
  style.textContent = `@media print {
    @page { size: ${widthMm}mm auto; margin: 0; }
    body.print-receipt #print-area { width: 100% !important; margin: 0 !important; padding: 0 !important; font-family: ${sanitizeFontFamily(fontFamily)} !important; }
  }`;
}

// Single entry point every "print this ticket" action goes through — tries
// the desktop shell's silent print first, falls back to the browser print
// dialog (sized correctly via applyPrintPageStyle, not left to the browser's
// default page size). Centralizing this means every caller (POS, Day-End
// Z-report, Sales Report reprint) gets identical sizing/margin behavior
// instead of each hand-rolling its own silentPrintArea + window.print pair.
//
// `widthMm`/`marginMm` here are the template's raw paper width and margin
// (e.g. 80mm roll, 4mm margin) — this function does the one subtraction
// (contentWidth = widthMm − marginMm×2) and both print paths below print
// exactly that width, edge to edge, instead of declaring a full-roll-width
// page and centering a narrower div inside it. The old centering approach
// depended on the printer driver honoring a custom page size *and* actually
// supporting zero hardware margins to land the centered content correctly —
// many thermal printer drivers don't, silently clipping a few mm off both
// edges even though the on-screen preview and browser print-preview looked
// fine. Printing exactly the intended width removes that dependency.
export async function printReceiptNow(opts: { printer?: string; widthMm: number; marginMm: number; fontSize: number; fontFamily: string }): Promise<void> {
  const contentWidth = Math.max(opts.widthMm - opts.marginMm * 2, 20);
  if (await silentPrintArea({ printer: opts.printer, widthMm: contentWidth, fontSize: opts.fontSize, fontFamily: opts.fontFamily })) return;
  applyPrintPageStyle(contentWidth, opts.fontFamily);
  document.body.classList.add('print-receipt');
  window.print();
  document.body.classList.remove('print-receipt');
}

// ── Shared KOT/BOT ticket fields — single source of truth for the manual
// print path (Receipt.tsx) and the silent auto-print path (kotTicketHtml
// below), so the two can never drift into different field sets/order/labels.
// ticketNo is the dedicated daily kitchen/bar ticket number (Order.kotNo/
// botNo — resets every Nepal calendar day), independent of the order number
// and the fiscal invoice number. Not the same value as the order's own #.
export function kotDocNo(station: 'KITCHEN' | 'BAR', ticketNo: number, unsynced?: boolean): string {
  const prefix = station === 'BAR' ? 'BOT' : 'KOT';
  return unsynced ? `${prefix}-PENDING` : `${prefix}-${String(ticketNo).padStart(5, '0')}`;
}
export function kotMetaPairs(opts: {
  template: KotTemplate;
  station: 'KITCHEN' | 'BAR';
  ticketNo: number;
  orderType: string;
  table?: string | null;
  tableNo?: number | null;
  area?: string | null;
  terminal?: string | null;
  waiter?: string | null;
  guestCount?: number | null;
  unsynced?: boolean;
}): [string, string][] {
  const t = opts.template;
  const now = new Date();
  const valueOf = (id: string): string | null => {
    switch (id) {
      case 'time': return ticketTime(now);
      case 'orderType': return opts.orderType.replace('_', ' ');
      case 'table': return opts.table || null;
      case 'tableNo': return opts.tableNo != null ? String(opts.tableNo) : null;
      case 'area': return opts.area || null;
      case 'guestCount': return opts.guestCount ? String(opts.guestCount) : null;
      case 'waiter': return opts.waiter || null;
      // Reuses the waiter field — the best available "who's responsible for
      // this ticket" proxy at KOT-fire time (order.cashierName isn't set
      // until checkout). Kept as a separate line id so a tenant already
      // showing "Waiter" isn't forced into a duplicate row.
      case 'userName': return opts.waiter || null;
      case 'serviceProvider': return opts.terminal || null;
      default: return null;
    }
  };
  const pairs: [string, string][] = [
    [`${opts.station === 'BAR' ? 'BOT' : 'KOT'} No`, kotDocNo(opts.station, opts.ticketNo, opts.unsynced)],
    ['Date', ticketDate(now)],
  ];
  for (const line of [...t.metaLines].sort((a, b) => a.order - b.order)) {
    if (!line.enabled) continue;
    const value = valueOf(line.id);
    if (value) pairs.push([line.label, value]);
  }
  return pairs;
}

// Standalone, self-contained ticket HTML for silent printing in the desktop
// shell (thermal-receipt style, monospace, no external assets) — used by
// AutoPrintAgent for KOTs fired elsewhere (e.g. a waiter's handheld) and
// queued server-side. Field set/order/labels come from kotMetaPairs/kotDocNo
// above — the exact same functions Receipt.tsx uses for a manually-printed
// KOT/BOT — so an auto-printed ticket and a manually-printed one are always
// identical, regardless of which screen fired the order.
export function kotTicketHtml(opts: {
  template: KotTemplate;
  station: 'KITCHEN' | 'BAR';
  orderNumber: number;
  ticketNo: number;
  orderType: string;
  table?: string | null;
  tableNo?: number | null;
  area?: string | null;
  terminal?: string | null;
  waiter?: string | null;
  guestCount?: number | null;
  items: KotQueueItem[];
}): string {
  const t = opts.template;
  const title = opts.station === 'BAR' ? t.botTitle : t.kotTitle;
  // Item first, then Qty — matches the reference KOT format and reads more
  // naturally for kitchen staff scanning down a list of dish names.
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
  //   KOT No: KOT-10492          Date: 28-Jul-2026
  //   Time: 07:15 PM             Order Type: Dine-In
  //   Table No: T-04             Guest Count: 4
  //   Order Taken By: Captain Ramesh
  const meta = kotMetaPairs(opts);
  const metaRows: string[] = [];
  for (let i = 0; i < meta.length; i += 2) {
    const [l1, v1] = meta[i];
    const pair = meta[i + 1];
    metaRows.push(
      `<div class="row"><span>${esc(l1)}: <b>${esc(v1)}</b></span>${pair ? `<span>${esc(pair[0])}: <b>${esc(pair[1])}</b></span>` : ''}</div>`,
    );
  }
  // Same width the caller (AutoPrintAgent) must pass as the Electron page
  // width — see the note on printReceiptNow: the page IS this content
  // width, not the full roll width with this centered inside it.
  const w = Math.max(t.paperWidthMm - t.marginMm * 2, 20);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 0; }
    body { font-family: ${sanitizeFontFamily(t.fontFamily)}; font-size: ${t.fontSize}px; font-weight: ${t.boldTotals ? 600 : 400}; color: #000;
           width: ${w}mm; margin: 0; padding: 4px 2px; }
    .ttl { text-align: center; font-weight: 800; font-size: ${t.fontSize + 6}px; margin-bottom: 4px; }
    .ord { font-weight: 700; }
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
    <div class="ord">Order #${opts.orderNumber}</div>
    <div class="meta">
      ${metaRows.join('')}
    </div>
    <table><thead><tr><th>Item</th><th class="qty">Qty</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="foot">— fire to station —</div>
  </body></html>`;
}

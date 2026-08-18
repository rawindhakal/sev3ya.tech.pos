'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, formatMoney, formatMoneyPlain, formatMoneyRounded } from '@/lib/api';
import type { Settings } from '@/lib/types';
import { notify } from '@/lib/dialog';
import { amountInWords } from '@/lib/number-to-words';
import {
  billTemplateOf,
  kotTemplateOf,
  getPrinterPrefs,
  savePrinterPrefs,
  isDesktopShell,
  ticketDate,
  ticketTime,
  ticketDateTime,
  FONT_OPTIONS,
  type BillTemplate,
  type KotTemplate,
  type DesktopPrinter,
  type PrinterPrefs,
  type TemplateLine,
} from '@/lib/printing';
import Spinner from '@/components/Spinner';

// Sample data driving the live previews.
const SAMPLE_ITEMS = [
  { name: 'Cappuccino (Large)', qty: 2, cents: 90000, mods: 'Oat milk', notes: 'extra hot' },
  { name: 'Chicken Momo', qty: 1, cents: 45000, mods: '', notes: '' },
  { name: 'Chocolate Cake', qty: 1, cents: 55000, mods: '', notes: 'birthday candle' },
];

// Placeholder values for the live preview — same "id → value" resolution the
// real Receipt.tsx/kotMetaPairs use, just fed made-up sample data instead of
// a real order, so reordering/relabeling/toggling a line is visible
// immediately without needing to ring up a real order first.
const BILL_SAMPLE_VALUE: Record<string, string> = {
  time: ticketTime(new Date()),
  table: 'T-04',
  tableNo: '46',
  guestCount: '4',
  cashier: 'Sita Sharma',
  waiter: 'Ramesh',
  customer: 'Ram Kumar (98012...)',
  area: 'Ground floor',
  fiscalYear: '2083/084',
  terminal: 'Till 1',
  nepaliDate: ticketDate(new Date()),
  panNo: '622389071',
  transactionDate: ticketDateTime(new Date()),
  invoiceIssueDate: ticketDateTime(new Date()),
};
const SAMPLE_HS_CODE = '2106.90';
const KOT_SAMPLE_VALUE: Record<string, string> = {
  time: ticketTime(new Date()),
  orderType: 'Dine-In',
  table: 'T-04',
  tableNo: '46',
  area: 'Ground floor',
  guestCount: '4',
  waiter: 'Captain Ramesh',
  userName: 'Captain Ramesh',
  serviceProvider: 'Till 1',
};
function previewTotalsRow(
  line: TemplateLine,
  subtotalCents: number,
  vatCents: number,
  vatRate: number,
  money: (cents: number) => string,
): { label: string; value: string } | null {
  switch (line.id) {
    case 'subtotal': return { label: line.label, value: money(subtotalCents) };
    case 'discount': return { label: `${line.label} (Staff 10%)`, value: `-${money(5000)}` };
    case 'serviceCharge': return { label: `${line.label} (10%)`, value: money(Math.round(subtotalCents * 0.1)) };
    case 'netBeforeTax': return { label: line.label, value: money(subtotalCents) };
    case 'total':
    case 'taxableAmt': return { label: line.label, value: money(subtotalCents) };
    case 'vat': return { label: `${line.label} (${Math.round(vatRate * 100)}%)`, value: money(vatCents) };
    default: return null;
  }
}
// Pairs [label, value] rows two-per-row (grid) or flat one-per-row (list) —
// mirrors Receipt.tsx's own grid/list rendering exactly, so the preview
// never lies about what the real bill will look like.
function pairMetaRows(pairs: [string, string][]): [string, string][][] {
  const rows: [string, string][][] = [];
  for (let i = 0; i < pairs.length; i += 2) rows.push([pairs[i], pairs[i + 1]].filter(Boolean) as [string, string][]);
  return rows;
}

// Shared editor for a TemplateLine[] section (bill meta lines, bill totals
// lines, KOT meta lines) — an enabled toggle, an editable label, and ↑/↓
// buttons to reorder. Every line on the ticket is customizable through
// exactly this one control, in every section it appears.
function LineListEditor({ lines, onChange }: { lines: TemplateLine[]; onChange: (lines: TemplateLine[]) => void }) {
  const sorted = [...lines].sort((a, b) => a.order - b.order);
  function setLine(id: string, patch: Partial<TemplateLine>) {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function move(id: string, dir: -1 | 1) {
    const idx = sorted.findIndex((l) => l.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    onChange(lines.map((l) => (l.id === a.id ? { ...l, order: b.order } : l.id === b.id ? { ...l, order: a.order } : l)));
  }
  return (
    <div className="space-y-1.5">
      {sorted.map((line, i) => (
        <div key={line.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-600">
          <div className="flex flex-col leading-none">
            <button type="button" onClick={() => move(line.id, -1)} disabled={i === 0}
              className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 dark:hover:text-slate-200" aria-label={`Move ${line.label} up`}>▲</button>
            <button type="button" onClick={() => move(line.id, 1)} disabled={i === sorted.length - 1}
              className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 dark:hover:text-slate-200" aria-label={`Move ${line.label} down`}>▼</button>
          </div>
          <button type="button" onClick={() => setLine(line.id, { enabled: !line.enabled })}
            aria-label={`${line.enabled ? 'Hide' : 'Show'} ${line.label}`}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${line.enabled ? 'bg-brand-500' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${line.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          <input
            className="input flex-1 py-1 text-sm"
            value={line.label}
            onChange={(e) => setLine(line.id, { label: e.target.value })}
            aria-label={`Label for ${line.id}`}
          />
        </div>
      ))}
    </div>
  );
}

export default function PrintingPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [bill, setBill] = useState<BillTemplate | null>(null);
  const [kot, setKot] = useState<KotTemplate | null>(null);
  const [prefs, setPrefs] = useState<PrinterPrefs>({ autoPrintKot: true });
  const [printers, setPrinters] = useState<DesktopPrinter[]>([]);
  const [desktop, setDesktop] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshingPrinters, setRefreshingPrinters] = useState(false);
  const [testing, setTesting] = useState<string | null>(null); // which printer role is mid-test

  function refreshPrinters() {
    if (!window.cakezakeDesktop?.listPrinters) return;
    setRefreshingPrinters(true);
    window.cakezakeDesktop.listPrinters().then(setPrinters).catch(() => {}).finally(() => setRefreshingPrinters(false));
  }

  useEffect(() => {
    api.get<Settings>('/settings').then((s) => {
      setSettings(s);
      setBill(billTemplateOf(s));
      setKot(kotTemplateOf(s));
    }).catch((e) => setErr((e as Error).message));
    setPrefs(getPrinterPrefs());
    const d = isDesktopShell();
    setDesktop(d);
    if (d) refreshPrinters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Print a small sample ticket to the given printer role — lets staff verify
  // a printer actually works (paper loaded, driver OK, correct printer
  // selected) without needing to ring up a real order first.
  async function testPrint(role: 'kot' | 'bot' | 'bill', printerName: string | undefined) {
    if (!window.cakezakeDesktop?.printHtml || !bill || !kot) return;
    setTesting(role);
    const label = role === 'bill' ? 'BILL PRINTER TEST' : role === 'bot' ? 'BOT PRINTER TEST' : 'KOT PRINTER TEST';
    const width = role === 'bill' ? bill.paperWidthMm : kot.paperWidthMm;
    const margin = role === 'bill' ? bill.marginMm : kot.marginMm;
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { margin: 0; }
      body { font-family: ui-monospace, Menlo, monospace; font-size: 13px; color: #000;
             width: ${Math.max(width - margin * 2, 20)}mm; margin: 0 auto; padding: 4px 2px; text-align: center; }
      .ttl { font-weight: 700; font-size: 16px; margin-bottom: 6px; }
    </style></head><body>
      <div class="ttl">${label}</div>
      <div>${settings?.restaurantName ?? 's3vyaPOS'}</div>
      <div>${printerName || 'System default'}</div>
      <div>${new Date().toLocaleString()}</div>
      <div style="border-top:1px dashed #000;margin-top:6px;padding-top:6px">If this printed cleanly, this printer is good to go.</div>
    </body></html>`;
    try {
      const res = await window.cakezakeDesktop.printHtml({ html, printerName, widthMm: width });
      if (res?.ok) notify(res.warning || `Test ticket sent to ${printerName || 'the system default printer'}.`, res.warning ? 'info' : 'success');
      else notify(`Test print failed: ${res?.error || 'unknown error'}`, 'error');
    } catch (e) {
      notify(`Test print failed: ${(e as Error).message}`, 'error');
    } finally {
      setTesting(null);
    }
  }

  function setPref<K extends keyof PrinterPrefs>(key: K, value: PrinterPrefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePrinterPrefs(next);
  }

  async function saveTemplates() {
    if (!bill || !kot) return;
    setSaving(true);
    setErr(null);
    try {
      const updated = await api.patch<Settings>('/settings', { billTemplate: bill, kotTemplate: kot });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const subtotal = useMemo(() => SAMPLE_ITEMS.reduce((s, i) => s + i.cents * i.qty, 0), []);
  const vat = Math.round(subtotal * (settings?.vatRate ?? 0.13));
  // Keeps the preview's Grand Total consistent with whichever sample rows
  // are actually toggled on above it (same 10%/Rs 50 sample amounts used by
  // previewTotalsRow) — the real printed bill always uses the real order's
  // own totals, this is preview-only bookkeeping.
  const previewGrandTotal = subtotal
    - (bill?.totalsLines.some((l) => l.id === 'discount' && l.enabled) ? 5000 : 0)
    + (bill?.totalsLines.some((l) => l.id === 'serviceCharge' && l.enabled) ? Math.round(subtotal * 0.1) : 0)
    + vat;

  if (!bill || !kot) {
    return <div className="p-8 text-sm text-slate-400">{err ?? 'Loading…'}</div>;
  }

  // Preview-only: respects the "Currency symbol" toggle exactly like the
  // real bill does (Receipt.tsx's own `money` helper).
  const money = bill.showCurrencySymbol ? formatMoney : formatMoneyPlain;
  const previewMetaPairs: [string, string][] = [
    ['Bill No', 'INV-89201'],
    ['Date', ticketDate(new Date())],
    ...[...bill.metaLines].sort((a, b) => a.order - b.order).filter((l) => l.enabled).map((l): [string, string] => [l.label, BILL_SAMPLE_VALUE[l.id] ?? '—']),
  ];
  // A fabricated cash overpayment (customer handed over Rs 1000 extra),
  // only for demonstrating the Received & Change toggle — has no bearing on
  // the (also fabricated) Grand Total above it.
  const previewReceived = previewGrandTotal + 100000;

  const PrinterSelect = ({ label, value, onChange, role }: { label: string; value?: string; onChange: (v: string) => void; role: 'kot' | 'bot' | 'bill' }) => (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">System default</option>
        {printers.map((p) => (
          <option key={p.name} value={p.name}>{p.displayName || p.name}{p.isDefault ? ' (default)' : ''}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => testPrint(role, value)}
        disabled={testing === role}
        className="mt-1.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-700/40"
      >
        {testing === role ? 'Printing test ticket…' : '🖨 Test print'}
      </button>
    </div>
  );

  const Toggle = ({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/40">
      <span className="text-slate-700">{label}</span>
      <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? 'bg-brand-500' : 'bg-slate-300'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Printing</h1>
        <p className="text-sm text-slate-500">Choose this till&apos;s printers and design the bill &amp; KOT tickets.</p>
      </div>

      {/* ── Printers (per device) ── */}
      <div className="card mb-6 p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Printers — this device</h2>
          {desktop && (
            <button type="button" onClick={refreshPrinters} disabled={refreshingPrinters} className="text-xs text-brand-600 hover:underline disabled:opacity-50">
              {refreshingPrinters ? 'Refreshing…' : '↻ Refresh printer list'}
            </button>
          )}
        </div>
        {desktop ? (
          <>
            <p className="mb-4 text-xs text-slate-400">
              Installed printers detected by the desktop app. Saved on this till only. Just plugged one in? Hit refresh — the
              list is only read once when the app starts.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <PrinterSelect role="kot" label="KOT (kitchen) printer" value={prefs.kot} onChange={(v) => setPref('kot', v || undefined)} />
              <PrinterSelect role="bot" label="BOT (bar) printer" value={prefs.bot} onChange={(v) => setPref('bot', v || undefined)} />
              <PrinterSelect role="bill" label="Bill printer" value={prefs.bill} onChange={(v) => setPref('bill', v || undefined)} />
            </div>
            <div className="mt-4 max-w-md">
              <Toggle label="Auto-print KOTs fired by waiters (this till acts as the print server)" on={prefs.autoPrintKot} onChange={(v) => setPref('autoPrintKot', v)} />
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-400">
            Printer selection is available inside the <strong>desktop app</strong>, where the installed printers can be
            detected. Open s3vyaPOS on the till to pick its KOT / BOT / bill printers. Template changes below apply everywhere.
          </p>
        )}
      </div>

      {err && <p className="mb-4 text-sm text-red-500">{err}</p>}

      {/* ── Bill template ── */}
      <div className="card mb-6 p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Bill template</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div><label className="label">Document title</label>
              <input className="input" value={bill.title} onChange={(e) => setBill({ ...bill, title: e.target.value })} /></div>
            <div><label className="label">Header line (promo)</label>
              <input className="input" value={bill.headerText} onChange={(e) => setBill({ ...bill, headerText: e.target.value })} placeholder="e.g. Happy hour 4–6pm!" /></div>
            <div><label className="label">Footer line</label>
              <input className="input" value={bill.footerText} onChange={(e) => setBill({ ...bill, footerText: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Font</label>
                <select className="input" value={bill.fontFamily} onChange={(e) => setBill({ ...bill, fontFamily: e.target.value })}>
                  {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select></div>
              <div><label className="label">Paper width</label>
                <select className="input" value={bill.paperWidthMm} onChange={(e) => setBill({ ...bill, paperWidthMm: Number(e.target.value) as 58 | 80 })}>
                  <option value={80}>80 mm</option><option value={58}>58 mm</option>
                </select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Font size ({bill.fontSize}px)</label>
                <input type="range" min={9} max={16} value={bill.fontSize} onChange={(e) => setBill({ ...bill, fontSize: Number(e.target.value) })} className="w-full" /></div>
              <div><label className="label">Margin ({bill.marginMm}mm)</label>
                <input type="range" min={0} max={10} value={bill.marginMm} onChange={(e) => setBill({ ...bill, marginMm: Number(e.target.value) })} className="w-full" /></div>
            </div>
            <div>
              <label className="label">Order info layout</label>
              <select className="input" value={bill.metaLayout} onChange={(e) => setBill({ ...bill, metaLayout: e.target.value as 'grid' | 'list' })}>
                <option value="grid">Grid — two per row (compact)</option>
                <option value="list">List — one per row</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Toggle label="Bold, larger print" on={bill.boldTotals} onChange={(v) => setBill({ ...bill, boldTotals: v })} />
              <Toggle label="Currency symbol" on={bill.showCurrencySymbol} onChange={(v) => setBill({ ...bill, showCurrencySymbol: v })} />
              <Toggle label="Address" on={bill.showAddress} onChange={(v) => setBill({ ...bill, showAddress: v })} />
              <Toggle label="Phone" on={bill.showPhone} onChange={(v) => setBill({ ...bill, showPhone: v })} />
              <Toggle label="PAN / Tax ID" on={bill.showTaxId} onChange={(v) => setBill({ ...bill, showTaxId: v })} />
              <Toggle label="Item notes" on={bill.showItemNotes} onChange={(v) => setBill({ ...bill, showItemNotes: v })} />
              <Toggle label="Rate column" on={bill.showRate} onChange={(v) => setBill({ ...bill, showRate: v })} />
              <Toggle label="HS Code column" on={bill.showHsCode} onChange={(v) => setBill({ ...bill, showHsCode: v })} />
              <Toggle label="Payment mode / Txn ID" on={bill.showPaymentMode} onChange={(v) => setBill({ ...bill, showPaymentMode: v })} />
              <Toggle label="Boxed payment mode" on={bill.boxedPaymentMode} onChange={(v) => setBill({ ...bill, boxedPaymentMode: v })} />
              <Toggle label="Payment mode beside totals" on={bill.paymentModeSideBySide} onChange={(v) => setBill({ ...bill, paymentModeSideBySide: v })} />
              <Toggle label="Received & Change" on={bill.showReceivedChange} onChange={(v) => setBill({ ...bill, showReceivedChange: v })} />
              <Toggle label="Amount in words" on={bill.showAmountInWords} onChange={(v) => setBill({ ...bill, showAmountInWords: v })} />
              <Toggle label="Signature lines" on={bill.showSignatureLines} onChange={(v) => setBill({ ...bill, showSignatureLines: v })} />
              <Toggle label="WiFi password" on={bill.showWifi} onChange={(v) => setBill({ ...bill, showWifi: v })} />
            </div>
            <div className="pt-2">
              <p className="label mb-1.5">Order info lines <span className="font-normal normal-case text-slate-400">— show/hide, rename, reorder (Bill No &amp; Date always print first)</span></p>
              <LineListEditor lines={bill.metaLines} onChange={(metaLines) => setBill({ ...bill, metaLines })} />
            </div>
            <div className="pt-2">
              <p className="label mb-1.5">Totals breakdown <span className="font-normal normal-case text-slate-400">— show/hide, rename, reorder (Grand Total always prints last)</span></p>
              <LineListEditor lines={bill.totalsLines} onChange={(totalsLines) => setBill({ ...bill, totalsLines })} />
            </div>
          </div>

          {/* live preview */}
          <div className="flex items-start justify-center rounded-xl bg-slate-100 p-6 dark:bg-slate-900/60">
            <div className="bg-white py-3 text-black shadow-md" style={{ width: bill.paperWidthMm === 80 ? 300 : 220, paddingLeft: 12 + bill.marginMm * 4, paddingRight: 12 + bill.marginMm * 4, fontSize: bill.fontSize, fontWeight: bill.boldTotals ? 500 : 400, fontFamily: bill.fontFamily }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: bill.fontSize + 7 }}>{settings?.restaurantName || 'Your Restaurant'}</div>
                {bill.showAddress && <div>{settings?.address || 'Street, City'}</div>}
                {bill.showTaxId && <div>PAN/VAT No: {settings?.taxId || 'XXXXXXXXX'}</div>}
                {bill.showPhone && <div>Contact: {settings?.phone || '+977-98XXXXXXXX'}</div>}
                <div style={{ marginTop: 3, fontWeight: 800 }}>{bill.title.toUpperCase()}</div>
                {bill.headerText && <div style={{ marginTop: 3 }}>{bill.headerText}</div>}
              </div>
              <div style={{ borderTop: '2px dashed #000', borderBottom: '2px dashed #000', padding: '4px 0', marginTop: 5 }}>
                {bill.metaLayout === 'list'
                  ? previewMetaPairs.map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                        <span>{label}: <b>{value}</b></span>
                      </div>
                    ))
                  : pairMetaRows(previewMetaPairs).map((pair, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '1px 0' }}>
                        {pair.map(([label, value]) => <span key={label}>{label}: <b>{value}</b></span>)}
                      </div>
                    ))}
              </div>
              <table style={{ width: '100%', marginTop: 5, borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '2px solid #000', textAlign: 'left' }}><th>Item</th>{bill.showHsCode && <th>HS Code</th>}<th style={{ width: '2em', textAlign: 'center' }}>Qty</th>{bill.showRate && <th style={{ textAlign: 'right' }}>Rate</th>}<th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {SAMPLE_ITEMS.map((i) => (
                    <tr key={i.name} style={{ verticalAlign: 'top' }}>
                      <td style={{ fontWeight: bill.boldTotals ? 700 : 500 }}>{i.name}
                        {i.mods && <div style={{ fontSize: Math.max(bill.fontSize - 3, 9), fontWeight: 400 }}>+ {i.mods}</div>}
                        {bill.showItemNotes && i.notes && <div style={{ fontSize: Math.max(bill.fontSize - 3, 9), fontStyle: 'italic', fontWeight: 400 }}>» {i.notes}</div>}
                      </td>
                      {bill.showHsCode && <td>{SAMPLE_HS_CODE}</td>}
                      <td style={{ textAlign: 'center', fontWeight: 800 }}>{i.qty}</td>
                      {bill.showRate && <td style={{ textAlign: 'right' }}>{(i.cents / 100).toFixed(2)}</td>}
                      <td style={{ textAlign: 'right' }}>{money(i.cents * i.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bill.paymentModeSideBySide ? (
                <div style={{ borderTop: '2px dashed #000', marginTop: 5, paddingTop: 3, display: 'flex', gap: 8 }}>
                  <div style={{
                    flex: '1 1 45%', alignSelf: 'flex-start',
                    ...(bill.boxedPaymentMode ? { border: '1px solid #000', borderRadius: 3, padding: '4px 6px' } : {}),
                  }}>
                    {bill.showPaymentMode && (
                      <>
                        <div style={{ fontWeight: 700 }}>Mode Of Payment</div>
                        <div>Fonepay QR (Txn ID: FP98213)</div>
                      </>
                    )}
                  </div>
                  <div style={{ flex: '1 1 55%' }}>
                    {[...bill.totalsLines].sort((a, b) => a.order - b.order).filter((l) => l.enabled)
                      .map((l) => previewTotalsRow(l, subtotal, vat, settings?.vatRate ?? 0.13, money))
                      .filter((row): row is { label: string; value: string } => row != null)
                      .map((row) => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{row.label}</span><span>{row.value}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <div style={{ borderTop: '2px dashed #000', marginTop: 5, paddingTop: 3 }}>
                  {[...bill.totalsLines].sort((a, b) => a.order - b.order).filter((l) => l.enabled)
                    .map((l) => previewTotalsRow(l, subtotal, vat, settings?.vatRate ?? 0.13, money))
                    .filter((row): row is { label: string; value: string } => row != null)
                    .map((row) => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{row.label}</span><span>{row.value}</span>
                      </div>
                    ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.15em', borderTop: '2px solid #000', marginTop: 3, paddingTop: 3 }}>
                    <span>GRAND TOTAL</span><span>{bill.showCurrencySymbol ? formatMoney(previewGrandTotal) : formatMoneyRounded(previewGrandTotal)}</span>
                  </div>
                </div>
              )}
              {!bill.paymentModeSideBySide && bill.showPaymentMode && (
                <div style={{
                  borderTop: '2px dashed #000', marginTop: 5, paddingTop: 3,
                  ...(bill.boxedPaymentMode ? { border: '1px solid #000', borderRadius: 3, padding: '4px 6px' } : {}),
                }}>
                  Payment Mode: <b>Fonepay QR</b> (Txn ID: FP98213)
                </div>
              )}
              {bill.paymentModeSideBySide && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.15em', borderTop: '2px solid #000', marginTop: 3, paddingTop: 3 }}>
                  <span>GRAND TOTAL</span><span>{bill.showCurrencySymbol ? formatMoney(previewGrandTotal) : formatMoneyRounded(previewGrandTotal)}</span>
                </div>
              )}
              {bill.showAmountInWords && (
                <div style={{ marginTop: 4 }}>In Words: {amountInWords(previewGrandTotal)}</div>
              )}
              {bill.showReceivedChange && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Received Amount</span><span>{money(previewReceived)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Change</span><span>{money(previewReceived - previewGrandTotal)}</span></div>
                </div>
              )}
              <div style={{ textAlign: 'center', marginTop: 8, fontWeight: 700 }}>{bill.footerText}</div>
              {bill.showWifi && <div style={{ textAlign: 'center', fontSize: Math.max(bill.fontSize - 2, 9), fontWeight: 400 }}>WiFi: {settings?.wifiPassword || 'cafe-wifi'}</div>}
              {bill.showSignatureLines && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: Math.max(bill.fontSize - 3, 9) }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '7em', borderTop: '1px solid #000', marginBottom: 2 }} />
                    Cashier
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '7em', borderTop: '1px solid #000', marginBottom: 2 }} />
                    Customer
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── KOT template ── */}
      <div className="card mb-6 p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">KOT / BOT template</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div><label className="label">KOT title</label>
              <input className="input" value={kot.kotTitle} onChange={(e) => setKot({ ...kot, kotTitle: e.target.value })} /></div>
            <div><label className="label">BOT title</label>
              <input className="input" value={kot.botTitle} onChange={(e) => setKot({ ...kot, botTitle: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Font</label>
                <select className="input" value={kot.fontFamily} onChange={(e) => setKot({ ...kot, fontFamily: e.target.value })}>
                  {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select></div>
              <div><label className="label">Paper width</label>
                <select className="input" value={kot.paperWidthMm} onChange={(e) => setKot({ ...kot, paperWidthMm: Number(e.target.value) as 58 | 80 })}>
                  <option value={80}>80 mm</option><option value={58}>58 mm</option>
                </select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Font size ({kot.fontSize}px)</label>
                <input type="range" min={10} max={18} value={kot.fontSize} onChange={(e) => setKot({ ...kot, fontSize: Number(e.target.value) })} className="w-full" /></div>
              <div><label className="label">Margin ({kot.marginMm}mm)</label>
                <input type="range" min={0} max={10} value={kot.marginMm} onChange={(e) => setKot({ ...kot, marginMm: Number(e.target.value) })} className="w-full" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Toggle label="Bold, larger print" on={kot.boldTotals} onChange={(v) => setKot({ ...kot, boldTotals: v })} />
              <Toggle label="Item notes" on={kot.showItemNotes} onChange={(v) => setKot({ ...kot, showItemNotes: v })} />
            </div>
            <div className="pt-2">
              <p className="label mb-1.5">Order info lines <span className="font-normal normal-case text-slate-400">— show/hide, rename, reorder (KOT/BOT No &amp; Date always print first)</span></p>
              <LineListEditor lines={kot.metaLines} onChange={(metaLines) => setKot({ ...kot, metaLines })} />
            </div>
          </div>

          <div className="flex items-start justify-center rounded-xl bg-slate-100 p-6 dark:bg-slate-900/60">
            <div className="bg-white py-3 text-black shadow-md" style={{ width: kot.paperWidthMm === 80 ? 300 : 220, paddingLeft: 12 + kot.marginMm * 4, paddingRight: 12 + kot.marginMm * 4, fontSize: kot.fontSize, fontWeight: kot.boldTotals ? 600 : 400, fontFamily: kot.fontFamily }}>
              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: kot.fontSize + 6 }}>{kot.kotTitle}</div>
              <div style={{ borderTop: '2px dashed #000', borderBottom: '2px dashed #000', padding: '4px 0', marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>KOT No: <b>K-01042</b></span><span>Date: <b>{ticketDate(new Date())}</b></span></div>
                {[...kot.metaLines].sort((a, b) => a.order - b.order).filter((l) => l.enabled).map((l) => (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                    <span>{l.label}: <b>{KOT_SAMPLE_VALUE[l.id] ?? '—'}</b></span>
                  </div>
                ))}
              </div>
              <table style={{ width: '100%', marginTop: 4, borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '2px solid #000', textAlign: 'left' }}><th>Item</th><th style={{ width: '2em', textAlign: 'center' }}>Qty</th></tr></thead>
                <tbody>
                  {SAMPLE_ITEMS.map((i) => (
                    <tr key={i.name} style={{ verticalAlign: 'top' }}>
                      <td style={{ fontWeight: kot.boldTotals ? 700 : 500 }}>{i.name}
                        {kot.showItemNotes && i.notes && <div style={{ fontSize: Math.max(kot.fontSize - 3, 9), fontStyle: 'italic', fontWeight: 400 }}>» {i.notes}</div>}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 800 }}>{i.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ textAlign: 'center', marginTop: 6, fontSize: Math.max(kot.fontSize - 2, 10), fontWeight: 700 }}>— fire to station —</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={saveTemplates} disabled={saving} className="btn-primary min-w-[9.5rem]">
          {saving ? <><Spinner size={16} /> Saving…</> : 'Save templates'}
        </button>
        {saved && <span className="text-sm font-medium text-emerald-600">Saved ✓</span>}
        <span className="text-xs text-slate-400">Templates apply to every till; printer choices stay on this device.</span>
      </div>
    </div>
  );
}

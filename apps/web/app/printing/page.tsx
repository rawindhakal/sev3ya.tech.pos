'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, formatMoney } from '@/lib/api';
import type { Settings } from '@/lib/types';
import { notify } from '@/lib/dialog';
import {
  billTemplateOf,
  kotTemplateOf,
  getPrinterPrefs,
  savePrinterPrefs,
  isDesktopShell,
  ticketDate,
  ticketTime,
  type BillTemplate,
  type KotTemplate,
  type DesktopPrinter,
  type PrinterPrefs,
} from '@/lib/printing';
import Spinner from '@/components/Spinner';

// Sample data driving the live previews.
const SAMPLE_ITEMS = [
  { name: 'Cappuccino (Large)', qty: 2, cents: 90000, mods: 'Oat milk', notes: 'extra hot' },
  { name: 'Chicken Momo', qty: 1, cents: 45000, mods: '', notes: '' },
  { name: 'Chocolate Cake', qty: 1, cents: 55000, mods: '', notes: 'birthday candle' },
];

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

  if (!bill || !kot) {
    return <div className="p-8 text-sm text-slate-400">{err ?? 'Loading…'}</div>;
  }

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
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">Font size ({bill.fontSize}px)</label>
                <input type="range" min={9} max={16} value={bill.fontSize} onChange={(e) => setBill({ ...bill, fontSize: Number(e.target.value) })} className="w-full" /></div>
              <div><label className="label">Paper width</label>
                <select className="input" value={bill.paperWidthMm} onChange={(e) => setBill({ ...bill, paperWidthMm: Number(e.target.value) as 58 | 80 })}>
                  <option value={80}>80 mm</option><option value={58}>58 mm</option>
                </select></div>
              <div><label className="label">Margin ({bill.marginMm}mm)</label>
                <input type="range" min={0} max={10} value={bill.marginMm} onChange={(e) => setBill({ ...bill, marginMm: Number(e.target.value) })} className="w-full" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Toggle label="Bold, larger print" on={bill.boldTotals} onChange={(v) => setBill({ ...bill, boldTotals: v })} />
              <Toggle label="Address" on={bill.showAddress} onChange={(v) => setBill({ ...bill, showAddress: v })} />
              <Toggle label="Phone" on={bill.showPhone} onChange={(v) => setBill({ ...bill, showPhone: v })} />
              <Toggle label="PAN / Tax ID" on={bill.showTaxId} onChange={(v) => setBill({ ...bill, showTaxId: v })} />
              <Toggle label="Table" on={bill.showTable} onChange={(v) => setBill({ ...bill, showTable: v })} />
              <Toggle label="Waiter" on={bill.showWaiter} onChange={(v) => setBill({ ...bill, showWaiter: v })} />
              <Toggle label="Guest count" on={bill.showGuests} onChange={(v) => setBill({ ...bill, showGuests: v })} />
              <Toggle label="Cashier" on={bill.showCashier} onChange={(v) => setBill({ ...bill, showCashier: v })} />
              <Toggle label="Customer" on={bill.showCustomer} onChange={(v) => setBill({ ...bill, showCustomer: v })} />
              <Toggle label="Item notes" on={bill.showItemNotes} onChange={(v) => setBill({ ...bill, showItemNotes: v })} />
              <Toggle label="Rate column" on={bill.showRate} onChange={(v) => setBill({ ...bill, showRate: v })} />
              <Toggle label="VAT breakdown" on={bill.showVatBreakdown} onChange={(v) => setBill({ ...bill, showVatBreakdown: v })} />
              <Toggle label="Payment mode / Txn ID" on={bill.showPaymentMode} onChange={(v) => setBill({ ...bill, showPaymentMode: v })} />
              <Toggle label="WiFi password" on={bill.showWifi} onChange={(v) => setBill({ ...bill, showWifi: v })} />
            </div>
          </div>

          {/* live preview */}
          <div className="flex items-start justify-center rounded-xl bg-slate-100 p-6 dark:bg-slate-900/60">
            <div className="bg-white py-3 font-mono text-black shadow-md" style={{ width: bill.paperWidthMm === 80 ? 300 : 220, paddingLeft: 12 + bill.marginMm * 4, paddingRight: 12 + bill.marginMm * 4, fontSize: bill.fontSize, fontWeight: bill.boldTotals ? 500 : 400 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: bill.fontSize + 7 }}>{settings?.restaurantName || 'Your Restaurant'}</div>
                {bill.showAddress && <div>{settings?.address || 'Street, City'}</div>}
                {bill.showTaxId && <div>PAN/VAT No: {settings?.taxId || 'XXXXXXXXX'}</div>}
                {bill.showPhone && <div>Contact: {settings?.phone || '+977-98XXXXXXXX'}</div>}
                <div style={{ marginTop: 3, fontWeight: 800 }}>{bill.title.toUpperCase()}</div>
                {bill.headerText && <div style={{ marginTop: 3 }}>{bill.headerText}</div>}
              </div>
              <div style={{ borderTop: '2px dashed #000', borderBottom: '2px dashed #000', padding: '4px 0', marginTop: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Bill No: <b>INV-89201</b></span><span>Date: <b>{ticketDate(new Date())}</b></span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Time: <b>{ticketTime(new Date())}</b></span>
                  {bill.showTable && <span>Table No: <b>T-04</b></span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  {bill.showGuests && <span>Guest Count: <b>4</b></span>}
                  {bill.showCashier && <span>Cashier: <b>Sita Sharma</b></span>}
                </div>
                {bill.showWaiter && <div>Waiter: <b>Ramesh</b></div>}
                {bill.showCustomer && <div>Customer: Ram Kumar (98012...)</div>}
              </div>
              <table style={{ width: '100%', marginTop: 5, borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '2px solid #000', textAlign: 'left' }}><th style={{ width: '2em', textAlign: 'center' }}>Qty</th><th>Item</th>{bill.showRate && <th style={{ textAlign: 'right' }}>Rate</th>}<th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {SAMPLE_ITEMS.map((i) => (
                    <tr key={i.name} style={{ verticalAlign: 'top' }}>
                      <td style={{ textAlign: 'center', fontWeight: 800 }}>{i.qty}</td>
                      <td style={{ fontWeight: bill.boldTotals ? 700 : 500 }}>{i.name}
                        {i.mods && <div style={{ fontSize: Math.max(bill.fontSize - 3, 9), fontWeight: 400 }}>+ {i.mods}</div>}
                        {bill.showItemNotes && i.notes && <div style={{ fontSize: Math.max(bill.fontSize - 3, 9), fontStyle: 'italic', fontWeight: 400 }}>» {i.notes}</div>}
                      </td>
                      {bill.showRate && <td style={{ textAlign: 'right' }}>{(i.cents / 100).toFixed(2)}</td>}
                      <td style={{ textAlign: 'right' }}>{formatMoney(i.cents * i.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ borderTop: '2px dashed #000', marginTop: 5, paddingTop: 3 }}>
                {bill.showVatBreakdown && (<>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sub Total</span><span>{formatMoney(subtotal)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>VAT ({Math.round((settings?.vatRate ?? 0.13) * 100)}%)</span><span>{formatMoney(vat)}</span></div>
                </>)}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.15em', borderTop: '2px solid #000', marginTop: 3, paddingTop: 3 }}>
                  <span>GRAND TOTAL</span><span>{formatMoney(subtotal + vat)}</span>
                </div>
              </div>
              {bill.showPaymentMode && (
                <div style={{ borderTop: '2px dashed #000', marginTop: 5, paddingTop: 3 }}>
                  Payment Mode: <b>Fonepay QR</b> (Txn ID: FP98213)
                </div>
              )}
              <div style={{ textAlign: 'center', marginTop: 8, fontWeight: 700 }}>{bill.footerText}</div>
              {bill.showWifi && <div style={{ textAlign: 'center', fontSize: Math.max(bill.fontSize - 2, 9), fontWeight: 400 }}>WiFi: {settings?.wifiPassword || 'cafe-wifi'}</div>}
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
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">Font size ({kot.fontSize}px)</label>
                <input type="range" min={10} max={18} value={kot.fontSize} onChange={(e) => setKot({ ...kot, fontSize: Number(e.target.value) })} className="w-full" /></div>
              <div><label className="label">Paper width</label>
                <select className="input" value={kot.paperWidthMm} onChange={(e) => setKot({ ...kot, paperWidthMm: Number(e.target.value) as 58 | 80 })}>
                  <option value={80}>80 mm</option><option value={58}>58 mm</option>
                </select></div>
              <div><label className="label">Margin ({kot.marginMm}mm)</label>
                <input type="range" min={0} max={10} value={kot.marginMm} onChange={(e) => setKot({ ...kot, marginMm: Number(e.target.value) })} className="w-full" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Toggle label="Bold, larger print" on={kot.boldTotals} onChange={(v) => setKot({ ...kot, boldTotals: v })} />
              <Toggle label="Order type" on={kot.showOrderType} onChange={(v) => setKot({ ...kot, showOrderType: v })} />
              <Toggle label="Table" on={kot.showTable} onChange={(v) => setKot({ ...kot, showTable: v })} />
              <Toggle label="Guest count" on={kot.showGuests} onChange={(v) => setKot({ ...kot, showGuests: v })} />
              <Toggle label="Order taken by" on={kot.showWaiter} onChange={(v) => setKot({ ...kot, showWaiter: v })} />
              <Toggle label="Time" on={kot.showTime} onChange={(v) => setKot({ ...kot, showTime: v })} />
              <Toggle label="Item notes" on={kot.showItemNotes} onChange={(v) => setKot({ ...kot, showItemNotes: v })} />
            </div>
          </div>

          <div className="flex items-start justify-center rounded-xl bg-slate-100 p-6 dark:bg-slate-900/60">
            <div className="bg-white py-3 font-mono text-black shadow-md" style={{ width: kot.paperWidthMm === 80 ? 300 : 220, paddingLeft: 12 + kot.marginMm * 4, paddingRight: 12 + kot.marginMm * 4, fontSize: kot.fontSize, fontWeight: kot.boldTotals ? 600 : 400 }}>
              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: kot.fontSize + 6 }}>{kot.kotTitle}</div>
              <div style={{ borderTop: '2px dashed #000', borderBottom: '2px dashed #000', padding: '4px 0', marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>KOT No: <b>K-01042</b></span><span>Date: <b>{ticketDate(new Date())}</b></span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  {kot.showTime && <span>Time: <b>{ticketTime(new Date())}</b></span>}
                  {kot.showOrderType && <span>Order Type: <b>Dine-In</b></span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  {kot.showTable && <span>Table No: <b>T-04</b></span>}
                  {kot.showGuests && <span>Guest Count: <b>4</b></span>}
                </div>
                {kot.showWaiter && <div>Order Taken By: <b>Captain Ramesh</b></div>}
              </div>
              <table style={{ width: '100%', marginTop: 4, borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '2px solid #000', textAlign: 'left' }}><th style={{ width: '2em', textAlign: 'center' }}>Qty</th><th>Item</th></tr></thead>
                <tbody>
                  {SAMPLE_ITEMS.map((i) => (
                    <tr key={i.name} style={{ verticalAlign: 'top' }}>
                      <td style={{ textAlign: 'center', fontWeight: 800 }}>{i.qty}</td>
                      <td style={{ fontWeight: kot.boldTotals ? 700 : 500 }}>{i.name}
                        {kot.showItemNotes && i.notes && <div style={{ fontSize: Math.max(kot.fontSize - 3, 9), fontStyle: 'italic', fontWeight: 400 }}>» {i.notes}</div>}
                      </td>
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

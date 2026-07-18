'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney } from '@/lib/api';
import { downloadCsv, toCsv } from '@/lib/csv';
import { exportPdf } from '@/lib/pdf';
import { adToBs, formatBsLong, fyRangeAd } from '@/lib/bs-date';
import { PAYMENT_METHOD_LABEL } from '@/lib/constants';
import type { Category, MenuItem, Order, Settings } from '@/lib/types';
import Modal from '@/components/Modal';
import Receipt from '@/components/Receipt';
import { billTemplateOf, getPrinterPrefs, silentPrintArea } from '@/lib/printing';

// Filterable Sales Report: preset views (Detailed · By Item · By Category ·
// By Payment · By Day · KOT · BOT · Cancelled Items), filters for date range /
// category / item / payment method / order type, KPI strip, CSV + PDF export,
// and a 👁 to preview the actual bill behind any row.

interface Col { key: string; label: string; type: 'text' | 'money' | 'number' }
interface Report { title: string; columns: Col[]; rows: Record<string, any>[]; kpis: Record<string, number> }

const PRESETS = [
  { id: 'detail', label: 'Detailed', groupBy: 'detail', station: '' },
  { id: 'item', label: 'By Item', groupBy: 'item', station: '' },
  { id: 'category', label: 'By Category', groupBy: 'category', station: '' },
  { id: 'method', label: 'By Payment', groupBy: 'method', station: '' },
  { id: 'day', label: 'By Day', groupBy: 'day', station: '' },
  { id: 'kot', label: 'KOT Report', groupBy: 'detail', station: 'KITCHEN' },
  { id: 'bot', label: 'BOT Report', groupBy: 'detail', station: 'BAR' },
  { id: 'cancelled', label: 'Cancelled Items', groupBy: 'cancelled', station: '' },
] as const;

const METHODS = ['CASH', 'FONEPAY', 'BANK', 'ESEWA', 'KHALTI', 'CARD', 'CREDIT', 'OFFLINE'];
const TYPES = ['DINE_IN', 'TAKEAWAY', 'DELIVERY'];
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function SalesReportPage() {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>(PRESETS[0]);
  const [from, setFrom] = useState(iso(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [categoryId, setCategoryId] = useState('');
  const [itemId, setItemId] = useState('');
  const [method, setMethod] = useState('');
  const [type, setType] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [billOrder, setBillOrder] = useState<Order | null>(null);
  const [billLoading, setBillLoading] = useState<string | null>(null);

  useEffect(() => {
    api.get<Category[]>('/categories').then(setCategories).catch(() => {});
    api.get<MenuItem[]>('/menu-items').then(setItems).catch(() => {});
    api.get<Settings>('/settings').then(setSettings).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      if (preset.id === 'cancelled') {
        const qs = new URLSearchParams({ from, to });
        setReport(await api.get<Report>(`/mis/cancelled-items?${qs}`));
      } else {
        const qs = new URLSearchParams({
          from, to, groupBy: preset.groupBy,
          ...(preset.station ? { station: preset.station } : {}),
          ...(categoryId ? { categoryId } : {}), ...(itemId ? { itemId } : {}),
          ...(method ? { method } : {}), ...(type ? { type } : {}),
        });
        setReport(await api.get<Report>(`/mis/sales-detail?${qs}`));
      }
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [preset, from, to, categoryId, itemId, method, type]);
  useEffect(() => { load(); }, [load]);

  async function viewBill(orderId: string) {
    setBillLoading(orderId);
    try {
      setBillOrder(await api.get<Order>(`/orders/${orderId}`));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBillLoading(null);
    }
  }

  // Reprint a settled bill straight from the report — same silent-print path
  // the till uses, falling back to the browser print dialog.
  async function reprintBill() {
    if (!billOrder) return;
    const prefs = getPrinterPrefs();
    const tpl = billTemplateOf(settings);
    if (await silentPrintArea({ printer: prefs.bill, widthMm: tpl.paperWidthMm, fontSize: tpl.fontSize })) return;
    document.body.classList.add('print-receipt');
    window.print();
    document.body.classList.remove('print-receipt');
  }
  // Columns change per preset — a stale sort/search would silently no-op.
  useEffect(() => { setSearch(''); setSort(null); }, [preset]);

  function toggleSort(key: string) {
    setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  }

  // Free-text search across every visible column, then optional column sort —
  // both applied client-side so results stay instant while typing.
  const visibleRows = (() => {
    if (!report) return [];
    let rows = report.rows;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => report.columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q)));
    if (sort) {
      const { key, dir } = sort;
      const col = report.columns.find((c) => c.key === key);
      rows = [...rows].sort((a, b) => {
        if (col?.type === 'text') return dir * String(a[key] ?? '').localeCompare(String(b[key] ?? ''));
        return dir * ((Number(a[key]) || 0) - (Number(b[key]) || 0));
      });
    }
    return rows;
  })();
  // "detail"/"kot"/"bot"/"cancelled" rows carry an orderId (not shown as a
  // column) — aggregated views (by item/category/etc.) don't map to one bill.
  const hasBillLink = report?.rows.some((r) => r.orderId) ?? false;

  const activeFilters = [
    categoryId && `Category: ${categories.find((c) => c.id === categoryId)?.name}`,
    itemId && `Item: ${items.find((i) => i.id === itemId)?.name}`,
    method && `Tender: ${PAYMENT_METHOD_LABEL[method as never] ?? method}`,
    type && `Type: ${type.replace('_', ' ')}`,
    preset.station && `Station: ${preset.station}`,
  ].filter(Boolean) as string[];

  const title = preset.id === 'kot' ? 'KOT Report (Kitchen items)' : preset.id === 'bot' ? 'BOT Report (Bar items)' : report?.title ?? 'Sales Report';
  const subtitle = `${from} → ${to}${activeFilters.length ? ' · ' + activeFilters.join(' · ') : ''}`;

  function csv() {
    if (!report) return;
    downloadCsv(`sales-report-${preset.id}-${from}-to-${to}.csv`, toCsv(
      report.columns.map((c) => c.label),
      visibleRows.map((r) => report.columns.map((c) => (c.type === 'money' ? ((Number(r[c.key]) || 0) / 100).toFixed(2) : r[c.key] ?? ''))),
    ));
  }
  function pdf() {
    if (!report) return;
    exportPdf({ title, subtitle, columns: report.columns, rows: visibleRows, restaurantName: settings?.restaurantName ?? 's3vyaPOS' });
  }

  const sel = 'input w-auto min-w-[10rem]';
  const th = 'p-2 text-xs font-semibold uppercase tracking-wide text-slate-400 select-none';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Sticky header: title + presets + filters */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 p-4 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95 sm:px-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Sales Reports</h1>
            <p className="text-xs text-slate-400">{formatBsLong(new Date())} BS</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={csv} disabled={!visibleRows.length}>⬇ CSV</button>
            <button className="btn-ghost" onClick={pdf} disabled={!visibleRows.length}>⬇ PDF</button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => setPreset(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                preset.id === p.id ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800'
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[0, 1].map((back) => {
            const b = adToBs(new Date());
            const fy = (b.month >= 4 ? b.year : b.year - 1) - back;
            return (
              <button key={fy} className="btn-ghost whitespace-nowrap text-xs" title={`Shrawan 1 ${fy} → Ashadh end ${fy + 1}`}
                onClick={() => { const r = fyRangeAd(fy); setFrom(iso(r.start)); setTo(iso(r.end > new Date() ? new Date() : r.end)); }}>
                {back === 0 ? 'This FY' : 'Last FY'} {fy}/{(fy + 1) % 100}
              </button>
            );
          })}
          <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <span className="text-slate-400">→</span>
          <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          {preset.id !== 'cancelled' && (
            <>
              <select className={sel} value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setItemId(''); }} aria-label="Category filter">
                <option value="">All categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className={sel} value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Item filter">
                <option value="">All items</option>
                {items.filter((i) => !categoryId || i.categoryId === categoryId).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <select className={sel} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method filter">
                <option value="">All payments</option>
                {METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m as never] ?? m}</option>)}
              </select>
              <select className={sel} value={type} onChange={(e) => setType(e.target.value)} aria-label="Order type filter">
                <option value="">All order types</option>
                {TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </>
          )}
          {activeFilters.length > 0 && (
            <button className="text-xs text-brand-600 underline decoration-dotted"
              onClick={() => { setCategoryId(''); setItemId(''); setMethod(''); setType(''); }}>
              Clear filters
            </button>
          )}
          <div className="relative ml-auto">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search this report…"
              className="input w-56 pl-8"
              aria-label="Search report rows"
            />
            <svg className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

        {report && (
          <>
            {/* KPI strip */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(preset.id === 'cancelled' ? [
                ['Cancelled lines', String(report.kpis.lines)],
                ['Items cancelled', String(report.kpis.qty)],
                ['Value cancelled', formatMoney(report.kpis.valueCents)],
              ] : [
                ['Net sales', formatMoney(report.kpis.grossCents)],
                ['Invoices', String(report.kpis.invoices)],
                ['Items sold', String(report.kpis.qty)],
                ['Item discounts', formatMoney(report.kpis.discountCents)],
              ]).map(([l, v]) => (
                <div key={l} className="card p-3">
                  <div className="truncate text-lg font-bold text-slate-900">{v}</div>
                  <div className="text-xs text-slate-500">{l}</div>
                </div>
              ))}
            </div>

            <div className="card overflow-x-auto">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span className="text-sm font-semibold text-slate-700">{title}</span>
                <span className="text-xs text-slate-400">
                  {visibleRows.length === report.rows.length ? `${report.rows.length} row${report.rows.length === 1 ? '' : 's'}` : `${visibleRows.length} of ${report.rows.length} rows`}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {report.columns.map((c) => (
                      <th key={c.key} className={`${th} sticky top-0 z-[1] cursor-pointer bg-white hover:text-slate-600 dark:bg-slate-800 ${c.type === 'text' ? 'text-left' : 'text-right'}`}
                        onClick={() => toggleSort(c.key)}>
                        <span className="inline-flex items-center gap-1">
                          {c.label}
                          {sort?.key === c.key && <span className="text-brand-600">{sort.dir === 1 ? '▲' : '▼'}</span>}
                        </span>
                      </th>
                    ))}
                    {hasBillLink && <th className={`${th} sticky top-0 z-[1] w-10 bg-white text-center dark:bg-slate-800`}>Bill</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {visibleRows.map((r, i) => (
                    <tr key={i}>
                      {report.columns.map((c) => (
                        <td key={c.key} className={`p-2 text-slate-600 ${c.type === 'text' ? 'text-left' : 'text-right tabular-nums'}`}>
                          {c.type === 'money' ? (r[c.key] ? formatMoney(Number(r[c.key])) : '—') : String(r[c.key] ?? '')}
                        </td>
                      ))}
                      {hasBillLink && (
                        <td className="p-2 text-center">
                          {r.orderId && (
                            <button
                              onClick={() => viewBill(r.orderId)}
                              disabled={billLoading === r.orderId}
                              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-40 dark:hover:bg-slate-700"
                              title="View bill"
                              aria-label="View bill"
                            >
                              {billLoading === r.orderId ? '…' : '👁'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {visibleRows.length === 0 && !loading && (
                    <tr><td colSpan={report.columns.length + (hasBillLink ? 1 : 0)} className="p-10 text-center text-slate-400">{search ? 'No rows match your search.' : 'No sales match these filters.'}</td></tr>
                  )}
                </tbody>
                {visibleRows.length > 1 && (
                  <tfoot>
                    <tr className="border-t border-slate-200 font-semibold text-slate-800">
                      {report.columns.map((c, i) => (
                        <td key={c.key} className={`p-2 ${c.type === 'text' ? 'text-left' : 'text-right tabular-nums'}`}>
                          {i === 0 ? 'Totals' : c.type === 'money' ? formatMoney(visibleRows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0))
                            : c.key === 'qty' ? visibleRows.reduce((s, r) => s + (Number(r.qty) || 0), 0) : ''}
                        </td>
                      ))}
                      {hasBillLink && <td />}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
        {loading && <p className="mt-4 text-sm text-slate-400">Loading…</p>}
      </div>

      {/* Bill preview — the actual receipt behind a report row */}
      <Modal open={!!billOrder} title={billOrder ? `Bill #${billOrder.number}` : ''} onClose={() => setBillOrder(null)}>
        {billOrder && (
          <div className="space-y-3">
            <div className="receipt-preview mx-auto max-w-xs rounded-lg border border-slate-200 bg-white p-3 text-black dark:border-slate-700">
              <Receipt order={billOrder} settings={settings} mode="BILL" docTitle={billOrder.status === 'PAID' ? 'TAX INVOICE' : undefined} />
            </div>
            <button onClick={reprintBill} className="btn-primary w-full">🖨 Reprint bill</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney } from '@/lib/api';
import { downloadCsv, toCsv } from '@/lib/csv';
import { adToBs, formatBsLong } from '@/lib/bs-date';

// MIS & statutory reports (RestroX-style): a grouped report picker on the left,
// and one generic renderer — every report arrives in the same
// { title, columns, rows } shape from /api/mis/*, so tables and CSV export are
// fully generic.

interface MisColumn { key: string; label: string; type: 'text' | 'money' | 'number' }
interface MisReport { title: string; columns: MisColumn[]; rows: Record<string, string | number | null>[]; note?: string }

type Params = 'range' | 'fy' | 'none';
interface Def { id: string; label: string; endpoint: string; params: Params; isNew?: boolean }

const GROUPS: { group: string; reports: Def[] }[] = [
  {
    group: 'Accounting',
    reports: [
      { id: 'account-summary', label: 'Account Summary', endpoint: '/mis/account-summary', params: 'range' },
    ],
  },
  {
    group: 'Tax Report (Nepal)',
    reports: [
      { id: 'vat-summary', label: 'VAT Summary Report', endpoint: '/mis/vat-summary', params: 'fy' },
      { id: 'sales-returns', label: 'Sales Return Register', endpoint: '/mis/sales-returns', params: 'range' },
    ],
  },
  {
    group: 'Sales',
    reports: [
      { id: 'daily-sales', label: 'Daily Sales Summary', endpoint: '/mis/daily-sales', params: 'range' },
      { id: 'collections', label: 'Sales Collection Report', endpoint: '/mis/collections', params: 'range' },
      { id: 'dish-monthly', label: 'Dish Monthly Sales', endpoint: '/mis/monthly-sales/item', params: 'fy' },
      { id: 'category-monthly', label: 'Category Monthly Sales', endpoint: '/mis/monthly-sales/category', params: 'fy' },
      { id: 'customer-monthly', label: 'Customer Monthly Sales', endpoint: '/mis/monthly-sales/customer', params: 'fy' },
    ],
  },
  {
    group: 'Receivable & Payable',
    reports: [
      { id: 'party-balances', label: 'Party Balance Report', endpoint: '/mis/party-balances', params: 'none' },
    ],
  },
  {
    group: 'Inventory',
    reports: [
      { id: 'stock-ledger', label: 'Stock Item Ledger Summary', endpoint: '/mis/stock-ledger', params: 'range' },
    ],
  },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const currentFy = () => { const b = adToBs(new Date()); return b.month >= 4 ? b.year : b.year - 1; };

export default function MisPage() {
  const [def, setDef] = useState<Def>(GROUPS[2].reports[0]); // Daily Sales Summary
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [fy, setFy] = useState(currentFy());
  const [report, setReport] = useState<MisReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = def.params === 'range' ? `?from=${from}&to=${to}` : def.params === 'fy' ? `?fy=${fy}` : '';
      setReport(await api.get<MisReport>(`${def.endpoint}${qs}`));
    } catch (e) {
      setErr((e as Error).message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [def, from, to, fy]);
  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!report) return;
    downloadCsv(`${def.id}.csv`, toCsv(
      report.columns.map((c) => c.label),
      report.rows.map((r) => report.columns.map((c) => {
        const v = r[c.key];
        return c.type === 'money' ? ((Number(v) || 0) / 100).toFixed(2) : v ?? '';
      })),
    ));
  }

  const cell = (c: MisColumn, v: string | number | null) =>
    c.type === 'money' ? (v ? formatMoney(Number(v)) : '—') : String(v ?? '');
  const moneyTotals = report?.columns.filter((c) => c.type === 'money') ?? [];

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Report picker */}
      <aside className="w-full shrink-0 overflow-y-auto border-b border-slate-200 p-4 dark:border-slate-700 md:w-72 md:border-b-0 md:border-r">
        <h1 className="mb-1 text-lg font-bold text-slate-900">MIS Reports</h1>
        <p className="mb-4 text-xs text-slate-400">{formatBsLong(new Date())} BS</p>
        {GROUPS.map((g) => (
          <div key={g.group} className="mb-4">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.group}</div>
            <div className="space-y-0.5">
              {g.reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setReport(null); setDef(r); }}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    def.id === r.id ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10' : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      {/* Report body */}
      <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">{report?.title ?? def.label}</h2>
          <div className="flex flex-wrap items-end gap-2">
            {def.params === 'range' && (
              <>
                <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
                <span className="text-slate-400">→</span>
                <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
              </>
            )}
            {def.params === 'fy' && (
              <select className="input w-auto" value={fy} onChange={(e) => setFy(Number(e.target.value))}>
                {[0, 1, 2].map((d) => {
                  const y = currentFy() - d;
                  return <option key={y} value={y}>FY {y}/{(y + 1) % 100}</option>;
                })}
              </select>
            )}
            <button className="btn-ghost" onClick={exportCsv} disabled={!report?.rows.length}>⬇ CSV</button>
            <button className="btn-ghost" onClick={() => window.print()}>🖨 Print</button>
          </div>
        </div>

        {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {loading && <p className="text-sm text-slate-400">Loading…</p>}

        {report && !loading && (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {report.columns.map((c) => (
                    <th key={c.key} className={`p-2 text-xs font-semibold uppercase tracking-wide text-slate-400 ${c.type === 'text' ? 'text-left' : 'text-right'}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {report.rows.map((r, i) => (
                  <tr key={i}>
                    {report.columns.map((c) => (
                      <td key={c.key} className={`p-2 text-slate-600 ${c.type === 'text' ? 'text-left' : 'text-right tabular-nums'}`}>
                        {cell(c, r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                {report.rows.length === 0 && (
                  <tr><td colSpan={report.columns.length} className="p-8 text-center text-slate-400">No data for this period.</td></tr>
                )}
              </tbody>
              {report.rows.length > 1 && moneyTotals.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200 font-semibold text-slate-800">
                    {report.columns.map((c, i) => (
                      <td key={c.key} className={`p-2 ${c.type === 'text' ? 'text-left' : 'text-right tabular-nums'}`}>
                        {i === 0 ? 'Totals' : c.type === 'money'
                          ? formatMoney(report.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0))
                          : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {report?.note && <p className="mt-3 text-xs text-slate-400">{report.note}</p>}
      </main>
    </div>
  );
}

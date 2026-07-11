'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney } from '@/lib/api';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatBsLong } from '@/lib/bs-date';

// Accounting books (Tally / Busy-style), derived live from POS operations:
// Day Book · Sales Book · Purchase Register · Cash Book · Bank Book ·
// Balance Sheet (P&L lives under Finance). Every book exports to CSV.

const TABS = ['Day Book', 'Sales Book', 'Purchase Register', 'Cash Book', 'Bank Book', 'Balance Sheet'] as const;
type Tab = (typeof TABS)[number];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>('Day Book');
  const [from, setFrom] = useState(iso(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [date, setDate] = useState(iso(new Date()));
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const url =
        tab === 'Day Book' ? `/accounting/day-book?date=${date}` :
        tab === 'Sales Book' ? `/accounting/sales-book?from=${from}&to=${to}` :
        tab === 'Purchase Register' ? `/accounting/purchase-register?from=${from}&to=${to}` :
        tab === 'Cash Book' ? `/accounting/cash-book?from=${from}&to=${to}` :
        tab === 'Bank Book' ? `/accounting/bank-book?from=${from}&to=${to}` :
        `/accounting/balance-sheet?asOf=${to}`;
      setData(await api.get(url));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tab, from, to, date]);
  useEffect(() => { load(); }, [load]);

  const rs = (c: number) => (c / 100).toFixed(2);

  function exportCsv() {
    if (!data) return;
    const file = `${tab.toLowerCase().replace(/ /g, '-')}.csv`;
    if (tab === 'Sales Book') {
      downloadCsv(file, toCsv(
        ['Date (BS)', 'Invoice', 'Party', 'Type', 'Net', 'VAT', 'Total', 'Tenders'],
        data.rows.map((r: any) => [r.dateBs, r.invoice, r.party, r.type, rs(r.netCents), rs(r.vatCents), rs(r.totalCents), r.tenders]),
      ));
    } else if (tab === 'Purchase Register') {
      downloadCsv(file, toCsv(
        ['Date (BS)', 'PO #', 'Supplier', 'Status', 'Items', 'Amount'],
        data.rows.map((r: any) => [r.dateBs, r.number, r.supplier, r.status, r.items, rs(r.amountCents)]),
      ));
    } else if (tab === 'Cash Book') {
      downloadCsv(file, toCsv(
        ['Date (BS)', 'Time', 'Particulars', 'Receipt', 'Payment', 'Balance'],
        data.rows.map((r: any) => [r.dateBs, new Date(r.at).toLocaleTimeString(), r.particulars, rs(r.receiptCents), rs(r.paymentCents), rs(r.balanceCents)]),
      ));
    } else if (tab === 'Bank Book') {
      downloadCsv(file, toCsv(
        ['Date (BS)', 'Time', 'Method', 'Particulars', 'Amount', 'Balance'],
        data.rows.map((r: any) => [r.dateBs, new Date(r.at).toLocaleTimeString(), r.method, r.particulars, rs(r.amountCents), rs(r.balanceCents)]),
      ));
    } else if (tab === 'Day Book') {
      downloadCsv(file, toCsv(
        ['Time', 'Kind', 'Particulars', 'Dr (in)', 'Cr (out)'],
        data.entries.map((e: any) => [new Date(e.at).toLocaleTimeString(), e.kind, e.particulars, rs(e.drCents), rs(e.crCents)]),
      ));
    } else {
      downloadCsv(file, toCsv(['Head', 'Amount'], [
        ['ASSETS', ''],
        ['Cash in hand', rs(data.assets.cashInHandCents)],
        ['Bank / wallets', rs(data.assets.bankBalanceCents)],
        ['Accounts receivable', rs(data.assets.accountsReceivableCents)],
        ['Inventory', rs(data.assets.inventoryCents)],
        ['Total assets', rs(data.assets.totalCents)],
        ['LIABILITIES', ''],
        ['Accounts payable', rs(data.liabilities.accountsPayableCents)],
        ['VAT payable', rs(data.liabilities.vatPayableCents)],
        ['Total liabilities', rs(data.liabilities.totalCents)],
        ['EQUITY', ''],
        ['Retained earnings (balancing)', rs(data.equity.retainedEarningsCents)],
      ]));
    }
  }

  const th = 'p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400';
  const td = 'p-2 text-slate-600';
  const tdr = 'p-2 text-right text-slate-600 tabular-nums';

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounting</h1>
          <p className="text-sm text-slate-500">Books of account, derived live from operations · {formatBsLong(new Date())} BS</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {tab === 'Day Book' ? (
            <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
          ) : tab === 'Balance Sheet' ? (
            <label className="text-xs text-slate-400">as of <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          ) : (
            <>
              <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-slate-400">→</span>
              <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
          <button className="btn-ghost" onClick={exportCsv} disabled={!data}>⬇ CSV</button>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => { setData(null); setTab(t); }}
            className={`badge px-3 py-1.5 ${tab === t ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
            {t}
          </button>
        ))}
        <a href="/finance" className="badge border border-slate-200 bg-white px-3 py-1.5 text-slate-600">P&amp;L →</a>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!data && !error && <p className="text-sm text-slate-400">Loading…</p>}

      {data && tab === 'Sales Book' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100"><th className={th}>Date (BS)</th><th className={th}>Invoice</th><th className={th}>Party</th><th className={th}>Type</th><th className={`${th} text-right`}>Net</th><th className={`${th} text-right`}>VAT</th><th className={`${th} text-right`}>Total</th><th className={th}>Tender</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {data.rows.map((r: any) => (
                <tr key={r.invoice}><td className={`${td} tabular-nums`}>{r.dateBs}</td><td className={`${td} font-medium`}>#{r.invoice}</td><td className={td}>{r.party}</td><td className={td}>{r.type.replace('_', ' ')}</td><td className={tdr}>{formatMoney(r.netCents)}</td><td className={tdr}>{formatMoney(r.vatCents)}</td><td className={`${tdr} font-semibold`}>{formatMoney(r.totalCents)}</td><td className={`${td} text-xs`}>{r.tenders}</td></tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-slate-200 font-semibold text-slate-800"><td className="p-2" colSpan={4}>Totals ({data.totals.count})</td><td className={tdr}>{formatMoney(data.totals.netCents)}</td><td className={tdr}>{formatMoney(data.totals.vatCents)}</td><td className={tdr}>{formatMoney(data.totals.totalCents)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}

      {data && tab === 'Purchase Register' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100"><th className={th}>Date (BS)</th><th className={th}>PO #</th><th className={th}>Supplier</th><th className={th}>Status</th><th className={`${th} text-right`}>Lines</th><th className={`${th} text-right`}>Amount</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {data.rows.map((r: any) => (
                <tr key={r.number}><td className={`${td} tabular-nums`}>{r.dateBs}</td><td className={`${td} font-medium`}>#{r.number}</td><td className={td}>{r.supplier}</td><td className={td}><span className="badge bg-slate-100 text-slate-500">{r.status}</span></td><td className={tdr}>{r.items}</td><td className={`${tdr} font-semibold`}>{formatMoney(r.amountCents)}</td></tr>
              ))}
              {data.rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">No purchases in range.</td></tr>}
            </tbody>
            <tfoot><tr className="border-t border-slate-200 font-semibold text-slate-800"><td className="p-2" colSpan={5}>Total ({data.totals.count})</td><td className={tdr}>{formatMoney(data.totals.amountCents)}</td></tr></tfoot>
          </table>
        </div>
      )}

      {data && (tab === 'Cash Book' || tab === 'Bank Book') && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100"><th className={th}>Date (BS)</th>{tab === 'Bank Book' && <th className={th}>Method</th>}<th className={th}>Particulars</th><th className={`${th} text-right`}>{tab === 'Cash Book' ? 'Receipt' : 'Amount'}</th>{tab === 'Cash Book' && <th className={`${th} text-right`}>Payment</th>}<th className={`${th} text-right`}>Balance</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {data.rows.map((r: any, i: number) => (
                <tr key={i}>
                  <td className={`${td} tabular-nums`}>{r.dateBs} <span className="text-xs text-slate-300">{new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
                  {tab === 'Bank Book' && <td className={td}><span className="badge bg-slate-100 text-slate-500">{r.method}</span></td>}
                  <td className={td}>{r.particulars}</td>
                  <td className={`${tdr} text-emerald-600`}>{tab === 'Cash Book' ? (r.receiptCents ? formatMoney(r.receiptCents) : '') : formatMoney(r.amountCents)}</td>
                  {tab === 'Cash Book' && <td className={`${tdr} text-red-500`}>{r.paymentCents ? formatMoney(r.paymentCents) : ''}</td>}
                  <td className={`${tdr} font-medium`}>{formatMoney(r.balanceCents)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">No entries in range.</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-semibold text-slate-800">
                <td className="p-2" colSpan={tab === 'Bank Book' ? 3 : 2}>Totals</td>
                <td className={tdr}>{formatMoney(data.totals.receiptsCents)}</td>
                {tab === 'Cash Book' && <td className={tdr}>{formatMoney(data.totals.paymentsCents)}</td>}
                <td className={tdr}>{formatMoney(tab === 'Cash Book' ? data.totals.netCents : data.totals.receiptsCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {data && tab === 'Day Book' && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ['Sales', data.totals.salesCents], ['Cash in', data.totals.cashReceiptsCents], ['Cash out', data.totals.cashPaymentsCents],
              ['Bank in', data.totals.bankReceiptsCents], ['Purchases', data.totals.purchasesCents],
            ].map(([l, v]) => (
              <div key={l as string} className="card p-3"><div className="text-lg font-bold text-slate-900">{formatMoney(v as number)}</div><div className="text-xs text-slate-500">{l}</div></div>
            ))}
          </div>
          <div className="card overflow-x-auto">
            <div className="border-b border-slate-100 p-3 text-sm font-semibold text-slate-700">Day Book — {data.dateBs} BS ({data.dateAd})</div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100"><th className={th}>Time</th><th className={th}>Kind</th><th className={th}>Particulars</th><th className={`${th} text-right`}>In (Dr)</th><th className={`${th} text-right`}>Out (Cr)</th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {data.entries.map((e: any, i: number) => (
                  <tr key={i}><td className={td}>{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td className={td}><span className="badge bg-slate-100 text-slate-500">{e.kind}</span></td><td className={td}>{e.particulars}</td><td className={`${tdr} text-emerald-600`}>{e.drCents ? formatMoney(e.drCents) : ''}</td><td className={`${tdr} text-red-500`}>{e.crCents ? formatMoney(e.crCents) : ''}</td></tr>
                ))}
                {data.entries.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">No transactions on this day.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data && tab === 'Balance Sheet' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h2 className="mb-3 font-semibold text-slate-800">Assets</h2>
            {[['Cash in hand', data.assets.cashInHandCents], ['Bank / wallets', data.assets.bankBalanceCents], ['Accounts receivable (credit)', data.assets.accountsReceivableCents], ['Inventory (at cost)', data.assets.inventoryCents]].map(([l, v]) => (
              <div key={l as string} className="flex justify-between border-b border-slate-50 py-1.5 text-sm"><span className="text-slate-600">{l}</span><span className="font-medium tabular-nums">{formatMoney(v as number)}</span></div>
            ))}
            <div className="mt-2 flex justify-between text-sm font-bold text-slate-900"><span>Total assets</span><span className="tabular-nums">{formatMoney(data.assets.totalCents)}</span></div>
          </div>
          <div className="space-y-4">
            <div className="card p-5">
              <h2 className="mb-3 font-semibold text-slate-800">Liabilities</h2>
              {[['Accounts payable (received POs)', data.liabilities.accountsPayableCents], ['VAT payable (collected)', data.liabilities.vatPayableCents]].map(([l, v]) => (
                <div key={l as string} className="flex justify-between border-b border-slate-50 py-1.5 text-sm"><span className="text-slate-600">{l}</span><span className="font-medium tabular-nums">{formatMoney(v as number)}</span></div>
              ))}
              <div className="mt-2 flex justify-between text-sm font-bold text-slate-900"><span>Total liabilities</span><span className="tabular-nums">{formatMoney(data.liabilities.totalCents)}</span></div>
            </div>
            <div className="card p-5">
              <h2 className="mb-3 font-semibold text-slate-800">Equity</h2>
              <div className="flex justify-between text-sm"><span className="text-slate-600">Retained earnings (balancing figure)</span><span className="font-bold tabular-nums">{formatMoney(data.equity.retainedEarningsCents)}</span></div>
            </div>
            <p className="text-xs text-slate-400">As of {data.asOfBs} BS · {data.note}</p>
          </div>
        </div>
      )}
    </div>
  );
}

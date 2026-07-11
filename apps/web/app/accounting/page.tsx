'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney } from '@/lib/api';
import { downloadCsv, toCsv, exportObjects } from '@/lib/csv';
import { formatBsLong } from '@/lib/bs-date';

// Accounting books (Tally / Busy-style), derived live from POS operations:
// Day Book · Sales Book · Purchase Register · Cash Book · Bank Book ·
// Balance Sheet (P&L lives under Finance). Every book exports to CSV.

const TABS = ['Day Book', 'Sales Book', 'Purchase Register', 'Cash Book', 'Bank Book', 'Journal', 'Ledger', 'Trial Balance', 'Chart of Accounts', 'Balance Sheet'] as const;
type Tab = (typeof TABS)[number];

interface Account {
  id: string; code: string; name: string; type: string; group?: string | null;
  isSystem: boolean; drCents?: number; crCents?: number; balanceCents?: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>('Day Book');
  const [from, setFrom] = useState(iso(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [date, setDate] = useState(iso(new Date()));
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const SELF_LOADING: Tab[] = ['Journal', 'Ledger', 'Trial Balance', 'Chart of Accounts'];
  const load = useCallback(async () => {
    setError(null);
    if (SELF_LOADING.includes(tab)) return; // those tabs fetch their own data
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          {!SELF_LOADING.includes(tab) && <button className="btn-ghost" onClick={exportCsv} disabled={!data}>⬇ CSV</button>}
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
      {!data && !error && !SELF_LOADING.includes(tab) && <p className="text-sm text-slate-400">Loading…</p>}

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

      {tab === 'Journal' && <JournalTab from={from} to={to} />}
      {tab === 'Ledger' && <LedgerTab from={from} to={to} />}
      {tab === 'Trial Balance' && <TrialTab from={from} to={to} />}
      {tab === 'Chart of Accounts' && <ChartTab />}

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

// ═══════════════════════════════════════════════════════
// Double-entry tabs: Chart of Accounts · Journal · Ledger · Trial Balance
// ═══════════════════════════════════════════════════════

const TYPE_BADGE: Record<string, string> = {
  ASSET: 'bg-emerald-100 text-emerald-700',
  LIABILITY: 'bg-red-100 text-red-600',
  EQUITY: 'bg-indigo-100 text-indigo-700',
  INCOME: 'bg-blue-100 text-blue-700',
  EXPENSE: 'bg-amber-100 text-amber-700',
};
const thc = 'p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400';
const tdc = 'p-2 text-slate-600';
const tdrc = 'p-2 text-right text-slate-600 tabular-nums';

// ── Chart of Accounts ─────────────────────────────────
function ChartTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', name: '', type: 'EXPENSE', group: '' });

  const load = useCallback(() => {
    api.get<Account[]>('/accounting/accounts').then(setAccounts).catch((e) => setErr((e as Error).message));
  }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/accounting/accounts', { ...form, group: form.group || undefined });
      setForm({ code: '', name: '', type: 'EXPENSE', group: '' });
      load();
    } catch (er) { alert((er as Error).message); }
  }
  async function rename(a: Account) {
    const name = prompt('Rename account:', a.name);
    if (!name?.trim()) return;
    try { await api.patch(`/accounting/accounts/${a.id}`, { name: name.trim() }); load(); }
    catch (er) { alert((er as Error).message); }
  }
  async function remove(a: Account) {
    if (!confirm(`Delete/deactivate account ${a.code} — ${a.name}?`)) return;
    try { await api.delete(`/accounting/accounts/${a.id}`); load(); }
    catch (er) { alert((er as Error).message); }
  }

  const groups = Array.from(new Set(accounts.map((a) => a.group ?? 'Other')));

  return (
    <div className="space-y-5">
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <form onSubmit={add} className="card flex flex-wrap items-end gap-2 p-4">
        <div><label className="label">Code</label><input className="input w-24" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="5600" required /></div>
        <div className="min-w-[180px] flex-1"><label className="label">Account name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Fuel & Gas" required /></div>
        <div><label className="label">Type</label>
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map((t) => <option key={t}>{t}</option>)}
          </select></div>
        <div><label className="label">Group</label><input className="input w-44" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} placeholder="Indirect Expenses" /></div>
        <button className="btn-primary">+ Add account</button>
        <button type="button" className="btn-ghost" onClick={() => exportObjects('chart-of-accounts.csv', accounts.map((a) => ({ code: a.code, name: a.name, type: a.type, group: a.group ?? '', balance: ((a.balanceCents ?? 0) / 100).toFixed(2) })))}>⬇ CSV</button>
      </form>

      {groups.map((g) => (
        <div key={g} className="card overflow-x-auto">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{g}</div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-50">
              {accounts.filter((a) => (a.group ?? 'Other') === g).map((a) => (
                <tr key={a.id}>
                  <td className={`${tdc} w-20 font-mono`}>{a.code}</td>
                  <td className={`${tdc} font-medium text-slate-700`}>{a.name} {a.isSystem && <span className="badge ml-1 bg-slate-100 text-[10px] text-slate-400">system · live POS</span>}</td>
                  <td className={tdc}><span className={`badge ${TYPE_BADGE[a.type]}`}>{a.type}</span></td>
                  <td className={`${tdrc} font-semibold`}>{formatMoney(a.balanceCents ?? 0)}</td>
                  <td className="w-20 p-2 text-right">
                    <button title="Rename" onClick={() => rename(a)} className="px-1 text-slate-400 hover:text-slate-600">✏️</button>
                    {!a.isSystem && <button title="Delete" onClick={() => remove(a)} className="px-1 text-slate-400 hover:text-red-600">🗑</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="text-xs text-slate-400">Balances shown are from manual journal vouchers; system accounts additionally merge live POS activity in their Ledger view.</p>
    </div>
  );
}

// ── Journal (manual vouchers) ─────────────────────────
function JournalTab({ from, to }: { from: string; to: string }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [vType, setVType] = useState('JOURNAL');
  const [vDate, setVDate] = useState(new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<{ accountId: string; dr: string; cr: string }[]>([
    { accountId: '', dr: '', cr: '' }, { accountId: '', dr: '', cr: '' },
  ]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<any[]>(`/accounting/journal?from=${from}&to=${to}`).then(setEntries).catch((e) => setErr((e as Error).message));
    api.get<Account[]>('/accounting/accounts').then(setAccounts).catch(() => {});
  }, [from, to]);
  useEffect(load, [load]);

  const cents = (v: string) => Math.round((parseFloat(v) || 0) * 100);
  const drTotal = lines.reduce((s, l) => s + cents(l.dr), 0);
  const crTotal = lines.reduce((s, l) => s + cents(l.cr), 0);
  const balanced = drTotal > 0 && drTotal === crTotal;

  async function save() {
    setBusy(true);
    try {
      await api.post('/accounting/journal', {
        date: vDate, type: vType, narration,
        lines: lines.filter((l) => l.accountId && (cents(l.dr) > 0 || cents(l.cr) > 0))
          .map((l) => ({ accountId: l.accountId, drCents: cents(l.dr), crCents: cents(l.cr) })),
      });
      setOpen(false);
      setNarration('');
      setLines([{ accountId: '', dr: '', cr: '' }, { accountId: '', dr: '', cr: '' }]);
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally { setBusy(false); }
  }
  async function remove(id: string, number: number) {
    if (!confirm(`Delete voucher #${number}? This is audited.`)) return;
    try { await api.delete(`/accounting/journal/${id}`); load(); } catch (e) { alert((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">Manual vouchers (Journal / Payment / Receipt / Contra). Creating and deleting needs a manager/admin sign-in.</p>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => exportObjects('journal.csv', entries.flatMap((e) => e.lines.map((l: any) => ({ voucher: e.number, dateBS: e.dateBs, type: e.type, account: `${l.account.code} ${l.account.name}`, dr: (l.drCents / 100).toFixed(2), cr: (l.crCents / 100).toFixed(2), narration: e.narration ?? '' }))))}>⬇ CSV</button>
          <button className="btn-primary" onClick={() => setOpen(true)}>+ New voucher</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100"><th className={thc}>Vch #</th><th className={thc}>Date (BS)</th><th className={thc}>Type</th><th className={thc}>Narration</th><th className={thc}>Accounts</th><th className={`${thc} text-right`}>Amount</th><th className="p-2" /></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className={`${tdc} font-medium`}>#{e.number}</td>
                <td className={`${tdc} tabular-nums`}>{e.dateBs}</td>
                <td className={tdc}><span className="badge bg-slate-100 text-slate-500">{e.type}</span></td>
                <td className={tdc}>{e.narration ?? '—'}</td>
                <td className={`${tdc} text-xs`}>{e.lines.map((l: any) => `${l.drCents ? 'Dr' : 'Cr'} ${l.account.name}`).join(' · ')}</td>
                <td className={`${tdrc} font-semibold`}>{formatMoney(e.amountCents)}</td>
                <td className="p-2 text-right"><button onClick={() => remove(e.id, e.number)} className="text-slate-300 hover:text-red-600">🗑</button></td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400">No vouchers in range — create one with “+ New voucher”.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-bold text-slate-800">New voucher</h2>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div><label className="label">Type</label>
                <select className="input" value={vType} onChange={(e) => setVType(e.target.value)}>
                  {['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA'].map((t) => <option key={t}>{t}</option>)}
                </select></div>
              <div><label className="label">Date</label><input type="date" className="input" value={vDate} onChange={(e) => setVDate(e.target.value)} /></div>
              <div className="col-span-2 sm:col-span-1"><label className="label">Narration</label><input className="input" value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="e.g. Rent for Ashadh" /></div>
            </div>

            <div className="mb-2 grid grid-cols-[1fr_7rem_7rem_2rem] gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>Account</span><span className="text-right">Dr (Rs)</span><span className="text-right">Cr (Rs)</span><span />
            </div>
            {lines.map((l, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_7rem_7rem_2rem] items-center gap-2">
                <select className="input" value={l.accountId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, accountId: e.target.value } : x)))}>
                  <option value="">— account —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                </select>
                <input className="input text-right" inputMode="decimal" value={l.dr} placeholder="0.00" onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, dr: e.target.value, cr: e.target.value ? '' : x.cr } : x)))} />
                <input className="input text-right" inputMode="decimal" value={l.cr} placeholder="0.00" onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, cr: e.target.value, dr: e.target.value ? '' : x.dr } : x)))} />
                <button className="text-slate-300 hover:text-red-500" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length <= 2}>✕</button>
              </div>
            ))}
            <button className="btn-ghost mb-3 text-xs" onClick={() => setLines([...lines, { accountId: '', dr: '', cr: '' }])}>+ line</button>

            <div className={`mb-4 flex justify-between rounded-lg px-3 py-2 text-sm font-semibold ${balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              <span>Dr {formatMoney(drTotal)} · Cr {formatMoney(crTotal)}</span>
              <span>{balanced ? '✓ Balanced' : 'Not balanced'}</span>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={!balanced || busy} onClick={save}>{busy ? 'Saving…' : 'Save voucher'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ledger statement ──────────────────────────────────
function LedgerTab({ from, to }: { from: string; to: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get<Account[]>('/accounting/accounts').then((a) => {
      setAccounts(a);
      if (!accountId && a.length) setAccountId(a[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!accountId) return;
    api.get(`/accounting/ledger/${accountId}?from=${from}&to=${to}`).then(setData).catch(() => setData(null));
  }, [accountId, from, to]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto min-w-[260px]" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select>
        {data && <button className="btn-ghost" onClick={() => exportObjects(`ledger-${data.account.code}.csv`, data.rows.map((r: any) => ({ dateBS: r.dateBs, source: r.source, voucher: r.voucher ?? '', particulars: r.particulars, dr: (r.drCents / 100).toFixed(2), cr: (r.crCents / 100).toFixed(2), balance: (r.balanceCents / 100).toFixed(2) })))}>⬇ CSV</button>}
        {data?.account.isSystem && <span className="badge bg-blue-50 text-blue-600">includes live POS activity</span>}
      </div>
      {data && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100"><th className={thc}>Date (BS)</th><th className={thc}>Source</th><th className={thc}>Particulars</th><th className={`${thc} text-right`}>Dr</th><th className={`${thc} text-right`}>Cr</th><th className={`${thc} text-right`}>Balance</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {data.rows.map((r: any, i: number) => (
                <tr key={i}>
                  <td className={`${tdc} tabular-nums`}>{r.dateBs}</td>
                  <td className={tdc}><span className={`badge ${r.source === 'JOURNAL' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>{r.source === 'JOURNAL' ? r.voucher : 'POS'}</span></td>
                  <td className={tdc}>{r.particulars}</td>
                  <td className={`${tdrc} text-emerald-600`}>{r.drCents ? formatMoney(r.drCents) : ''}</td>
                  <td className={`${tdrc} text-red-500`}>{r.crCents ? formatMoney(r.crCents) : ''}</td>
                  <td className={`${tdrc} font-medium`}>{formatMoney(r.balanceCents)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">No activity in range.</td></tr>}
            </tbody>
            <tfoot><tr className="border-t border-slate-200 font-semibold text-slate-800"><td className="p-2" colSpan={3}>Totals</td><td className={tdrc}>{formatMoney(data.totals.drCents)}</td><td className={tdrc}>{formatMoney(data.totals.crCents)}</td><td className={tdrc}>{formatMoney(data.totals.closingCents)}</td></tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Trial balance ─────────────────────────────────────
function TrialTab({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api.get(`/accounting/trial-balance?from=${from}&to=${to}`).then(setData).catch(() => {});
  }, [from, to]);
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;
  const ok = data.totals.drCents === data.totals.crCents;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className={`badge ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>{ok ? '✓ In balance' : 'Out of balance!'}</span>
        <button className="btn-ghost" onClick={() => exportObjects('trial-balance.csv', data.rows.map((r: any) => ({ code: r.code, account: r.name, type: r.type, dr: (r.drCents / 100).toFixed(2), cr: (r.crCents / 100).toFixed(2), closingDr: (r.closingDrCents / 100).toFixed(2), closingCr: (r.closingCrCents / 100).toFixed(2) })))}>⬇ CSV</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100"><th className={thc}>Code</th><th className={thc}>Account</th><th className={`${thc} text-right`}>Dr</th><th className={`${thc} text-right`}>Cr</th><th className={`${thc} text-right`}>Closing Dr</th><th className={`${thc} text-right`}>Closing Cr</th></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {data.rows.map((r: any) => (
              <tr key={r.code}>
                <td className={`${tdc} font-mono`}>{r.code}</td>
                <td className={`${tdc} font-medium text-slate-700`}>{r.name}</td>
                <td className={tdrc}>{r.drCents ? formatMoney(r.drCents) : ''}</td>
                <td className={tdrc}>{r.crCents ? formatMoney(r.crCents) : ''}</td>
                <td className={`${tdrc} text-emerald-600`}>{r.closingDrCents ? formatMoney(r.closingDrCents) : ''}</td>
                <td className={`${tdrc} text-red-500`}>{r.closingCrCents ? formatMoney(r.closingCrCents) : ''}</td>
              </tr>
            ))}
            {data.rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">No journal activity in range.</td></tr>}
          </tbody>
          <tfoot><tr className="border-t border-slate-200 font-semibold text-slate-800"><td className="p-2" colSpan={2}>Totals</td><td className={tdrc}>{formatMoney(data.totals.drCents)}</td><td className={tdrc}>{formatMoney(data.totals.crCents)}</td><td className={tdrc}>{formatMoney(data.totals.closingDrCents)}</td><td className={tdrc}>{formatMoney(data.totals.closingCrCents)}</td></tr></tfoot>
        </table>
      </div>
      <p className="text-xs text-slate-400">{data.note}</p>
    </div>
  );
}

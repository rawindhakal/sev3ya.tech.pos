'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney, dollarsToCents } from '@/lib/api';
import type { Customer, CreditLedgerEntry, PaymentMethod } from '@/lib/types';
import Modal from '@/components/Modal';

const SETTLE_METHODS: PaymentMethod[] = ['CASH', 'FONEPAY', 'BANK', 'ESEWA', 'KHALTI', 'CARD'];

const TIER: Record<string, string> = {
  PLATINUM: 'bg-slate-800 text-white',
  GOLD: 'bg-amber-100 text-amber-700',
  SILVER: 'bg-slate-200 text-slate-600',
  MEMBER: 'bg-slate-100 text-slate-400',
};
const SEG: Record<string, string> = {
  'High Spender': 'bg-green-100 text-green-700',
  Loyal: 'bg-brand-50 text-brand-600',
  Regular: 'bg-blue-100 text-blue-700',
  New: 'bg-indigo-100 text-indigo-700',
  'At Risk': 'bg-red-100 text-red-600',
};

interface Stats { total: number; totalPoints: number; lifetimeValueCents: number; segments: Record<string, number>; tiers: Record<string, number> }

export default function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null);

  // Credit ledger modal state
  const [ledger, setLedger] = useState<{ customer: Customer; entries: CreditLedgerEntry[] } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [payNote, setPayNote] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);

  async function openLedger(c: Customer) {
    setPayAmount(''); setPayNote(''); setPayMethod('CASH'); setPayErr(null);
    setLedger(await api.get<{ customer: Customer; entries: CreditLedgerEntry[] }>(`/customers/${c.id}/ledger`));
  }

  async function receivePayment() {
    if (!ledger) return;
    const cents = dollarsToCents(parseFloat(payAmount || '0'));
    if (cents <= 0) return setPayErr('Enter the amount received');
    setPayBusy(true); setPayErr(null);
    try {
      await api.post(`/customers/${ledger.customer.id}/settle-credit`, {
        amountCents: cents, method: payMethod, note: payNote || undefined,
      });
      await openLedger(ledger.customer); // refresh the statement
      load();
    } catch (e) {
      setPayErr((e as Error).message);
    } finally {
      setPayBusy(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        api.get<Customer[]>(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
        api.get<Stats>('/customers/stats'),
      ]);
      setRows(r);
      setStats(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [search]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function openDetail(c: Customer) {
    setDetail(await api.get<Customer>(`/customers/${c.id}`));
  }
  async function gdprDelete(c: Customer) {
    if (!confirm(`GDPR delete ${c.name}? This removes their profile and unlinks orders.`)) return;
    await api.delete(`/customers/${c.id}`);
    setDetail(null);
    load();
  }

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers (CRM)</h1>
          <p className="text-sm text-slate-500">Loyalty, tiers &amp; RFM segments</p>
        </div>
        <input className="input w-64" placeholder="🔍 Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error} — is the API running on port 4000?</div>}

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="card p-4"><div className="text-2xl font-bold text-slate-900">{stats.total}</div><div className="text-xs text-slate-500">Customers</div></div>
          <div className="card p-4"><div className="text-2xl font-bold text-slate-900">{formatMoney(stats.lifetimeValueCents)}</div><div className="text-xs text-slate-500">Lifetime value</div></div>
          <div className="card p-4"><div className="text-2xl font-bold text-slate-900">{stats.totalPoints.toLocaleString()}</div><div className="text-xs text-slate-500">Points outstanding</div></div>
          <div className="card p-4"><div className="flex flex-wrap gap-1">{Object.entries(stats.segments).map(([s, n]) => <span key={s} className={`badge ${SEG[s] ?? 'bg-slate-100'}`}>{s}: {n}</span>)}</div><div className="mt-1 text-xs text-slate-500">Segments</div></div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="p-3 font-semibold">Customer</th><th className="p-3 font-semibold">Tier</th><th className="p-3 font-semibold">Segment</th><th className="p-3 font-semibold">Points</th><th className="p-3 font-semibold">Spend</th><th className="p-3 font-semibold">Credit due</th><th className="p-3 font-semibold">Visits</th><th className="p-3 font-semibold">Last visit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(c)}>
                <td className="p-3"><div className="font-medium text-slate-700">{c.name}</div><div className="text-xs text-slate-400">{c.phone}</div></td>
                <td className="p-3"><span className={`badge ${TIER[c.tier]}`}>{c.tier}</span></td>
                <td className="p-3"><span className={`badge ${SEG[c.segment] ?? 'bg-slate-100 text-slate-500'}`}>{c.segment}</span></td>
                <td className="p-3 font-semibold text-brand-700">{c.loyaltyPoints.toLocaleString()}</td>
                <td className="p-3 text-slate-600">{formatMoney(c.totalSpentCents)}</td>
                <td className="p-3" onClick={(e) => { e.stopPropagation(); openLedger(c); }}>
                  {(c.creditBalanceCents ?? 0) > 0
                    ? <span className="badge bg-red-100 font-semibold text-red-600 hover:bg-red-200" title="Open ledger">{formatMoney(c.creditBalanceCents!)}</span>
                    : <span className="text-xs text-slate-300 underline decoration-dotted hover:text-slate-500" title="Open ledger">ledger</span>}
                </td>
                <td className="p-3 text-slate-500">{c.visitCount}</td>
                <td className="p-3 text-slate-400">{c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">No customers yet — they&apos;re created automatically from takeaway/delivery orders.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={!!detail} title={detail?.name ?? ''} onClose={() => setDetail(null)}>
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${TIER[detail.tier]}`}>{detail.tier}</span>
              <span className={`badge ${SEG[detail.segment] ?? 'bg-slate-100'}`}>{detail.segment}</span>
              <span className="text-sm text-slate-500">{detail.phone}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-slate-50 p-3"><div className="font-bold text-brand-700">{detail.loyaltyPoints.toLocaleString()}</div><div className="text-xs text-slate-500">Points</div></div>
              <div className="rounded-lg bg-slate-50 p-3"><div className="font-bold text-slate-800">{formatMoney(detail.totalSpentCents)}</div><div className="text-xs text-slate-500">Lifetime spend</div></div>
              <div className="rounded-lg bg-slate-50 p-3"><div className="font-bold text-slate-800">{detail.visitCount}</div><div className="text-xs text-slate-500">Visits</div></div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Recent orders</h3>
              <div className="max-h-48 space-y-1 overflow-y-auto text-sm">
                {(detail.orders ?? []).map((o) => (
                  <div key={o.number} className="flex justify-between border-b border-slate-50 py-1">
                    <span className="text-slate-600">#{o.number} · {o.type?.replace('_', ' ')}</span>
                    <span className="text-slate-500">{formatMoney(o.totalCents)} · {o.paidAt ? new Date(o.paidAt).toLocaleDateString() : ''}</span>
                  </div>
                ))}
                {(detail.orders ?? []).length === 0 && <p className="text-slate-400">No paid orders.</p>}
              </div>
            </div>
            {(detail.creditBalanceCents ?? 0) > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/40 dark:bg-red-950/20">
                <span className="font-medium text-red-700 dark:text-red-400">Credit due: {formatMoney(detail.creditBalanceCents!)}</span>
                <button className="btn-ghost text-xs" onClick={() => { setDetail(null); openLedger(detail); }}>Open ledger →</button>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-100 pt-3">
              <button className="btn-ghost text-xs" onClick={() => { setDetail(null); openLedger(detail); }}>📒 Credit ledger</button>
              <button className="btn-danger text-xs" onClick={() => gdprDelete(detail)}>🗑 GDPR delete</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Credit ledger & receive payment ── */}
      <Modal open={!!ledger} title={ledger ? `Credit ledger · ${ledger.customer.name}` : ''} onClose={() => setLedger(null)}>
        {ledger && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-700/40">
              <span className="text-sm text-slate-500">Outstanding balance</span>
              <span className={`text-lg font-bold ${(ledger.customer.creditBalanceCents ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatMoney(ledger.customer.creditBalanceCents ?? 0)}
              </span>
            </div>

            {(ledger.customer.creditBalanceCents ?? 0) > 0 && (
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-600">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Receive payment</h3>
                {payErr && <p className="mb-2 text-xs text-red-500">{payErr}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <input className="input" inputMode="decimal" placeholder="Amount (Rs)" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                  <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                    {SETTLE_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <input className="input mt-2" placeholder="Note (optional)" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                <button className="btn-primary mt-2 w-full" disabled={payBusy} onClick={receivePayment}>
                  {payBusy ? 'Recording…' : `Record ${payMethod === 'CASH' ? 'cash ' : ''}payment`}
                </button>
                {payMethod === 'CASH' && <p className="mt-1.5 text-[11px] text-slate-400">Cash goes into the open drawer as a pay-in and shows on the day-end report.</p>}
              </div>
            )}

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Statement</h3>
              <div className="max-h-64 overflow-y-auto text-sm">
                {ledger.entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between border-b border-slate-50 py-1.5 dark:border-slate-700">
                    <div>
                      <span className={`badge ${e.type === 'CHARGE' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {e.type === 'CHARGE' ? 'Credit sale' : `Paid ${e.method ?? ''}`}
                      </span>
                      <span className="ml-2 text-xs text-slate-400">{new Date(e.createdAt).toLocaleString()}</span>
                      {e.note && <div className="text-xs italic text-slate-400">{e.note}</div>}
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${e.type === 'CHARGE' ? 'text-red-600' : 'text-emerald-600'}`}>
                        {e.type === 'CHARGE' ? '+' : '−'}{formatMoney(e.amountCents)}
                      </div>
                      <div className="text-[11px] text-slate-400">bal {formatMoney(e.balanceAfterCents)}</div>
                    </div>
                  </div>
                ))}
                {ledger.entries.length === 0 && <p className="py-4 text-center text-slate-400">No credit activity yet.</p>}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

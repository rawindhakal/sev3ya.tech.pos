'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney, dollarsToCents } from '@/lib/api';
import Modal from '@/components/Modal';

interface PnL {
  grossSalesCents: number; vatCollectedCents: number; serviceChargeCents: number; discountsCents: number;
  netSalesCents: number; cogsCents: number; grossProfitCents: number; grossMarginPct: number;
  expensesByCategory: { category: string; amountCents: number }[]; totalExpensesCents: number;
  netProfitCents: number; orders: number; breakEvenRevenueCents: number;
}
interface Expense { id: string; category: string; amountCents: number; description?: string | null; incurredAt: string }
interface AP { rows: { number: number; supplier: string; amountCents: number; ageDays: number; bucket: string }[]; buckets: Record<string, number>; totalCents: number }

const CATS = ['RENT', 'UTILITIES', 'SALARY', 'MARKETING', 'MAINTENANCE', 'SUPPLIES', 'OTHER'];
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function FinancePage() {
  const today = iso(new Date());
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState(today);
  const [pnl, setPnl] = useState<PnL | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [ap, setAp] = useState<AP | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ category: 'RENT', amountRs: '', description: '' });

  const load = useCallback(async () => {
    try {
      const [p, e, a] = await Promise.all([
        api.get<PnL>(`/finance/pnl?from=${from}&to=${to}`),
        api.get<Expense[]>(`/finance/expenses?from=${from}&to=${to}`),
        api.get<AP>('/finance/ap-aging'),
      ]);
      setPnl(p); setExpenses(e); setAp(a); setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  async function addExpense(ev: React.FormEvent) {
    ev.preventDefault();
    try {
      await api.post('/finance/expenses', {
        category: form.category,
        amountCents: dollarsToCents(parseFloat(form.amountRs || '0')),
        description: form.description.trim() || undefined,
      });
      setForm({ category: 'RENT', amountRs: '', description: '' });
      setModal(false);
      load();
    } catch (e) { alert((e as Error).message); }
  }
  async function delExpense(id: string) {
    if (!confirm('Delete this expense?')) return;
    await api.delete(`/finance/expenses/${id}`);
    load();
  }
  function preset(days: number) { setFrom(iso(new Date(Date.now() - (days - 1) * 864e5))); setTo(today); }

  if (error) return <div className="p-8"><div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div></div>;
  if (!pnl) return <div className="p-8 text-sm text-slate-400">Loading finance…</div>;

  const Row = ({ label, value, bold, sign, className = '' }: { label: string; value: number; bold?: boolean; sign?: '+' | '−'; className?: string }) => (
    <div className={`flex justify-between py-1.5 ${bold ? 'font-bold' : ''} ${className}`}>
      <span className={bold ? 'text-slate-900' : 'text-slate-600'}>{sign && <span className="mr-1 text-slate-400">{sign}</span>}{label}</span>
      <span className={bold ? 'text-slate-900' : 'text-slate-700'}>{formatMoney(value)}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Finance</h1>
          <p className="text-sm text-slate-500">P&amp;L, expenses, tax &amp; payables</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {[['7d', 7], ['30d', 30]].map(([l, d]) => <button key={l} onClick={() => preset(d as number)} className="badge bg-white px-3 py-1.5 text-slate-600 border border-slate-200">{l}</button>)}
          <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-400">→</span>
          <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </header>

      {/* headline */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card p-4"><div className="text-xl font-bold text-slate-900">{formatMoney(pnl.grossSalesCents)}</div><div className="text-xs text-slate-500">Gross sales</div></div>
        <div className="card p-4"><div className="text-xl font-bold text-slate-900">{formatMoney(pnl.grossProfitCents)}</div><div className="text-xs text-slate-500">Gross profit ({pnl.grossMarginPct}%)</div></div>
        <div className={`card p-4 ${pnl.netProfitCents >= 0 ? '' : 'border-red-300 bg-red-50'}`}><div className={`text-xl font-bold ${pnl.netProfitCents >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatMoney(pnl.netProfitCents)}</div><div className="text-xs text-slate-500">Net profit</div></div>
        <div className="card p-4"><div className="text-xl font-bold text-slate-900">{formatMoney(pnl.breakEvenRevenueCents)}</div><div className="text-xs text-slate-500">Break-even revenue</div></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* P&L statement */}
        <div className="card p-6">
          <h2 className="mb-3 font-semibold text-slate-800">Profit &amp; Loss</h2>
          <div className="divide-y divide-slate-100 text-sm">
            <Row label="Gross sales" value={pnl.grossSalesCents} />
            <Row label={`VAT collected (liability)`} value={pnl.vatCollectedCents} sign="−" />
            <Row label="Net sales" value={pnl.netSalesCents} bold />
            <Row label="Cost of goods sold" value={pnl.cogsCents} sign="−" />
            <Row label="Gross profit" value={pnl.grossProfitCents} bold className="text-green-700" />
            {pnl.expensesByCategory.map((e) => <Row key={e.category} label={e.category} value={e.amountCents} sign="−" />)}
            <Row label="Total expenses" value={pnl.totalExpensesCents} sign="−" />
            <Row label="NET PROFIT" value={pnl.netProfitCents} bold className={pnl.netProfitCents >= 0 ? 'text-green-700' : 'text-red-600'} />
          </div>
          <p className="mt-3 text-xs text-slate-400">Break-even needs <strong>{formatMoney(pnl.breakEvenRevenueCents)}</strong> in sales to cover fixed costs at the current {pnl.grossMarginPct}% margin.</p>
        </div>

        <div className="space-y-6">
          {/* Tax summary */}
          <div className="card p-6">
            <h2 className="mb-3 font-semibold text-slate-800">Tax summary</h2>
            <Row label="VAT collected (payable)" value={pnl.vatCollectedCents} />
            <Row label="Service charge collected" value={pnl.serviceChargeCents} />
            <Row label="Discounts given" value={pnl.discountsCents} />
          </div>

          {/* AP aging */}
          {ap && (
            <div className="card p-6">
              <h2 className="mb-3 font-semibold text-slate-800">Accounts payable aging</h2>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                {(['0-30', '31-60', '60+'] as const).map((b) => (
                  <div key={b} className="rounded-lg bg-slate-50 p-2"><div className="text-sm font-bold text-slate-800">{formatMoney(ap.buckets[b] ?? 0)}</div><div className="text-[10px] text-slate-500">{b} days</div></div>
                ))}
              </div>
              {ap.rows.length === 0 ? <p className="text-sm text-slate-400">No outstanding supplier bills.</p> :
                ap.rows.map((r) => <div key={r.number} className="flex justify-between py-1 text-sm"><span className="text-slate-600">PO #{r.number} · {r.supplier}</span><span className="text-slate-500">{formatMoney(r.amountCents)} · {r.ageDays}d</span></div>)}
            </div>
          )}
        </div>
      </div>

      {/* Expense ledger */}
      <div className="mt-6 card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Expense ledger</h2>
          <button className="btn-primary text-xs" onClick={() => setModal(true)}>+ Expense</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400"><th className="p-2 font-semibold">Date</th><th className="p-2 font-semibold">Category</th><th className="p-2 font-semibold">Description</th><th className="p-2 text-right font-semibold">Amount</th><th className="p-2"></th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="p-2 text-slate-500">{new Date(e.incurredAt).toLocaleDateString()}</td>
                  <td className="p-2"><span className="badge bg-slate-100 text-slate-600">{e.category}</span></td>
                  <td className="p-2 text-slate-600">{e.description ?? '—'}</td>
                  <td className="p-2 text-right font-semibold text-slate-700">{formatMoney(e.amountCents)}</td>
                  <td className="p-2 text-right"><button className="text-xs text-red-500 hover:underline" onClick={() => delExpense(e.id)}>✕</button></td>
                </tr>
              ))}
              {expenses.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">No expenses in range.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} title="Add expense" onClose={() => setModal(false)}>
        <form onSubmit={addExpense} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            </div>
            <div>
              <label className="label">Amount (Rs)</label>
              <input className="input" type="number" step="0.01" min="0" value={form.amountRs} onChange={(e) => setForm({ ...form, amountRs: e.target.value })} required autoFocus />
            </div>
          </div>
          <div><label className="label">Description</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. October rent" /></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setModal(false)}>Cancel</button><button type="submit" className="btn-primary">Save</button></div>
        </form>
      </Modal>
    </div>
  );
}

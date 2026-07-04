'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney } from '@/lib/api';
import { PAYMENT_METHOD_LABEL } from '@/lib/constants';

interface Report {
  range: { from: string; to: string };
  summary: { orders: number; grossCents: number; subtotalCents: number; taxCents: number; serviceChargeCents: number; discountCents: number; guests: number; avgTicketCents: number };
  byCategory: { name: string; revenueCents: number; qty: number }[];
  byHour: { hour: number; revenueCents: number; orders: number }[];
  byPayment: { method: string; amountCents: number; count: number }[];
  byType: { type: string; totalCents: number; count: number }[];
  menuPerformance: { name: string; qty: number; revenueCents: number; costCents: number; profitCents: number; marginPct: number }[];
  tableTurnoverMinutes: number;
  wasteCostCents: number;
  stockVarianceCents: number;
  voids: { number: number; reason: string; at: string }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// BCG-style classification (#188): popular vs profitable against the median.
function classify(items: Report['menuPerformance']) {
  if (!items.length) return new Map<string, string>();
  const qtys = [...items].map((i) => i.qty).sort((a, b) => a - b);
  const margins = [...items].map((i) => i.marginPct).sort((a, b) => a - b);
  const medQty = qtys[Math.floor(qtys.length / 2)];
  const medMargin = margins[Math.floor(margins.length / 2)];
  const m = new Map<string, string>();
  for (const i of items) {
    const pop = i.qty >= medQty;
    const prof = i.marginPct >= medMargin;
    m.set(i.name, pop && prof ? 'Star' : pop && !prof ? 'Plowhorse' : !pop && prof ? 'Puzzle' : 'Dog');
  }
  return m;
}
const CLASS_STYLE: Record<string, string> = {
  Star: 'bg-green-100 text-green-700',
  Plowhorse: 'bg-blue-100 text-blue-700',
  Puzzle: 'bg-amber-100 text-amber-700',
  Dog: 'bg-slate-200 text-slate-500',
};

export default function ReportsPage() {
  const today = iso(new Date());
  const [from, setFrom] = useState(iso(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(today);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Report>(`/reports?from=${from}&to=${to}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [from, to]);
  useEffect(() => {
    load();
  }, [load]);

  function preset(days: number) {
    setFrom(iso(new Date(Date.now() - (days - 1) * 864e5)));
    setTo(today);
  }

  if (error) return <div className="p-8"><div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div></div>;
  if (!data) return <div className="p-8 text-sm text-slate-400">Loading reports…</div>;

  const s = data.summary;
  const maxHour = Math.max(...data.byHour.map((h) => h.revenueCents), 1);
  const payTotal = data.byPayment.reduce((a, p) => a + p.amountCents, 0);
  const typeTotal = data.byType.reduce((a, t) => a + t.totalCents, 0);
  const bcg = classify(data.menuPerformance);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Sales, menu &amp; operations analytics</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {[['Today', 1], ['7d', 7], ['30d', 30]].map(([l, d]) => (
            <button key={l} onClick={() => preset(d as number)} className="badge bg-white px-3 py-1.5 text-slate-600 border border-slate-200">{l}</button>
          ))}
          <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-400">→</span>
          <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          <button onClick={() => window.print()} className="btn-ghost">🖨 Print</button>
        </div>
      </header>

      {/* Z-report KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { l: 'Gross sales', v: formatMoney(s.grossCents) },
          { l: 'Orders', v: s.orders },
          { l: 'Avg ticket', v: formatMoney(s.avgTicketCents) },
          { l: 'Guests', v: s.guests },
          { l: 'Net (pre-tax)', v: formatMoney(s.subtotalCents - s.discountCents) },
          { l: 'VAT collected', v: formatMoney(s.taxCents) },
          { l: 'Discounts', v: formatMoney(s.discountCents) },
          { l: 'Avg table turn', v: `${data.tableTurnoverMinutes} min` },
        ].map((k) => (
          <div key={k.l} className="card p-4"><div className="text-xl font-bold text-slate-900">{k.v}</div><div className="text-xs text-slate-500">{k.l}</div></div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Hourly distribution */}
        <div className="card p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-800">Hourly sales distribution</h2>
          {data.byHour.length === 0 ? <p className="text-sm text-slate-400">No sales in range.</p> : (
            <div className="flex h-40 items-end gap-1">
              {data.byHour.map((h) => (
                <div key={h.hour} className="flex flex-1 flex-col items-center gap-1" title={`${h.hour}:00 — ${formatMoney(h.revenueCents)} (${h.orders})`}>
                  <div className="w-full rounded-t bg-brand-500" style={{ height: `${(h.revenueCents / maxHour) * 100}%` }} />
                  <span className="text-[9px] text-slate-400">{h.hour}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment channels */}
        <div className="card p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Payment channels</h2>
          <div className="space-y-2">
            {data.byPayment.map((p) => (
              <div key={p.method}>
                <div className="mb-0.5 flex justify-between text-sm"><span className="text-slate-600">{PAYMENT_METHOD_LABEL[p.method as never] ?? p.method}</span><span className="font-semibold">{formatMoney(p.amountCents)}</span></div>
                <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${payTotal ? (p.amountCents / payTotal) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Order type split */}
        <div className="card p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Fulfillment split</h2>
          {data.byType.map((t) => (
            <div key={t.type} className="mb-2">
              <div className="mb-0.5 flex justify-between text-sm"><span className="text-slate-600">{t.type.replace('_', ' ')}</span><span className="font-semibold">{formatMoney(t.totalCents)}</span></div>
              <div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${typeTotal ? (t.totalCents / typeTotal) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>

        {/* Category revenue */}
        <div className="card p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Revenue by category</h2>
          {data.byCategory.map((c) => (
            <div key={c.name} className="flex justify-between py-1 text-sm"><span className="text-slate-600">{c.name} <span className="text-slate-300">({c.qty})</span></span><span className="font-semibold text-slate-700">{formatMoney(c.revenueCents)}</span></div>
          ))}
        </div>

        {/* Ops cost cards */}
        <div className="space-y-4">
          <div className="card p-5"><div className="text-xl font-bold text-red-600">{formatMoney(data.wasteCostCents)}</div><div className="text-xs text-slate-500">Wastage cost</div></div>
          <div className="card p-5"><div className={`text-xl font-bold ${data.stockVarianceCents < 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatMoney(data.stockVarianceCents)}</div><div className="text-xs text-slate-500">Stock-take variance value</div></div>
        </div>
      </div>

      {/* Menu engineering */}
      <div className="mt-6 card p-6">
        <h2 className="mb-1 font-semibold text-slate-800">Menu engineering (BCG)</h2>
        <p className="mb-4 text-xs text-slate-400">Star = popular + profitable · Plowhorse = popular, low margin · Puzzle = high margin, low volume · Dog = neither</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="p-2 font-semibold">Item</th><th className="p-2 font-semibold">Sold</th><th className="p-2 font-semibold">Revenue</th><th className="p-2 font-semibold">Cost</th><th className="p-2 font-semibold">Profit</th><th className="p-2 font-semibold">Margin</th><th className="p-2 font-semibold">Class</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.menuPerformance.slice(0, 20).map((m) => (
                <tr key={m.name}>
                  <td className="p-2 font-medium text-slate-700">{m.name}</td>
                  <td className="p-2 text-slate-500">{m.qty}</td>
                  <td className="p-2 text-slate-600">{formatMoney(m.revenueCents)}</td>
                  <td className="p-2 text-slate-400">{m.costCents ? formatMoney(m.costCents) : '—'}</td>
                  <td className="p-2 font-semibold text-slate-700">{formatMoney(m.profitCents)}</td>
                  <td className="p-2 text-slate-500">{m.marginPct}%</td>
                  <td className="p-2"><span className={`badge ${CLASS_STYLE[bcg.get(m.name) ?? 'Dog']}`}>{bcg.get(m.name)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Void audit */}
      {data.voids.length > 0 && (
        <div className="mt-6 card p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Void &amp; cancellation audit</h2>
          <div className="space-y-1 text-sm">
            {data.voids.map((v, i) => (
              <div key={i} className="flex justify-between border-b border-slate-50 py-1"><span className="text-slate-600">#{v.number} — {v.reason}</span><span className="text-slate-400">{new Date(v.at).toLocaleString()}</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { api, formatMoney } from '@/lib/api';
import type { Outlet, SalesForecast } from '@/lib/types';
import { formatBsLong } from '@/lib/bs-date';
import LineChart from '@/components/LineChart';
import FeatureGate from '@/components/FeatureGate';

const TREND_BADGE: Record<string, string> = {
  up: 'bg-emerald-100 text-emerald-700',
  down: 'bg-red-100 text-red-600',
  steady: 'bg-slate-100 text-slate-500',
};
const TREND_ARROW: Record<string, string> = { up: '↑', down: '↓', steady: '→' };

function SalesForecastPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState('');
  const [forecast, setForecast] = useState<SalesForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api.get<Outlet[]>('/outlets').then(setOutlets).catch(() => {}); }, []);

  useEffect(() => {
    setLoading(true);
    api.get<SalesForecast>(`/analytics/forecast${outletId ? `?outletId=${outletId}` : ''}`)
      .then((f) => { setForecast(f); setErr(null); })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [outletId]);

  const chartData = forecast
    ? [
        ...forecast.history.map((h) => ({ label: h.date.slice(5), value: h.cents / 100 })),
        { label: `${forecast.date.slice(5)} (est.)`, value: forecast.predictedRevenueCents / 100 },
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI Sales Analysis</h1>
          <p className="text-sm text-slate-500">Tomorrow's predicted sales, from your own order history</p>
        </div>
        {outlets.length > 1 && (
          <select className="input w-auto" value={outletId} onChange={(e) => setOutletId(e.target.value)} aria-label="Outlet">
            <option value="">All outlets</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </header>

      {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {loading && !forecast && <p className="py-12 text-center text-sm text-slate-400">Crunching the numbers…</p>}

      {forecast && (
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="bg-gradient-to-br from-brand-600 to-brand-700 p-6 text-white">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white/80">Tomorrow · {forecast.weekday}, {forecast.date}</p>
                  <p className="text-xs text-white/60">{formatBsLong(new Date(`${forecast.date}T12:00:00`))} BS</p>
                  <p className="mt-2 text-4xl font-bold tabular-nums">{formatMoney(forecast.predictedRevenueCents)}</p>
                  <p className="mt-1 text-sm text-white/80">predicted revenue · range {formatMoney(forecast.confidenceLowCents)} – {formatMoney(forecast.confidenceHighCents)}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold tabular-nums">{forecast.predictedOrders}</p>
                  <p className="text-sm text-white/80">predicted orders</p>
                  <span className={`mt-2 inline-block badge ${forecast.trendPct >= 0 ? 'bg-emerald-400/20 text-emerald-50' : 'bg-red-400/20 text-red-50'}`}>
                    {forecast.trendPct === 0 ? 'Flat vs prior 2 weeks' : `${forecast.trendPct > 0 ? '+' : ''}${forecast.trendPct}% vs prior 2 weeks`}
                  </span>
                </div>
              </div>
            </div>
            <p className="border-t border-slate-100 p-4 text-sm text-slate-500">{forecast.basis}</p>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-800">Last 30 days vs tomorrow's estimate</h2>
            <LineChart data={chartData} formatValue={(v) => `Rs ${v.toLocaleString()}`} />
          </div>

          <div className="card overflow-x-auto">
            <div className="border-b border-slate-100 p-4">
              <h2 className="font-semibold text-slate-800">Predicted top items for tomorrow</h2>
              <p className="text-xs text-slate-400">Same recency-weighted method, applied per item</p>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="p-3">Item</th><th className="p-3 text-right">Predicted qty</th><th className="p-3 text-right">Recent avg/day</th><th className="p-3">Trend</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {forecast.items.map((it) => (
                  <tr key={it.name}>
                    <td className="p-3 font-medium text-slate-700">{it.name}</td>
                    <td className="p-3 text-right tabular-nums">{it.predictedQty}</td>
                    <td className="p-3 text-right tabular-nums text-slate-500">{it.recentAvgQty}</td>
                    <td className="p-3"><span className={`badge ${TREND_BADGE[it.trend]}`}>{TREND_ARROW[it.trend]} {it.trend}</span></td>
                  </tr>
                ))}
                {forecast.items.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">Not enough item-level history yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


export default function SalesForecastPageGated() {
  return (
    <FeatureGate feature="finance">
      <SalesForecastPage />
    </FeatureGate>
  );
}

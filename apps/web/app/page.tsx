'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, formatMoney } from '@/lib/api';
import type { DashboardData } from '@/lib/types';
import LineChart from '@/components/LineChart';
import { PAYMENT_METHOD_COLOR, PAYMENT_METHOD_LABEL } from '@/lib/constants';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardData>('/analytics/dashboard')
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error)
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error} — is the API running on port 4000?
        </div>
      </div>
    );

  if (!data)
    return <div className="p-8 text-sm text-slate-400">Loading dashboard…</div>;

  const stats = [
    { label: "Today's Orders", value: data.today.orders, icon: '🧾' },
    { label: "Today's Earnings", value: formatMoney(data.today.earningsCents), icon: '💰' },
    { label: "Today's Customers", value: data.today.customers, icon: '👥' },
    { label: 'Avg Daily Earning', value: formatMoney(data.averages.dailyEarningCents), icon: '📅' },
  ];

  const secondary = [
    { label: 'Avg Guest Time', value: `${data.averages.guestTimeMinutes} min`, icon: '⏱️' },
    { label: 'Turnaround Rate', value: `${data.averages.turnaroundRate}×`, icon: '🔄', hint: 'orders / table today' },
    { label: 'Paid Orders Today', value: data.today.paidOrders, icon: '✅' },
  ];

  const paymentsTotal = data.paymentsByMethod.reduce((s, p) => s + p.amountCents, 0);

  const chartData = data.salesSeries.map((s) => ({
    label: new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: s.cents,
  }));

  const maxItemQty = Math.max(...data.topItems.map((i) => i.qty), 1);
  const maxTableRev = Math.max(...data.topTables.map((t) => t.revenueCents), 1);
  const maxWaiterRev = Math.max(...data.waiters.map((w) => w.revenueCents), 1);

  return (
    <div className="mx-auto max-w-7xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Live overview of today &amp; this month</p>
        </div>
        <Link href="/pos" className="btn-primary">
          + New Order
        </Link>
      </header>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <div className="mb-2 text-2xl">{s.icon}</div>
            <div className="text-2xl font-bold text-slate-900">{s.value}</div>
            <div className="text-sm text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Secondary KPIs */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        {secondary.map((s) => (
          <div key={s.label} className="card flex items-center gap-3 p-4">
            <span className="text-xl">{s.icon}</span>
            <div>
              <div className="text-lg font-bold text-slate-900">{s.value}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Sales line chart */}
        <div className="card p-6 lg:col-span-2">
          <h2 className="mb-1 font-semibold text-slate-800">Sales this month</h2>
          <p className="mb-4 text-xs text-slate-400">Daily paid revenue</p>
          <LineChart data={chartData} formatValue={(v) => formatMoney(v)} />
        </div>

        {/* Payments by method */}
        <div className="card p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Received today by method</h2>
          {data.paymentsByMethod.length === 0 ? (
            <p className="text-sm text-slate-400">No payments yet today.</p>
          ) : (
            <div className="space-y-3">
              {data.paymentsByMethod.map((p) => (
                <div key={p.method}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-slate-600">{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</span>
                    <span className="font-semibold text-slate-900">{formatMoney(p.amountCents)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${PAYMENT_METHOD_COLOR[p.method] ?? 'bg-slate-400'}`}
                      style={{ width: `${paymentsTotal ? (p.amountCents / paymentsTotal) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-500">Total received today: </span>
                <span className="font-bold text-slate-900">{formatMoney(paymentsTotal)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Top selling items */}
        <div className="card p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Top selling items</h2>
          <div className="space-y-2.5">
            {data.topItems.map((it, i) => (
              <div key={it.name} className="flex items-center gap-3">
                <span className="w-4 text-xs font-bold text-slate-400">{i + 1}</span>
                <div className="flex-1">
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-slate-700">{it.name}</span>
                    <span className="text-slate-500">{it.qty} sold</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(it.qty / maxItemQty) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top tables */}
        <div className="card p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Top tables (revenue)</h2>
          <div className="space-y-2.5">
            {data.topTables.map((t) => (
              <div key={t.name} className="flex items-center gap-3">
                <span className="badge bg-brand-50 text-brand-700">{t.name}</span>
                <div className="flex-1">
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-slate-500">{t.orders} orders</span>
                    <span className="font-semibold text-slate-800">{formatMoney(t.revenueCents)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(t.revenueCents / maxTableRev) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Waiter overview */}
        <div className="card p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Waiter overview</h2>
          <div className="space-y-2.5">
            {data.waiters.map((w) => (
              <div key={w.name} className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  {w.name[0]}
                </span>
                <div className="flex-1">
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-slate-700">{w.name}</span>
                    <span className="font-semibold text-slate-800">{formatMoney(w.revenueCents)}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {w.orders} orders · {w.guests} guests
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent orders today */}
      <div className="mt-6 card p-6">
        <h2 className="mb-4 font-semibold text-slate-800">Today&apos;s orders</h2>
        {data.recentOrders.length === 0 ? (
          <p className="text-sm text-slate-400">No orders yet today.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-4 font-semibold">Order #</th>
                  <th className="pb-2 pr-4 font-semibold">Type</th>
                  <th className="pb-2 pr-4 font-semibold">Table</th>
                  <th className="pb-2 pr-4 font-semibold">Waiter</th>
                  <th className="pb-2 pr-4 font-semibold">Guests</th>
                  <th className="pb-2 pr-4 font-semibold">Status</th>
                  <th className="pb-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 pr-4 font-medium text-slate-700">#{o.number}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{o.type.replace('_', ' ')}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{o.table ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{o.waiter ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{o.guestCount}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`badge ${o.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {o.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-semibold text-slate-800">{formatMoney(o.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, formatMoney } from '@/lib/api';
import type { DashboardData, Outlet } from '@/lib/types';
import Spinner from '@/components/Spinner';
import {
  ReceiptIcon, BanknoteIcon, UsersIcon, CalendarIcon, ClockIcon, TurnaroundIcon,
  CheckCircleIcon, TableIcon, PlusIcon, InboxIcon,
} from '@/components/icons';
import HourlyLineChart from '@/components/charts/HourlyLineChart';
import TopItemsBar from '@/components/charts/TopItemsBar';
import PaymentDonut from '@/components/charts/PaymentDonut';
import OrderSourcePie from '@/components/charts/OrderSourcePie';
import ServerBar from '@/components/charts/ServerBar';
import LaborVsSalesChart from '@/components/charts/LaborVsSalesChart';
import MenuScatter from '@/components/charts/MenuScatter';
import DiscountsVoidsBar from '@/components/charts/DiscountsVoidsBar';
import AvgTicketLine from '@/components/charts/AvgTicketLine';
import CategoryTreemap from '@/components/charts/CategoryTreemap';
import DowHourHeatmap from '@/components/charts/DowHourHeatmap';
import TurnaroundGauge from '@/components/charts/TurnaroundGauge';
import NewReturningStackedBar from '@/components/charts/NewReturningStackedBar';
import PaymentMethodsArea from '@/components/charts/PaymentMethodsArea';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

type PresetKey = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
];

function presetRange(key: PresetKey): { from: string; to: string } {
  const t = today();
  if (key === 'yesterday') { const d = new Date(t); d.setDate(d.getDate() - 1); return { from: iso(d), to: iso(d) }; }
  if (key === 'week') { const d = new Date(t); d.setDate(d.getDate() - d.getDay()); return { from: iso(d), to: iso(t) }; }
  if (key === 'month') { const d = new Date(t.getFullYear(), t.getMonth(), 1); return { from: iso(d), to: iso(t) }; }
  return { from: iso(t), to: iso(t) };
}

// Color-coded per KPI family (money=emerald, volume=brand pink, people=indigo,
// time=amber) instead of a flat white-on-white number — makes the strip
// scannable at a glance instead of reading like a spreadsheet.
const TONES = {
  brand: { icon: 'text-brand-600 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400' },
  emerald: { icon: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400' },
  indigo: { icon: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 dark:text-indigo-400' },
  amber: { icon: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400' },
} as const;

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<PresetKey>('today');
  const [range, setRange] = useState(() => presetRange('today'));
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState('');

  function choosePreset(key: PresetKey) {
    setPreset(key);
    if (key !== 'custom') setRange(presetRange(key));
  }

  useEffect(() => { api.get<Outlet[]>('/outlets').then(setOutlets).catch(() => {}); }, []);

  function load() {
    setError(null);
    api
      .get<DashboardData>(`/analytics/dashboard?from=${range.from}&to=${range.to}${outletId ? `&outletId=${outletId}` : ''}`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }
  useEffect(load, [range, outletId]);

  // Possessive form for stat labels ("Today's Orders") and a plain form for
  // section subtitles ("Today", "Jul 1 → Jul 18").
  const periodName = preset === 'today' ? 'Today' : preset === 'yesterday' ? 'Yesterday'
    : preset === 'week' ? 'This week' : preset === 'month' ? 'This month'
    : range.from === range.to ? range.from : `${range.from} → ${range.to}`;
  const periodPossessive = ['today', 'yesterday', 'week', 'month'].includes(preset) ? `${periodName}'s` : periodName;

  if (error)
    return (
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/40 dark:bg-red-950/30">
          <InboxIcon className="h-8 w-8 text-red-400" />
          <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
          <button onClick={load} className="btn-primary mt-1">Retry</button>
        </div>
      </div>
    );

  if (!data)
    return (
      <div className="flex h-[60vh] items-center justify-center gap-2 text-sm text-slate-400">
        <Spinner size={16} /> Loading dashboard…
      </div>
    );

  const stats: { label: string; value: string | number; icon: typeof ReceiptIcon; tone: keyof typeof TONES }[] = [
    { label: `${periodPossessive} Orders`, value: data.today.orders, icon: ReceiptIcon, tone: 'brand' },
    { label: `${periodPossessive} Earnings`, value: formatMoney(data.today.earningsCents), icon: BanknoteIcon, tone: 'emerald' },
    { label: `${periodPossessive} Customers`, value: data.today.customers, icon: UsersIcon, tone: 'indigo' },
    { label: 'Avg Daily Earning (30d)', value: formatMoney(data.averages.dailyEarningCents), icon: CalendarIcon, tone: 'amber' },
  ];

  const secondary = [
    { label: 'Avg Guest Time', value: `${data.averages.guestTimeMinutes} min`, icon: ClockIcon },
    { label: 'Turnaround Rate', value: `${data.averages.turnaroundRate}×`, icon: TurnaroundIcon, hint: `orders / table · ${periodName.toLowerCase()}` },
    { label: `Paid Orders · ${periodName}`, value: data.today.paidOrders, icon: CheckCircleIcon },
  ];

  const maxTableRev = Math.max(...data.topTables.map((t) => t.revenueCents), 1);

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Overview for {periodName.toLowerCase()}</p>
        </div>
        <Link href="/pos" className="btn-primary min-h-[44px]">
          <PlusIcon className="h-4 w-4" /> New Order
        </Link>
      </header>

      {/* Quick date filter */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => choosePreset(p.key)}
            className={`min-h-[40px] rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              preset === p.key ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800'
            }`}
          >
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <>
            <input type="date" className="input w-auto" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} aria-label="From date" />
            <span className="text-slate-400">→</span>
            <input type="date" className="input w-auto" value={range.to} min={range.from} max={iso(today())} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} aria-label="To date" />
          </>
        )}
        {outlets.length > 1 && (
          <select className="input w-auto" value={outletId} onChange={(e) => setOutletId(e.target.value)} aria-label="Outlet">
            <option value="">All outlets</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="card p-4 sm:p-5">
              <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${TONES[s.tone].icon}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-2xl font-bold tabular-nums text-slate-900">{s.value}</div>
              <div className="text-sm text-slate-500">{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Secondary KPIs */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-3 sm:gap-4">
        {secondary.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="card flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-lg font-bold tabular-nums text-slate-900">{s.value}</div>
                <div className="truncate text-xs text-slate-500">{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-3">
        <HourlyLineChart data={data.salesByHour} />
        <PaymentDonut data={data.paymentsByMethod} />

        <TopItemsBar data={data.topItems} />
        <OrderSourcePie data={data.ordersByType} />
        <ServerBar data={data.waiters} />

        <LaborVsSalesChart data={data.laborVsSales} />
        <TurnaroundGauge minutes={data.averages.guestTimeMinutes} />

        <MenuScatter data={data.menuPerformance} />
        <DiscountsVoidsBar data={data.discountsAndVoidsByDay} />
        <AvgTicketLine data={data.avgTicketByDay} targetMinutes={data.avgTicketTargetMinutes} />

        <CategoryTreemap data={data.salesByCategory} />
        <DowHourHeatmap data={data.dowHourHeatmap} />

        <NewReturningStackedBar data={data.newVsReturningByDay} coverage={data.customerLinkCoverage} />
        <PaymentMethodsArea data={data.paymentMethodsByDay} />

        {/* Top tables — not one of the standard chart set above, kept as a
            simple ranked list since it's useful and was already here. */}
        <div className="card p-4 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800"><TableIcon className="h-4 w-4 text-slate-400" /> Top tables (revenue)</h2>
          {data.topTables.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No dine-in tables yet.</p>
          ) : (
            <div className="space-y-2.5">
              {data.topTables.map((t) => (
                <div key={t.name} className="flex items-center gap-3">
                  <span className="badge shrink-0 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">{t.name}</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="text-slate-500">{t.orders} orders</span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-800">{formatMoney(t.revenueCents)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                      <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-300" style={{ width: `${(t.revenueCents / maxTableRev) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent orders in the selected period */}
      <div className="mt-4 card p-4 sm:mt-6 sm:p-6">
        <h2 className="mb-4 font-semibold text-slate-800">Recent orders — {periodName.toLowerCase()}</h2>
        {data.recentOrders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <ReceiptIcon className="h-7 w-7 text-slate-300" />
            <p className="text-sm text-slate-400">No orders in this period.</p>
          </div>
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
                      <span className={`badge ${o.status === 'PAID' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                        {o.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums text-slate-800">{formatMoney(o.totalCents)}</td>
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

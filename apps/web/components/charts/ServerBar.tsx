'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney } from '@/lib/api';
import ChartCard from './ChartCard';
import { BRAND, CHART_GRID, AXIS_TICK, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './palette';

export default function ServerBar({ data }: { data: { name: string; orders: number; revenueCents: number; guests: number }[] }) {
  const rows = [...data].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 8);
  return (
    <ChartCard title="Sales by Server" subtitle="Waiter leaderboard — spot who's upselling" empty={rows.length === 0}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(v)} width={70} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(v: any, _n: any, entry: any) => [`${formatMoney(v)} · ${entry.payload.orders} orders`, 'Revenue']}
          />
          <Bar dataKey="revenueCents" fill={BRAND} radius={[4, 4, 0, 0]} barSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

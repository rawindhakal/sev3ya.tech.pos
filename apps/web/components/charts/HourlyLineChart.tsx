'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney } from '@/lib/api';
import ChartCard from './ChartCard';
import { hourLabel } from './format';
import { BRAND, CHART_GRID, AXIS_TICK, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './palette';

export default function HourlyLineChart({ data }: { data: { hour: number; revenueCents: number; orders: number }[] }) {
  const full = Array.from({ length: 24 }, (_, hour) => {
    const row = data.find((d) => d.hour === hour);
    return { hour, label: hourLabel(hour), revenueCents: row?.revenueCents ?? 0, orders: row?.orders ?? 0 };
  });
  const empty = data.every((d) => !d.revenueCents);
  return (
    <ChartCard title="Hourly Sales" subtitle="Revenue by hour of day — spot the rush before it hits" empty={empty} className="lg:col-span-2">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={full} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} interval={2} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(v)} width={70} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(v: any, name: any) => (name === 'revenueCents' ? [formatMoney(v), 'Revenue'] : [v, 'Orders'])}
          />
          <Line type="monotone" dataKey="revenueCents" stroke={BRAND} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

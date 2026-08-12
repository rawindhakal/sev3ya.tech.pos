'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import ChartCard from './ChartCard';
import { BRAND, CHART_GRID, AXIS_TICK, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './palette';

export default function TopItemsBar({ data }: { data: { name: string; qty: number; revenueCents: number }[] }) {
  const top5 = [...data].sort((a, b) => b.qty - a.qty).slice(0, 5).reverse();
  return (
    <ChartCard title="Top 5 Items" subtitle="Bestsellers by quantity — keep the kitchen prepped" empty={top5.length === 0}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={top5} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={AXIS_TICK} width={110} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: any) => [v, 'Qty sold']} />
          <Bar dataKey="qty" radius={[0, 4, 4, 0]} barSize={16}>
            {top5.map((_, i) => (
              <Cell key={i} fill={BRAND} fillOpacity={0.55 + (i / top5.length) * 0.45} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

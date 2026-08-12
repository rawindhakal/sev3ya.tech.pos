'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatMoney } from '@/lib/api';
import type { OrderType } from '@/lib/types';
import ChartCard from './ChartCard';
import { SERIES_COLORS, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './palette';

const TYPE_LABEL: Record<OrderType, string> = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };

export default function OrderSourcePie({ data }: { data: { type: OrderType; totalCents: number; count: number }[] }) {
  const rows = data.filter((d) => d.count > 0);
  return (
    <ChartCard title="Order Source" subtitle="Dine-in vs. takeaway vs. delivery — where to put staff" empty={rows.length === 0}>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={rows} dataKey="count" nameKey="type" outerRadius={85} label={(e: any) => TYPE_LABEL[e.type as OrderType] ?? e.type}>
            {rows.map((r, i) => (
              <Cell key={r.type} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(v: any, _n: any, entry: any) => [`${v} orders · ${formatMoney(entry.payload.totalCents)}`, TYPE_LABEL[entry.payload.type as OrderType] ?? entry.payload.type]}
          />
          <Legend formatter={(value: any) => TYPE_LABEL[value as OrderType] ?? value} wrapperStyle={{ fontSize: 11, color: 'var(--chart-axis)' }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

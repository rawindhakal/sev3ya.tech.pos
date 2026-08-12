'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatMoney } from '@/lib/api';
import ChartCard from './ChartCard';
import { shortDate } from './format';
import { CHART_GRID, AXIS_TICK, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './palette';

export default function DiscountsVoidsBar({
  data,
}: {
  data: { date: string; discountCents: number; complimentaryCount: number; voidCount: number; voidedCents: number }[];
}) {
  const rows = data.map((d) => ({ ...d, label: shortDate(d.date) }));
  const empty = data.every((d) => !d.discountCents && !d.voidedCents);
  return (
    <ChartCard title="Discounts & Voids" subtitle="Revenue lost to discounts and cancelled tickets, by day" empty={empty}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(v)} width={70} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(v: any, name: any) => [formatMoney(v), name === 'discountCents' ? 'Discounts' : 'Voided value']}
          />
          <Legend formatter={(v: any) => (v === 'discountCents' ? 'Discounts' : 'Voided value')} wrapperStyle={{ fontSize: 11, color: 'var(--chart-axis)' }} />
          <Bar dataKey="discountCents" fill="#f59e0b" radius={[3, 3, 0, 0]} barSize={14} />
          <Bar dataKey="voidedCents" fill="#ef4444" radius={[3, 3, 0, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

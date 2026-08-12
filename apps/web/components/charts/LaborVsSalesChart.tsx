'use client';

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatMoney } from '@/lib/api';
import ChartCard from './ChartCard';
import { hourLabel } from './format';
import { BRAND, CHART_GRID, AXIS_TICK, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './palette';

// Labor cost is a derived estimate (monthlySalaryCents ÷ 26 ÷ 8, distributed
// across each employee's clocked-in hours) — there's no per-employee hourly
// rate field in the schema, so this is a useful directional signal for
// staffing decisions, not a payroll-accurate figure.
export default function LaborVsSalesChart({ data }: { data: { hour: number; laborCents: number; revenueCents: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: hourLabel(d.hour) }));
  const empty = data.every((d) => !d.laborCents && !d.revenueCents);
  return (
    <ChartCard
      title="Labor vs. Sales"
      subtitle="Estimated hourly labor cost overlaid on revenue — the profitability signal"
      empty={empty}
      className="lg:col-span-2"
    >
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} interval={2} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(v)} width={70} />
          <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(v)} width={70} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(v: any, name: any) => [formatMoney(v), name === 'revenueCents' ? 'Revenue' : 'Est. labor cost']}
          />
          <Legend formatter={(v: any) => (v === 'revenueCents' ? 'Revenue' : 'Est. labor cost')} wrapperStyle={{ fontSize: 11, color: 'var(--chart-axis)' }} />
          <Bar yAxisId="left" dataKey="laborCents" fill="#f59e0b" fillOpacity={0.55} radius={[3, 3, 0, 0]} barSize={14} />
          <Line yAxisId="right" type="monotone" dataKey="revenueCents" stroke={BRAND} strokeWidth={2.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

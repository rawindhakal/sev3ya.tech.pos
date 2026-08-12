'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import ChartCard from './ChartCard';
import { shortDate } from './format';
import { BRAND, CHART_GRID, AXIS_TICK, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './palette';

export default function NewReturningStackedBar({
  data,
  coverage,
}: {
  data: { date: string; newOrders: number; returningOrders: number }[];
  coverage: { noCustomer: number; total: number };
}) {
  const rows = data.map((d) => ({ ...d, label: shortDate(d.date) }));
  const empty = data.every((d) => !d.newOrders && !d.returningOrders);
  return (
    <ChartCard title="New vs. Returning Guests" subtitle="Does recent marketing actually bring in fresh faces?" empty={empty} emptyLabel="No orders with a linked customer yet.">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: any, name: any) => [v, name === 'newOrders' ? 'New' : 'Returning']} />
          <Legend formatter={(v: any) => (v === 'newOrders' ? 'New' : 'Returning')} wrapperStyle={{ fontSize: 11, color: 'var(--chart-axis)' }} />
          <Bar dataKey="newOrders" stackId="g" fill={BRAND} radius={[0, 0, 0, 0]} barSize={22} />
          <Bar dataKey="returningOrders" stackId="g" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={22} />
        </BarChart>
      </ResponsiveContainer>
      {coverage.total > 0 && coverage.noCustomer > 0 && (
        <p className="mt-2 text-center text-[11px] text-slate-400">
          {coverage.noCustomer} of {coverage.total} paid orders had no linked customer — excluded from this chart.
        </p>
      )}
    </ChartCard>
  );
}

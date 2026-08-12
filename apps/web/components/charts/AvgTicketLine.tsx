'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import ChartCard from './ChartCard';
import { shortDate } from './format';
import { BRAND, CHART_GRID, AXIS_TICK, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './palette';

export default function AvgTicketLine({
  data,
  targetMinutes,
}: {
  data: { date: string; avgMinutes: number | null; tickets: number }[];
  targetMinutes: number;
}) {
  const rows = data.map((d) => ({ ...d, label: shortDate(d.date) }));
  const empty = data.every((d) => d.avgMinutes == null);
  return (
    <ChartCard
      title="Average Ticket Time"
      subtitle={`Minutes from fired to ready · target ${targetMinutes} min`}
      empty={empty}
      emptyLabel="No completed tickets in this period yet."
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} unit=" min" width={55} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(v: any, _n: any, entry: any) => [`${v} min · ${entry.payload.tickets} tickets`, 'Avg. ticket time']}
          />
          <ReferenceLine y={targetMinutes} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: `Target ${targetMinutes} min`, position: 'insideTopRight', fill: 'var(--chart-axis)', fontSize: 10 }} />
          <Line type="monotone" dataKey="avgMinutes" stroke={BRAND} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

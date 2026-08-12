'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatMoney } from '@/lib/api';
import { PAYMENT_METHOD_LABEL } from '@/lib/constants';
import type { PaymentMethod } from '@/lib/types';
import ChartCard from './ChartCard';
import { shortDate } from './format';
import { PAYMENT_METHOD_HEX, CHART_GRID, AXIS_TICK, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './palette';

export default function PaymentMethodsArea({ data }: { data: Record<string, string | number>[] }) {
  const methods = [...new Set(data.flatMap((row) => Object.keys(row).filter((k) => k !== 'date')))];
  const rows = data.map((row) => ({ ...row, label: shortDate(String(row.date)) }));
  return (
    <ChartCard title="Payment Methods Over Time" subtitle="How guests pay, over time — track digital adoption" empty={data.length === 0} className="lg:col-span-2">
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => formatMoney(v)} width={70} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(v: any, name: any) => [formatMoney(v), PAYMENT_METHOD_LABEL[name as PaymentMethod] ?? name]}
          />
          <Legend formatter={(v: any) => PAYMENT_METHOD_LABEL[v as PaymentMethod] ?? v} wrapperStyle={{ fontSize: 11, color: 'var(--chart-axis)' }} />
          {methods.map((m) => (
            <Area key={m} type="monotone" dataKey={m} stackId="1" stroke={PAYMENT_METHOD_HEX[m] ?? '#94a3b8'} fill={PAYMENT_METHOD_HEX[m] ?? '#94a3b8'} fillOpacity={0.5} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatMoney } from '@/lib/api';
import { PAYMENT_METHOD_LABEL } from '@/lib/constants';
import type { PaymentMethod } from '@/lib/types';
import ChartCard from './ChartCard';
import { PAYMENT_METHOD_HEX, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './palette';

export default function PaymentDonut({ data }: { data: { method: PaymentMethod; amountCents: number; count: number }[] }) {
  const rows = data.filter((d) => d.amountCents > 0);
  const total = rows.reduce((s, r) => s + r.amountCents, 0);
  return (
    <ChartCard title="Payment Breakdown" subtitle="Cash vs. card vs. digital — for the till reconciliation" empty={rows.length === 0}>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={rows} dataKey="amountCents" nameKey="method" innerRadius={55} outerRadius={85} paddingAngle={2}>
            {rows.map((r) => (
              <Cell key={r.method} fill={PAYMENT_METHOD_HEX[r.method] ?? '#94a3b8'} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(v: any, _n: any, entry: any) => [`${formatMoney(v)} (${total ? Math.round((v / total) * 100) : 0}%)`, PAYMENT_METHOD_LABEL[entry.payload.method as PaymentMethod] ?? entry.payload.method]}
          />
          <Legend
            formatter={(value: string) => PAYMENT_METHOD_LABEL[value as PaymentMethod] ?? value}
            wrapperStyle={{ fontSize: 11, color: 'var(--chart-axis)' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

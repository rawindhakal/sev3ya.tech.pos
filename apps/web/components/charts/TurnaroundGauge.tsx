'use client';

import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import ChartCard from './ChartCard';

// A dine-in table under 30 min is brisk, 30-60 is normal, over 60 is slow —
// colors matched to that so the gauge reads at a glance, no legend needed.
function colorFor(minutes: number): string {
  if (minutes <= 30) return '#16a34a';
  if (minutes <= 60) return '#f59e0b';
  return '#ef4444';
}

export default function TurnaroundGauge({ minutes }: { minutes: number }) {
  const MAX = 120;
  const clamped = Math.min(minutes, MAX);
  const data = [{ name: 'turnaround', value: clamped, fill: colorFor(minutes) }];
  return (
    <ChartCard title="Table Turnaround" subtitle="Average time a party occupies a dine-in table" empty={minutes === 0} emptyLabel="No dine-in turnover data yet.">
      <ResponsiveContainer width="100%" height={200}>
        <RadialBarChart cx="50%" cy="75%" innerRadius="70%" outerRadius="100%" barSize={18} data={data} startAngle={180} endAngle={0}>
          <PolarAngleAxis type="number" domain={[0, MAX]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: 'var(--chart-grid)' }} dataKey="value" cornerRadius={9} angleAxisId={0} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="-mt-16 text-center">
        <div className="text-3xl font-bold tabular-nums text-slate-800">{minutes} min</div>
        <div className="text-xs text-slate-400">avg. per table</div>
      </div>
    </ChartCard>
  );
}

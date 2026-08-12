'use client';

import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatMoney } from '@/lib/api';
import ChartCard from './ChartCard';
import { CHART_GRID, AXIS_TICK, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './palette';

type MenuRow = { name: string; qty: number; revenueCents: number; costCents: number; profitCents: number; marginPct: number };

// Same BCG-style classification as the Reports page's menu-performance
// table (apps/web/app/reports/page.tsx) — popular vs. profitable against
// the period's own median, so "Star"/"Dog" mean the same thing everywhere.
function classify(items: MenuRow[]): Map<string, string> {
  if (!items.length) return new Map();
  const qtys = [...items].map((i) => i.qty).sort((a, b) => a - b);
  const margins = [...items].map((i) => i.marginPct).sort((a, b) => a - b);
  const medQty = qtys[Math.floor(qtys.length / 2)];
  const medMargin = margins[Math.floor(margins.length / 2)];
  const m = new Map<string, string>();
  for (const i of items) {
    const pop = i.qty >= medQty;
    const prof = i.marginPct >= medMargin;
    m.set(i.name, pop && prof ? 'Star' : pop && !prof ? 'Plowhorse' : !pop && prof ? 'Puzzle' : 'Dog');
  }
  return m;
}
const CLASS_COLOR: Record<string, string> = { Star: '#16a34a', Plowhorse: '#2563eb', Puzzle: '#f59e0b', Dog: '#94a3b8' };

export default function MenuScatter({ data }: { data: MenuRow[] }) {
  const bcg = classify(data);
  return (
    <ChartCard title="Menu Engineering" subtitle="Popularity vs. margin — Stars, Plowhorses, Puzzles, Dogs" empty={data.length === 0}>
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART_GRID} />
          <XAxis type="number" dataKey="marginPct" name="Margin" unit="%" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis type="number" dataKey="qty" name="Qty sold" tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
          <ZAxis type="number" dataKey="revenueCents" range={[40, 400]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(v: any, name: any, entry: any) =>
              name === 'marginPct' ? [`${v}%`, 'Margin'] : name === 'qty' ? [`${v} · ${formatMoney(entry.payload.revenueCents)}`, 'Qty sold'] : [v, name]
            }
            labelFormatter={(_l: any, payload: any) => (payload?.[0]?.payload as MenuRow)?.name ?? ''}
          />
          <Scatter data={data}>
            {data.map((d) => (
              <Cell key={d.name} fill={CLASS_COLOR[bcg.get(d.name) ?? 'Dog']} fillOpacity={0.8} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
        {Object.entries(CLASS_COLOR).map(([label, color]) => (
          <span key={label} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
          </span>
        ))}
      </div>
    </ChartCard>
  );
}

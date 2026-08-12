'use client';

import { Treemap, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney } from '@/lib/api';
import ChartCard from './ChartCard';
import { SERIES_COLORS, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE } from './palette';

function TreemapCell(props: any) {
  const { x, y, width, height, name, index } = props;
  if (width < 2 || height < 2) return null;
  const color = SERIES_COLORS[index % SERIES_COLORS.length];
  const showLabel = width > 55 && height > 28;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.85} stroke="var(--chart-tooltip-bg)" strokeWidth={2} rx={4} />
      {showLabel && (
        <text x={x + 8} y={y + 18} fill="#fff" fontSize={12} fontWeight={600}>
          {name}
        </text>
      )}
    </g>
  );
}

export default function CategoryTreemap({ data }: { data: { name: string; revenueCents: number; qty: number }[] }) {
  const rows = data.filter((d) => d.revenueCents > 0);
  return (
    <ChartCard title="Sales by Category" subtitle="Which part of the menu is actually driving revenue" empty={rows.length === 0}>
      <ResponsiveContainer width="100%" height={240}>
        <Treemap data={rows} dataKey="revenueCents" nameKey="name" content={<TreemapCell />}>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(v: any, _n: any, entry: any) => [`${formatMoney(v)} · ${entry.payload.qty} sold`, entry.payload.name]}
          />
        </Treemap>
      </ResponsiveContainer>
    </ChartCard>
  );
}

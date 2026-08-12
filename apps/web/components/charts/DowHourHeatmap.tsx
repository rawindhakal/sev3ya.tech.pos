'use client';

import { Fragment, useState } from 'react';
import { formatMoney } from '@/lib/api';
import ChartCard from './ChartCard';
import { DOW_LABEL, hourLabel } from './format';
import { BRAND } from './palette';

// No built-in recharts heatmap type — a color-intensity grid is the
// standard way to show this, so it's hand-built here (matches the same
// dependency-free-where-it-makes-sense spirit as the rest of the chart set).
export default function DowHourHeatmap({ data }: { data: { dow: number; hour: number; revenueCents: number; orders: number }[] }) {
  const [hover, setHover] = useState<{ dow: number; hour: number } | null>(null);
  const cellOf = new Map(data.map((d) => [`${d.dow}:${d.hour}`, d]));
  const max = Math.max(...data.map((d) => d.revenueCents), 1);
  const empty = data.length === 0;

  return (
    <ChartCard
      title="Day × Hour Heatmap"
      subtitle="Transaction volume by day and hour — build next week's schedule around this"
      empty={empty}
      className="lg:col-span-2"
    >
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[2.5rem_repeat(24,1fr)] gap-[2px]">
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="text-center text-[9px] text-slate-400">
                {h % 3 === 0 ? h : ''}
              </div>
            ))}
            {DOW_LABEL.map((label, dow) => (
              <Fragment key={dow}>
                <div className="flex items-center text-[10px] text-slate-400">
                  {label}
                </div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = cellOf.get(`${dow}:${hour}`);
                  const intensity = cell ? cell.revenueCents / max : 0;
                  const isHover = hover?.dow === dow && hover?.hour === hour;
                  return (
                    <div
                      key={`${dow}-${hour}`}
                      onMouseEnter={() => setHover({ dow, hour })}
                      onMouseLeave={() => setHover(null)}
                      className="relative aspect-square rounded-[2px]"
                      style={{ background: intensity ? BRAND : 'var(--chart-grid)', opacity: intensity ? 0.15 + intensity * 0.85 : 1 }}
                    >
                      {isHover && cell && (
                        <div className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[10px]" style={{ background: 'var(--chart-tooltip-bg)', color: 'var(--chart-tooltip-text)' }}>
                          {DOW_LABEL[dow]} {hourLabel(hour)} · {formatMoney(cell.revenueCents)} · {cell.orders} orders
                        </div>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </ChartCard>
  );
}

'use client';

// Minimal dependency-free SVG line chart with area fill + hover tooltip.
import { useState } from 'react';

export interface Point {
  label: string;
  value: number;
}

export default function LineChart({
  data,
  height = 220,
  formatValue = (v) => String(v),
}: {
  data: Point[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const pad = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">
        No sales data yet
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const x = (i: number) => pad.left + (data.length > 1 ? i * stepX : innerW / 2);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;

  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`)
    .join(' ');
  const areaPath =
    `${linePath} L ${x(data.length - 1)} ${pad.top + innerH} L ${x(0)} ${
      pad.top + innerH
    } Z`;

  // 4 horizontal gridlines.
  const grid = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Sales trend chart"
    >
      <defs>
        <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e23368" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#e23368" stopOpacity="0" />
        </linearGradient>
      </defs>

      {grid.map((g, i) => {
        const gy = pad.top + innerH - g * innerH;
        return (
          <g key={i}>
            <line
              x1={pad.left}
              y1={gy}
              x2={width - pad.right}
              y2={gy}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text x={pad.left - 8} y={gy + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
              {formatValue(Math.round(g * max))}
            </text>
          </g>
        );
      })}

      <path d={areaPath} fill="url(#salesFill)" />
      <path d={linePath} fill="none" stroke="#e23368" strokeWidth={2.5} strokeLinejoin="round" />

      {data.map((d, i) => (
        <g key={i}>
          <circle
            cx={x(i)}
            cy={y(d.value)}
            r={hover === i ? 5 : 3}
            fill="#e23368"
            stroke="#fff"
            strokeWidth={1.5}
          />
          {/* invisible hit area */}
          <rect
            x={x(i) - stepX / 2}
            y={pad.top}
            width={stepX || innerW}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
          {i % Math.ceil(data.length / 10) === 0 && (
            <text x={x(i)} y={height - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
              {d.label}
            </text>
          )}
        </g>
      ))}

      {hover !== null && (
        <g>
          <line
            x1={x(hover)}
            y1={pad.top}
            x2={x(hover)}
            y2={pad.top + innerH}
            stroke="#cbd5e1"
            strokeDasharray="3 3"
          />
          <rect
            x={Math.min(Math.max(x(hover) - 55, 0), width - 110)}
            y={pad.top}
            width={110}
            height={38}
            rx={6}
            fill="#0f172a"
          />
          <text
            x={Math.min(Math.max(x(hover), 55), width - 55)}
            y={pad.top + 16}
            textAnchor="middle"
            className="fill-white text-[11px] font-semibold"
          >
            {formatValue(data[hover].value)}
          </text>
          <text
            x={Math.min(Math.max(x(hover), 55), width - 55)}
            y={pad.top + 30}
            textAnchor="middle"
            className="fill-slate-300 text-[10px]"
          >
            {data[hover].label}
          </text>
        </g>
      )}
    </svg>
  );
}

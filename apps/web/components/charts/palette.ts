// Shared color palette + small helpers for the Dashboard's Recharts-based
// charts. Structural colors (grid lines, axis text, tooltip chrome) reuse
// the app's existing --chart-* CSS custom properties (globals.css, flipped
// by the .dark class) — Recharts renders plain SVG, so a `var(--chart-*)`
// string works directly as a stroke/fill value, same as the hand-built
// LineChart.tsx already relies on. Categorical/series colors below are a
// fixed hex palette (SVG gradients/fills can't resolve Tailwind classes).

export const BRAND = '#e23368';

// Qualitative palette for multi-series charts (order source, new/returning,
// payment methods over time) — brand color first, then a curated set that
// reads clearly in both themes.
export const SERIES_COLORS = ['#e23368', '#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#9333ea', '#94a3b8'];

// Matches PAYMENT_METHOD_COLOR's Tailwind classes (lib/constants.ts) so a
// payment method reads as the same color everywhere in the app.
export const PAYMENT_METHOD_HEX: Record<string, string> = {
  CASH: '#10b981',
  FONEPAY: '#ef4444',
  ESEWA: '#16a34a',
  KHALTI: '#9333ea',
  BANK: '#2563eb',
  CARD: '#6366f1',
  CREDIT: '#f59e0b',
  GIFTCARD: '#ec4899',
  OFFLINE: '#94a3b8',
};

export const CHART_GRID = 'var(--chart-grid)';
export const CHART_AXIS = 'var(--chart-axis)';
export const TOOLTIP_STYLE = {
  background: 'var(--chart-tooltip-bg)',
  border: 'none',
  borderRadius: 8,
  color: 'var(--chart-tooltip-text)',
  fontSize: 12,
  padding: '8px 12px',
};
export const TOOLTIP_LABEL_STYLE = { color: 'var(--chart-tooltip-sub)', marginBottom: 4 };
export const AXIS_TICK = { fill: CHART_AXIS, fontSize: 10 };

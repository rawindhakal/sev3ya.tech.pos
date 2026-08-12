'use client';

import { InboxIcon } from '@/components/icons';

// Shared card shell for every Dashboard chart — title, optional subtitle,
// consistent empty state — so 14 chart components don't each re-implement
// the same header/spacing/empty-state markup.
export default function ChartCard({
  title,
  subtitle,
  empty,
  emptyLabel = 'No data for this period.',
  className = '',
  children,
}: {
  title: string;
  subtitle?: string;
  empty?: boolean;
  emptyLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`card p-4 sm:p-6 ${className}`}>
      <h2 className="mb-1 font-semibold text-slate-800">{title}</h2>
      {subtitle && <p className="mb-4 text-xs text-slate-400">{subtitle}</p>}
      {empty ? (
        <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-sm text-slate-400">
          <InboxIcon className="h-7 w-7 opacity-40" />
          {emptyLabel}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

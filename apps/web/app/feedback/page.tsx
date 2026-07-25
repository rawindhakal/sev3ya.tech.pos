'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { OrderFeedback } from '@/lib/types';
import { notify } from '@/lib/dialog';

const STARS = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export default function FeedbackPage() {
  const [rows, setRows] = useState<OrderFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    api.get<OrderFeedback[]>(`/orders/feedback/summary?days=${days}`)
      .then(setRows)
      .catch((e) => notify((e as Error).message, 'error'))
      .finally(() => setLoading(false));
  }, [days]);

  const avg = useMemo(() => (rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0), [rows]);
  const counts = useMemo(() => {
    const c = [0, 0, 0, 0, 0];
    for (const r of rows) c[Math.min(5, Math.max(1, r.rating)) - 1]++;
    return c;
  }, [rows]);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Guest Feedback</h1>
          <p className="text-sm text-slate-500">Ratings collected after checkout on the QR self-order page</p>
        </div>
        <select className="input w-auto" value={days} onChange={(e) => setDays(parseInt(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-6">
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-900">{avg.toFixed(1)}</div>
          <div className="text-sm text-slate-500">Average rating</div>
        </div>
        <div className="card p-5">
          <div className="text-2xl font-bold text-slate-900">{rows.length}</div>
          <div className="text-sm text-slate-500">Responses</div>
        </div>
        {counts.map((c, i) => (
          <div key={i} className="card p-5 text-center">
            <div className="text-lg font-bold text-slate-900">{c}</div>
            <div className="text-xs text-amber-500">{STARS(i + 1)}</div>
          </div>
        ))}
      </div>

      <div className="card divide-y divide-slate-50">
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">No feedback yet in this window.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-amber-500">{STARS(r.rating)}</span>
                <span className="text-xs text-slate-400">
                  {r.order ? `#${r.order.number} · ${r.order.type}` : ''} · {new Date(r.createdAt).toLocaleString()}
                </span>
              </div>
              {r.comment && <p className="mt-1 text-sm text-slate-600">{r.comment}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Outlet } from '@/lib/types';
import { formatBsLong } from '@/lib/bs-date';

interface Overview {
  headcount: number;
  pendingLeaveCount: number;
  expiringDocuments: { id: string; employeeName: string; title: string; type: string; expiryDate: string | null; isExpired: boolean }[];
}

export default function HrOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState('');

  useEffect(() => { api.get<Outlet[]>('/outlets').then(setOutlets).catch(() => {}); }, []);
  useEffect(() => {
    api.get<Overview>(`/hr/overview${outletId ? `?outletId=${outletId}` : ''}`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [outletId]);

  if (error) return <div className="p-8"><div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div></div>;
  if (!data) return <div className="p-8 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">HRM Overview</h1>
          <p className="text-sm text-slate-500">{formatBsLong(new Date())} BS</p>
        </div>
        {outlets.length > 1 && (
          <select className="input w-auto" value={outletId} onChange={(e) => setOutletId(e.target.value)} aria-label="Outlet">
            <option value="">All outlets</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-2xl font-bold text-slate-900">{data.headcount}</div>
          <div className="text-sm text-slate-500">Active employees</div>
        </div>
        <Link href="/hr/leave" className="card p-4 transition-colors hover:border-brand-400">
          <div className="text-2xl font-bold text-slate-900">{data.pendingLeaveCount}</div>
          <div className="text-sm text-slate-500">Leave requests awaiting approval</div>
        </Link>
        <Link href="/attendance" className="card p-4 transition-colors hover:border-brand-400">
          <div className="text-2xl font-bold text-slate-900">→</div>
          <div className="text-sm text-slate-500">Attendance & Payroll</div>
        </Link>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold text-slate-800">Documents expiring in the next 30 days</h2>
        {data.expiringDocuments.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing expiring soon.</p>
        ) : (
          <div className="space-y-2">
            {data.expiringDocuments.map((d) => (
              <div key={d.id} className="flex items-center justify-between border-b border-slate-50 py-1.5 text-sm">
                <span>
                  <span className="font-medium text-slate-700">{d.employeeName}</span> — {d.title}
                  <span className="ml-1 text-xs text-slate-400">({d.type})</span>
                </span>
                <span className={`badge ${d.isExpired ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                  {d.isExpired ? 'Expired' : 'Expires'} {d.expiryDate ? new Date(d.expiryDate).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        <Link href="/hr/documents" className="mt-3 inline-block text-sm text-brand-600 underline">Manage documents →</Link>
      </div>
    </div>
  );
}

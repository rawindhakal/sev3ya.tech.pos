'use client';

import { useEffect, useState } from 'react';
import { api, formatMoney } from '@/lib/api';
import type { RestaurantTable, TableArea, TableStatus } from '@/lib/types';
import Modal from '@/components/Modal';

const STATUS_STYLE: Record<TableStatus, string> = {
  AVAILABLE: 'border-green-300 bg-green-50',
  OCCUPIED: 'border-amber-300 bg-amber-50',
  RESERVED: 'border-indigo-300 bg-indigo-50',
  CLEANING: 'border-slate-300 bg-slate-100',
};
const STATUS_BADGE: Record<TableStatus, string> = {
  AVAILABLE: 'bg-green-100 text-green-700',
  OCCUPIED: 'bg-amber-100 text-amber-700',
  RESERVED: 'bg-indigo-100 text-indigo-700',
  CLEANING: 'bg-slate-200 text-slate-600',
};

// Color-coded seated timer (matrix #27): green < 30m, amber < 60m, red beyond.
function SeatedTimer({ seatedAt }: { seatedAt: string }) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(seatedAt).getTime()) / 60000));
  const color = mins < 30 ? 'text-green-600' : mins < 60 ? 'text-amber-600' : 'text-red-600';
  const label = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  return <span className={`font-semibold ${color}`}>⏱ {label}</span>;
}

export default function TablesPage() {
  const [areas, setAreas] = useState<TableArea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', seats: 4, area: '', isVip: false });
  const [saving, setSaving] = useState(false);
  const [, setTick] = useState(0); // forces timer re-render each second

  const [transferFor, setTransferFor] = useState<RestaurantTable | null>(null);
  const [mergeFor, setMergeFor] = useState<RestaurantTable | null>(null);

  async function load() {
    try {
      setAreas(await api.get<TableArea[]>('/tables?groupBy=area'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    const clock = setInterval(() => setTick((n) => n + 1), 30000);
    return () => {
      clearInterval(t);
      clearInterval(clock);
    };
  }, []);

  const allTables = areas.flatMap((a) => a.tables);
  const occupied = allTables.filter((t) => t.status === 'OCCUPIED' && t.activeOrder);
  const available = allTables.filter((t) => t.status === 'AVAILABLE');

  async function setStatus(id: string, status: TableStatus) {
    await api.patch(`/tables/${id}`, { status });
    load();
  }
  async function toggleVip(t: RestaurantTable) {
    await api.patch(`/tables/${t.id}`, { isVip: !t.isVip });
    load();
  }

  async function addTable(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/tables', {
        name: form.name.trim(),
        seats: Number(form.seats),
        area: form.area.trim() || undefined,
        isVip: form.isVip,
      });
      setForm({ name: '', seats: 4, area: '', isVip: false });
      setAddOpen(false);
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function doTransfer(targetTableId: string) {
    if (!transferFor?.activeOrder) return;
    try {
      await api.post(`/orders/${transferFor.activeOrder.id}/transfer`, { tableId: targetTableId });
      setTransferFor(null);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function doMerge(fromTable: RestaurantTable) {
    if (!mergeFor?.activeOrder || !fromTable.activeOrder) return;
    try {
      // Merge the chosen table's order INTO the current table's order.
      await api.post(`/orders/${mergeFor.activeOrder.id}/merge`, { fromOrderId: fromTable.activeOrder.id });
      setMergeFor(null);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const counts = allTables.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tables</h1>
          <p className="text-sm text-slate-500">
            {counts.AVAILABLE ?? 0} free · {counts.OCCUPIED ?? 0} occupied · {counts.RESERVED ?? 0} reserved · {counts.CLEANING ?? 0} cleaning
          </p>
        </div>
        <button className="btn-primary" onClick={() => setAddOpen(true)}>+ Table</button>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error} — is the API running on port 4000?
        </div>
      )}

      {areas.map((a) => (
        <div key={a.area} className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{a.area}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {a.tables.map((t) => (
              <div key={t.id} className={`relative rounded-xl border-2 p-4 ${STATUS_STYLE[t.status]}`}>
                {t.isVip && (
                  <span className="absolute right-2 top-2 text-sm" title="VIP table">⭐</span>
                )}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-lg font-bold text-slate-800">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.seats} seats</div>
                  </div>
                  <span className={`badge ${STATUS_BADGE[t.status]}`}>{t.status}</span>
                </div>

                {t.activeOrder && (
                  <div className="mt-2 rounded-lg bg-white/60 p-2 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span>#{t.activeOrder.number}</span>
                      {t.activeOrder.seatedAt && <SeatedTimer seatedAt={t.activeOrder.seatedAt} />}
                    </div>
                    <div>{formatMoney(t.activeOrder.totalCents)} · {t.activeOrder.guestCount} guests</div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1">
                  {t.status === 'OCCUPIED' && t.activeOrder ? (
                    <>
                      <button onClick={() => setTransferFor(t)} className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50">
                        Transfer
                      </button>
                      <button onClick={() => setMergeFor(t)} className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50">
                        Merge
                      </button>
                    </>
                  ) : (
                    (['AVAILABLE', 'RESERVED', 'CLEANING'] as TableStatus[])
                      .filter((s) => s !== t.status)
                      .map((s) => (
                        <button
                          key={s}
                          onClick={() => setStatus(t.id, s)}
                          className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-50"
                        >
                          {s === 'AVAILABLE' ? 'Free' : s === 'RESERVED' ? 'Reserve' : 'Clean'}
                        </button>
                      ))
                  )}
                  <button onClick={() => toggleVip(t)} className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-amber-600 hover:bg-amber-50">
                    {t.isVip ? '★ VIP' : '☆ VIP'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Transfer modal */}
      <Modal open={!!transferFor} title={`Transfer order from ${transferFor?.name ?? ''}`} onClose={() => setTransferFor(null)}>
        <p className="mb-3 text-sm text-slate-500">Choose a free table to move this order to:</p>
        {available.length === 0 ? (
          <p className="text-sm text-slate-400">No free tables available.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {available.map((t) => (
              <button key={t.id} onClick={() => doTransfer(t.id)} className="rounded-lg border-2 border-slate-200 p-3 text-center hover:border-brand-400 hover:bg-brand-50">
                <div className="font-bold text-slate-800">{t.name}</div>
                <div className="text-xs text-slate-400">{t.seats} seats</div>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Merge modal */}
      <Modal open={!!mergeFor} title={`Merge into ${mergeFor?.name ?? ''}`} onClose={() => setMergeFor(null)}>
        <p className="mb-3 text-sm text-slate-500">Choose another occupied table — its order will be merged into {mergeFor?.name}:</p>
        {occupied.filter((t) => t.id !== mergeFor?.id).length === 0 ? (
          <p className="text-sm text-slate-400">No other occupied tables to merge.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {occupied
              .filter((t) => t.id !== mergeFor?.id)
              .map((t) => (
                <button key={t.id} onClick={() => doMerge(t)} className="rounded-lg border-2 border-slate-200 p-3 text-center hover:border-brand-400 hover:bg-brand-50">
                  <div className="font-bold text-slate-800">{t.name}</div>
                  <div className="text-xs text-slate-400">{formatMoney(t.activeOrder?.totalCents ?? 0)}</div>
                </button>
              ))}
          </div>
        )}
      </Modal>

      {/* Add table modal */}
      <Modal open={addOpen} title="Add table" onClose={() => setAddOpen(false)}>
        <form onSubmit={addTable} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. T7" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Seats</label>
              <input className="input" type="number" min={1} value={form.seats} onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Area</label>
              <input className="input" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="e.g. Patio" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.isVip} onChange={(e) => setForm({ ...form, isVip: e.target.checked })} />
            Mark as VIP table
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

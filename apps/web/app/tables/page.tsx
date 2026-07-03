'use client';

import { useEffect, useState } from 'react';
import { api, formatMoney } from '@/lib/api';
import type { TableArea, TableStatus } from '@/lib/types';
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

export default function TablesPage() {
  const [areas, setAreas] = useState<TableArea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', seats: 4, area: '' });
  const [saving, setSaving] = useState(false);

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
    const t = setInterval(load, 10000); // live-ish refresh
    return () => clearInterval(t);
  }, []);

  async function setStatus(id: string, status: TableStatus) {
    await api.patch(`/tables/${id}`, { status });
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
      });
      setForm({ name: '', seats: 4, area: '' });
      setAddOpen(false);
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const counts = areas
    .flatMap((a) => a.tables)
    .reduce(
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
            {counts.AVAILABLE ?? 0} free · {counts.OCCUPIED ?? 0} occupied · {counts.RESERVED ?? 0} reserved
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
              <div key={t.id} className={`rounded-xl border-2 p-4 ${STATUS_STYLE[t.status]}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-lg font-bold text-slate-800">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.seats} seats</div>
                  </div>
                  <span className={`badge ${STATUS_BADGE[t.status]}`}>{t.status}</span>
                </div>
                {t.activeOrder && (
                  <div className="mt-2 rounded-lg bg-white/60 p-2 text-xs text-slate-600">
                    Order #{t.activeOrder.number} · {formatMoney(t.activeOrder.totalCents)}
                    <br />
                    {t.activeOrder.guestCount} guests
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-1">
                  {(['AVAILABLE', 'RESERVED', 'CLEANING'] as TableStatus[])
                    .filter((s) => s !== t.status)
                    .map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatus(t.id, s)}
                        className="rounded-md bg-white px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-50"
                      >
                        {s === 'AVAILABLE' ? 'Free' : s === 'RESERVED' ? 'Reserve' : 'Clean'}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

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
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

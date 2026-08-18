'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Outlet, RestaurantTable } from '@/lib/types';
import Modal from '@/components/Modal';
import { confirmDialog, promptDialog, notify } from '@/lib/dialog';

const blankForm = { name: '', number: '', seats: '4', area: '', isVip: false };

export default function TablesAreasPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState('');
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [areas, setAreas] = useState<{ area: string; tableCount: number }[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Outlet[]>('/outlets').then((o) => { setOutlets(o); if (o.length && !outletId) setOutletId(o.find((x) => x.isDefault)?.id ?? o[0].id); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (outletId) q.set('outletId', outletId);
      if (showInactive) q.set('includeInactive', '1');
      const [t, a] = await Promise.all([
        api.get<RestaurantTable[]>(`/tables?${q.toString()}`),
        api.get<{ area: string; tableCount: number }[]>(`/tables/areas${outletId ? `?outletId=${outletId}` : ''}`),
      ]);
      setTables(t);
      setAreas(a);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [outletId, showInactive]);
  useEffect(() => { load(); }, [load]);

  const existingAreaNames = [...new Set(tables.map((t) => t.area).filter((a): a is string => !!a))].sort();

  function openCreate() {
    setEditingId(null);
    setForm(blankForm);
    setModal(true);
  }
  function openEdit(t: RestaurantTable) {
    setEditingId(t.id);
    setForm({ name: t.name, number: t.number != null ? String(t.number) : '', seats: String(t.seats), area: t.area ?? '', isVip: !!t.isVip });
    setModal(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        number: form.number.trim() ? Number(form.number) : undefined,
        seats: Math.max(1, Number(form.seats) || 1),
        area: form.area.trim() || undefined,
        isVip: form.isVip,
      };
      if (editingId) await api.patch(`/tables/${editingId}`, payload);
      else await api.post('/tables', payload);
      setModal(false);
      await load();
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function removeTable(t: RestaurantTable) {
    if (!(await confirmDialog(`Delete table "${t.name}"?`, { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await api.delete(`/tables/${t.id}`);
      await load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }
  async function restoreTable(t: RestaurantTable) {
    try {
      await api.patch(`/tables/${t.id}`, { isActive: true });
      await load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function renameArea(area: string) {
    const name = await promptDialog(`Rename area "${area}" to:`, area, { title: 'Rename area' });
    if (!name?.trim() || name.trim() === area) return;
    try {
      await api.patch(`/tables/areas/${encodeURIComponent(area)}`, { name: name.trim() });
      await load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }
  async function dissolveArea(area: string, count: number) {
    if (!(await confirmDialog(`Remove area "${area}"? Its ${count} table(s) will become Unassigned — they won't be deleted.`, { danger: true, confirmLabel: 'Remove area' }))) return;
    try {
      await api.delete(`/tables/areas/${encodeURIComponent(area)}`);
      await load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tables &amp; Areas</h1>
          <p className="text-sm text-slate-500">Add, edit, delete tables and manage the areas they're grouped under</p>
        </div>
        {outlets.length > 1 && (
          <select className="input w-auto" value={outletId} onChange={(e) => setOutletId(e.target.value)} aria-label="Outlet">
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </header>

      {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      {/* ── Areas ── */}
      <div className="card mb-6 p-5">
        <h2 className="mb-1 font-semibold text-slate-800">Areas</h2>
        <p className="mb-4 text-xs text-slate-400">Areas are just a label on each table — rename one to relabel every table in it at once, or remove it to un-group its tables (they stay, just become "Unassigned").</p>
        {areas.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No areas yet — add a table with an area name below.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((a) => (
              <div key={a.area} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600">
                <div>
                  <div className="font-medium text-slate-700 dark:text-slate-200">{a.area}</div>
                  <div className="text-xs text-slate-400">{a.tableCount} table{a.tableCount === 1 ? '' : 's'}</div>
                </div>
                {a.area !== 'Unassigned' && (
                  <div className="flex gap-1">
                    <button onClick={() => renameArea(a.area)} className="rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600">✏️</button>
                    <button onClick={() => dissolveArea(a.area, a.tableCount)} className="rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600">🗑</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tables ── */}
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-800">Tables</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show deleted
            </label>
            <button className="btn-primary" onClick={openCreate}>+ Add Table</button>
          </div>
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
        ) : tables.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No tables yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="p-2">Name</th><th className="p-2">Area</th><th className="p-2 text-right">Seats</th><th className="p-2">Status</th><th className="p-2" /><th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tables.map((t) => (
                  <tr key={t.id} className={t.isActive === false ? 'opacity-50' : ''}>
                    <td className="p-2 font-medium text-slate-700">{t.name}</td>
                    <td className="p-2 text-slate-500">{t.area ?? <span className="text-slate-300">Unassigned</span>}</td>
                    <td className="p-2 text-right tabular-nums">{t.seats}</td>
                    <td className="p-2"><span className="badge bg-slate-100 text-slate-500">{t.isActive === false ? 'Deleted' : t.status}</span></td>
                    <td className="p-2">{t.isVip && <span title="VIP table">⭐</span>}</td>
                    <td className="p-2 text-right">
                      {t.isActive === false ? (
                        <button onClick={() => restoreTable(t)} className="rounded-md px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50">Restore</button>
                      ) : (
                        <>
                          <button onClick={() => openEdit(t)} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">Edit</button>
                          <button onClick={() => removeTable(t)} className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50">Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} title={editingId ? 'Edit table' : 'Add table'} onClose={() => setModal(false)}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. T7" required autoFocus />
            </div>
            <div>
              <label className="label">Table No (optional)</label>
              <input className="input" type="number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="e.g. 46" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Seats</label>
              <input className="input" type="number" min={1} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
            </div>
            <div>
              <label className="label">Area</label>
              <input className="input" list="area-suggestions" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="e.g. Patio" />
              <datalist id="area-suggestions">
                {existingAreaNames.map((a) => <option key={a} value={a} />)}
              </datalist>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.isVip} onChange={(e) => setForm({ ...form, isVip: e.target.checked })} /> VIP table
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

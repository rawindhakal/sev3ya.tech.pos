'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Employee, PerformanceNote } from '@/lib/types';
import { confirmDialog, notify } from '@/lib/dialog';
import FeatureGate from '@/components/FeatureGate';

const TYPE_BADGE: Record<string, string> = {
  NOTE: 'bg-slate-100 text-slate-600',
  WARNING: 'bg-amber-100 text-amber-700',
  COMMENDATION: 'bg-emerald-100 text-emerald-700',
};

function HrPerformancePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState('');
  const [notes, setNotes] = useState<PerformanceNote[]>([]);
  const [form, setForm] = useState({ type: 'NOTE', title: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<Employee[]>('/employees').then((emps) => {
      setEmployees(emps);
      if (!selected && emps.length) setSelected(emps[0].id);
    }).catch((e) => setErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = () => {
    if (!selected) return;
    api.get<PerformanceNote[]>(`/hr/performance?employeeId=${selected}`).then(setNotes).catch(() => {});
  };
  useEffect(load, [selected]);

  async function addNote(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await api.post('/hr/performance', { ...form, employeeId: selected });
      setForm({ type: 'NOTE', title: '', description: '' });
      load();
    } catch (e) { notify((e as Error).message, 'error'); } finally { setSaving(false); }
  }
  async function remove(n: PerformanceNote) {
    if (!(await confirmDialog(`Delete "${n.title}"?`, { danger: true, confirmLabel: 'Delete' }))) return;
    try { await api.delete(`/hr/performance/${n.id}`); load(); } catch (e) { notify((e as Error).message, 'error'); }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Performance & Discipline</h1>
        <p className="text-sm text-slate-500">Notes, warnings and commendations per employee</p>
      </header>

      {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="mb-5">
        <label className="label">Employee</label>
        <select className="input w-auto min-w-[240px]" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {selected && (
        <>
          <form onSubmit={addNote} className="card mb-6 space-y-3 p-5">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Type</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="NOTE">Note</option>
                  <option value="WARNING">Warning</option>
                  <option value="COMMENDATION">Commendation</option>
                </select>
              </div>
              <div className="col-span-2"><label className="label">Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Late arrival, third occurrence" /></div>
            </div>
            <div><label className="label">Description (optional)</label><textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : '+ Add note'}</button>
          </form>

          <div className="space-y-3">
            {notes.map((n) => (
              <div key={n.id} className="card p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className={`badge ${TYPE_BADGE[n.type] ?? 'bg-slate-100 text-slate-600'}`}>{n.type}</span>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {new Date(n.createdAt).toLocaleDateString()} {n.createdBy ? `· ${n.createdBy}` : ''}
                    <button onClick={() => remove(n)} className="text-slate-300 hover:text-red-600">🗑</button>
                  </div>
                </div>
                <div className="font-medium text-slate-800">{n.title}</div>
                {n.description && <p className="mt-1 text-sm text-slate-600">{n.description}</p>}
              </div>
            ))}
            {notes.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No performance notes yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}


export default function HrPerformancePageGated() {
  return (
    <FeatureGate feature="hrm">
      <HrPerformancePage />
    </FeatureGate>
  );
}

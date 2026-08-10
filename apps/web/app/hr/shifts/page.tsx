'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Employee, Outlet, RosterEntry, ShiftTemplate } from '@/lib/types';
import Modal from '@/components/Modal';
import { confirmDialog, notify } from '@/lib/dialog';

type AttSummaryDay = { date: string; firstIn: string; lastOut: string; hours: number };
type AttSummary = { employeeId: string; days: AttSummaryDay[] }[];

const TABS = ['Weekly Roster', 'Shift Templates'] as const;
type Tab = (typeof TABS)[number];

const blankTemplate = { id: '', name: '', startTime: '09:00', endTime: '17:00', outletId: '', color: '#6366f1' };

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // Monday start
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fmtHm(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function HrShiftsPage() {
  const [tab, setTab] = useState<Tab>('Weekly Roster');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState('');
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [actual, setActual] = useState<AttSummary>([]);
  const [err, setErr] = useState<string | null>(null);

  const [assignModal, setAssignModal] = useState<{ employeeId: string; date: string } | null>(null);
  const [assignForm, setAssignForm] = useState({ shiftTemplateId: '', startTime: '09:00', endTime: '17:00', notes: '' });
  const [tplModal, setTplModal] = useState(false);
  const [tplForm, setTplForm] = useState(blankTemplate);

  useEffect(() => { api.get<Employee[]>('/employees').then(setEmployees).catch(() => {}); }, []);
  useEffect(() => { api.get<Outlet[]>('/outlets').then((o) => { setOutlets(o); if (o.length && !outletId) setOutletId(o.find((x) => x.isDefault)?.id ?? o[0].id); }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.get<ShiftTemplate[]>('/hr/shift-templates').then(setTemplates).catch(() => {}); }, []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }), [weekStart]);
  const from = toDateKey(days[0]);
  const to = toDateKey(days[6]);

  const loadRoster = useCallback(() => {
    if (!outletId) return;
    api.get<RosterEntry[]>(`/hr/roster?from=${from}&to=${to}&outletId=${outletId}`).then(setRoster).catch((e) => setErr((e as Error).message));
    api.get<AttSummary>(`/attendance/summary?from=${from}&to=${to}`).then(setActual).catch(() => {});
  }, [outletId, from, to]);
  useEffect(loadRoster, [loadRoster]);

  function cellEntry(employeeId: string, date: string) {
    return roster.find((r) => r.employeeId === employeeId && r.date.slice(0, 10) === date);
  }
  function actualFor(employeeId: string, date: string) {
    return actual.find((a) => a.employeeId === employeeId)?.days.find((d) => d.date === date);
  }

  function openAssign(employeeId: string, date: string) {
    setAssignForm({ shiftTemplateId: '', startTime: '09:00', endTime: '17:00', notes: '' });
    setAssignModal({ employeeId, date });
  }
  function pickTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    setAssignForm((f) => ({ ...f, shiftTemplateId: id, startTime: t?.startTime ?? f.startTime, endTime: t?.endTime ?? f.endTime }));
  }
  async function saveAssign(ev: React.FormEvent) {
    ev.preventDefault();
    if (!assignModal) return;
    try {
      await api.post('/hr/roster', {
        employeeId: assignModal.employeeId, outletId, date: assignModal.date,
        startTime: assignForm.startTime, endTime: assignForm.endTime,
        shiftTemplateId: assignForm.shiftTemplateId || undefined, notes: assignForm.notes || undefined,
      });
      setAssignModal(null);
      loadRoster();
    } catch (e) { notify((e as Error).message, 'error'); }
  }
  async function removeEntry(r: RosterEntry) {
    if (!(await confirmDialog('Remove this roster entry?', { danger: true, confirmLabel: 'Remove' }))) return;
    try { await api.delete(`/hr/roster/${r.id}`); loadRoster(); } catch (e) { notify((e as Error).message, 'error'); }
  }

  function openTplCreate() { setTplForm({ ...blankTemplate, outletId }); setTplModal(true); }
  function openTplEdit(t: ShiftTemplate) { setTplForm({ id: t.id, name: t.name, startTime: t.startTime, endTime: t.endTime, outletId: t.outletId ?? '', color: t.color ?? '#6366f1' }); setTplModal(true); }
  async function saveTpl(ev: React.FormEvent) {
    ev.preventDefault();
    try {
      const payload = { name: tplForm.name, startTime: tplForm.startTime, endTime: tplForm.endTime, outletId: tplForm.outletId || null, color: tplForm.color };
      if (tplForm.id) await api.patch(`/hr/shift-templates/${tplForm.id}`, payload);
      else await api.post('/hr/shift-templates', payload);
      setTplModal(false);
      api.get<ShiftTemplate[]>('/hr/shift-templates').then(setTemplates);
    } catch (e) { notify((e as Error).message, 'error'); }
  }
  async function removeTpl(t: ShiftTemplate) {
    if (!(await confirmDialog(`Delete shift template "${t.name}"?`, { danger: true, confirmLabel: 'Delete' }))) return;
    try { await api.delete(`/hr/shift-templates/${t.id}`); api.get<ShiftTemplate[]>('/hr/shift-templates').then(setTemplates); } catch (e) { notify((e as Error).message, 'error'); }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Shift Scheduling</h1>
          <p className="text-sm text-slate-500">Weekly roster and reusable shift templates</p>
        </div>
        {outlets.length > 1 && (
          <select className="input w-auto" value={outletId} onChange={(e) => setOutletId(e.target.value)} aria-label="Outlet">
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`badge px-3 py-1.5 ${tab === t ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{t}</button>
        ))}
      </div>

      {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      {tab === 'Weekly Roster' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() - 7); return d; })}>← Prev week</button>
              <button className="btn-ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
              <button className="btn-ghost" onClick={() => setWeekStart((w) => { const d = new Date(w); d.setDate(d.getDate() + 7); return d; })}>Next week →</button>
            </div>
            <span className="text-sm text-slate-500">{from} → {to}</span>
          </div>

          {!outletId ? <p className="py-8 text-center text-sm text-slate-400">Select an outlet.</p> : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="sticky left-0 z-10 bg-white p-3">Employee</th>
                    {days.map((d) => <th key={d.toISOString()} className="min-w-[130px] p-3">{d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {employees.filter((e) => e.isActive !== false).map((emp) => (
                    <tr key={emp.id}>
                      <td className="sticky left-0 z-10 bg-white p-3 font-medium text-slate-700">{emp.name}</td>
                      {days.map((d) => {
                        const date = toDateKey(d);
                        const entry = cellEntry(emp.id, date);
                        const act = actualFor(emp.id, date);
                        return (
                          <td key={date} className="p-2 align-top">
                            {entry ? (
                              <div className="group relative rounded-lg border border-slate-200 p-2 text-xs" style={{ borderLeftColor: entry.shiftTemplate?.color ?? '#6366f1', borderLeftWidth: 3 }}>
                                <div className="font-medium text-slate-700">{entry.startTime}–{entry.endTime}</div>
                                {entry.shiftTemplate && <div className="text-slate-400">{entry.shiftTemplate.name}</div>}
                                {act ? (
                                  <div className="mt-1 text-[11px] text-emerald-600">Actual: {fmtHm(act.firstIn)}–{fmtHm(act.lastOut)}</div>
                                ) : (
                                  new Date(date) < new Date(toDateKey(new Date())) && <div className="mt-1 text-[11px] text-red-500">No punch</div>
                                )}
                                <button onClick={() => removeEntry(entry)} className="absolute right-1 top-1 hidden text-slate-300 hover:text-red-600 group-hover:block">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => openAssign(emp.id, date)} className="flex h-14 w-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-300 hover:border-brand-400 hover:text-brand-500">+</button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'Shift Templates' && (
        <div className="space-y-3">
          <div className="flex justify-end"><button className="btn-primary" onClick={openTplCreate}>+ Shift template</button></div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400"><th className="p-3">Name</th><th className="p-3">Hours</th><th className="p-3">Outlet</th><th className="p-3" /></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td className="p-3 font-medium text-slate-700"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color ?? '#6366f1' }} />{t.name}{!t.isActive && <span className="ml-2 badge bg-slate-100 text-slate-400">Inactive</span>}</td>
                    <td className="p-3 tabular-nums">{t.startTime}–{t.endTime}</td>
                    <td className="p-3 text-slate-500">{outlets.find((o) => o.id === t.outletId)?.name ?? 'All outlets'}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => openTplEdit(t)} className="px-1 text-slate-400 hover:text-slate-600">✏️</button>
                      <button onClick={() => removeTpl(t)} className="px-1 text-slate-400 hover:text-red-600">🗑</button>
                    </td>
                  </tr>
                ))}
                {templates.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">No shift templates yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!assignModal} title="Assign shift" onClose={() => setAssignModal(null)}>
        <form onSubmit={saveAssign} className="space-y-3">
          <p className="text-sm text-slate-500">{assignModal && employees.find((e) => e.id === assignModal.employeeId)?.name} — {assignModal?.date}</p>
          <div><label className="label">Shift template (optional)</label>
            <select className="input" value={assignForm.shiftTemplateId} onChange={(e) => pickTemplate(e.target.value)}>
              <option value="">— custom hours —</option>
              {templates.filter((t) => t.isActive).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.startTime}–{t.endTime})</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Start</label><input type="time" className="input" value={assignForm.startTime} onChange={(e) => setAssignForm({ ...assignForm, startTime: e.target.value })} required /></div>
            <div><label className="label">End</label><input type="time" className="input" value={assignForm.endTime} onChange={(e) => setAssignForm({ ...assignForm, endTime: e.target.value })} required /></div>
          </div>
          <div><label className="label">Notes (optional)</label><input className="input" value={assignForm.notes} onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setAssignModal(null)}>Cancel</button>
            <button type="submit" className="btn-primary">Assign</button>
          </div>
        </form>
      </Modal>

      <Modal open={tplModal} title={tplForm.id ? 'Edit shift template' : 'New shift template'} onClose={() => setTplModal(false)}>
        <form onSubmit={saveTpl} className="space-y-3">
          <div><label className="label">Name</label><input className="input" value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} required autoFocus placeholder="e.g. Morning" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Start</label><input type="time" className="input" value={tplForm.startTime} onChange={(e) => setTplForm({ ...tplForm, startTime: e.target.value })} required /></div>
            <div><label className="label">End</label><input type="time" className="input" value={tplForm.endTime} onChange={(e) => setTplForm({ ...tplForm, endTime: e.target.value })} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Outlet (optional)</label>
              <select className="input" value={tplForm.outletId} onChange={(e) => setTplForm({ ...tplForm, outletId: e.target.value })}>
                <option value="">All outlets</option>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select></div>
            <div><label className="label">Color</label><input type="color" className="input h-10" value={tplForm.color} onChange={(e) => setTplForm({ ...tplForm, color: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setTplModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

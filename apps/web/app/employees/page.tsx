'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Employee, StaffRole } from '@/lib/types';
import Modal from '@/components/Modal';

const ROLES: StaffRole[] = ['ADMIN', 'MANAGER', 'CASHIER', 'BARISTA', 'WAITER'];
type PermKey = 'canVoid' | 'canDiscount' | 'canManageInventory' | 'canViewReports' | 'canManageStaff';
const PERMS: { key: PermKey; label: string }[] = [
  { key: 'canVoid', label: 'Void / refund orders' },
  { key: 'canDiscount', label: 'Apply discounts' },
  { key: 'canManageInventory', label: 'Manage inventory' },
  { key: 'canViewReports', label: 'View reports' },
  { key: 'canManageStaff', label: 'Manage staff' },
];

interface ActiveShift {
  shiftId: string;
  employeeId: string;
  name: string;
  role: string;
  clockIn: string;
}

const blank = {
  id: '',
  name: '',
  role: 'CASHIER' as StaffRole,
  username: '',
  password: '',
  deviceUserId: '',
  monthlySalary: '',
  canVoid: false,
  canDiscount: false,
  canManageInventory: false,
  canViewReports: false,
  canManageStaff: false,
};

export default function EmployeesPage() {
  const [emps, setEmps] = useState<Employee[]>([]);
  const [active, setActive] = useState<ActiveShift[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<typeof blank>(blank);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [e, a] = await Promise.all([
        api.get<Employee[]>('/employees'),
        api.get<ActiveShift[]>('/employees/active-shifts'),
      ]);
      setEmps(e);
      setActive(a);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  function openCreate() {
    setForm(blank);
    setModal(true);
  }
  function openEdit(e: Employee) {
    setForm({ ...blank, ...e, username: e.username ?? '', password: '', deviceUserId: (e as any).deviceUserId ?? '', monthlySalary: (e as any).monthlySalaryCents ? String((e as any).monthlySalaryCents / 100) : '' });
    setModal(true);
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        role: form.role,
        canVoid: form.canVoid,
        canDiscount: form.canDiscount,
        canManageInventory: form.canManageInventory,
        canViewReports: form.canViewReports,
        canManageStaff: form.canManageStaff,
      };
      if (form.username.trim()) payload.username = form.username.trim();
      payload.deviceUserId = form.deviceUserId.trim() || undefined;
      payload.monthlySalaryCents = Math.round((parseFloat(form.monthlySalary) || 0) * 100);
      if (form.password) payload.password = form.password;
      if (form.id) {
        await api.patch(`/employees/${form.id}`, payload);
      } else {
        if (!form.username.trim() || !form.password) throw new Error('Username and password are required');
        await api.post('/employees', payload);
      }
      setModal(false);
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function clock(e: Employee, dir: 'in' | 'out') {
    try {
      await api.post(`/employees/${e.id}/clock-${dir}`, {});
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }
  async function remove(e: Employee) {
    if (!confirm(`Deactivate ${e.name}?`)) return;
    await api.delete(`/employees/${e.id}`);
    load();
  }

  const isOn = (id: string) => active.some((a) => a.employeeId === id);
  const elapsed = (iso: string) => {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  };

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
          <p className="text-sm text-slate-500">Roles, permissions &amp; shift clocking</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Employee</button>
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error} — is the API running on port 4000?</div>}

      {active.length > 0 && (
        <div className="mb-6 card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">On the floor now ({active.length})</h2>
          <div className="flex flex-wrap gap-2">
            {active.map((a) => (
              <span key={a.shiftId} className="badge bg-green-100 text-green-700">● {a.name} · {elapsed(a.clockIn)}</span>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="p-3 font-semibold">Name</th>
              <th className="p-3 font-semibold">Role</th>
              <th className="p-3 font-semibold">Permissions</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {emps.map((e) => (
              <tr key={e.id}>
                <td className="p-3 font-medium text-slate-700">{e.name}</td>
                <td className="p-3"><span className="badge bg-slate-100 text-slate-600">{e.role}</span></td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {PERMS.filter((p) => e[p.key]).map((p) => (
                      <span key={p.key} className="badge bg-brand-50 text-brand-600 text-[10px]">{p.label}</span>
                    ))}
                    {PERMS.every((p) => !e[p.key]) && <span className="text-xs text-slate-300">—</span>}
                  </div>
                </td>
                <td className="p-3">
                  {isOn(e.id) ? <span className="badge bg-green-100 text-green-700">Clocked in</span> : <span className="badge bg-slate-100 text-slate-400">Off</span>}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    {isOn(e.id)
                      ? <button className="rounded-md px-2 py-1 text-xs text-amber-600 hover:bg-amber-50" onClick={() => clock(e, 'out')}>Clock out</button>
                      : <button className="rounded-md px-2 py-1 text-xs text-green-600 hover:bg-green-50" onClick={() => clock(e, 'in')}>Clock in</button>}
                    <button className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100" onClick={() => openEdit(e)}>Edit</button>
                    <button className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50" onClick={() => remove(e)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} title={form.id ? 'Edit employee' : 'New employee'} onClose={() => setModal(false)}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Username</label>
              <input className="input" autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. ram" required={!form.id} />
            </div>
            <div>
              <label className="label">Password{form.id && ' — blank to keep'}</label>
              <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••" required={!form.id} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fingerprint device ID</label>
              <input className="input" value={form.deviceUserId} onChange={(e) => setForm({ ...form, deviceUserId: e.target.value })} placeholder="ZKTeco user ID e.g. 7" />
            </div>
            <div>
              <label className="label">Monthly salary (Rs)</label>
              <input className="input" inputMode="decimal" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} placeholder="25000" />
            </div>
          </div>
          <div>
            <label className="label">Permissions</label>
            <div className="space-y-2">
              {PERMS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={!!form[p.key]} onChange={(e) => setForm({ ...form, [p.key]: e.target.checked })} />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

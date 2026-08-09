'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Employee, Outlet, Role } from '@/lib/types';
import Modal from '@/components/Modal';
import { confirmDialog, notify } from '@/lib/dialog';

interface PermissionCatalogEntry { key: string; label: string; module: string }

interface ActiveShift {
  shiftId: string;
  employeeId: string;
  name: string;
  role: string;
  clockIn: string;
}

function myPermissions(): string[] {
  try { return JSON.parse(localStorage.getItem('cakezake-emp') ?? '{}').permissions ?? []; } catch { return []; }
}

const blank = {
  id: '',
  name: '',
  roleId: '',
  username: '',
  password: '',
  deviceUserId: '',
  monthlySalary: '',
  outletIds: [] as string[], // multi-outlet (Phase 3); empty = unrestricted
};

export default function EmployeesPage() {
  const [emps, setEmps] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[]>([]);
  const [active, setActive] = useState<ActiveShift[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<typeof blank>(blank);
  const [saving, setSaving] = useState(false);

  const labelFor = (key: string) => catalog.find((c) => c.key === key)?.label ?? key;

  async function load(silent = false) {
    try {
      const [e, a, r] = await Promise.all([
        api.get<Employee[]>('/employees', { silent }),
        api.get<ActiveShift[]>('/employees/active-shifts', { silent }),
        api.get<Role[]>('/roles', { silent }),
      ]);
      setEmps(e);
      setActive(a);
      setRoles(r);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    api.get<PermissionCatalogEntry[]>('/roles/permissions-catalog').then(setCatalog).catch(() => {});
    api.get<Outlet[]>('/outlets').then(setOutlets).catch(() => {});
    const t = setInterval(() => load(true), 15000);
    return () => clearInterval(t);
  }, []);

  function openCreate() {
    setForm({ ...blank, roleId: roles.find((r) => !r.isProtected)?.id ?? roles[0]?.id ?? '' });
    setModal(true);
  }
  function openEdit(e: Employee) {
    setForm({
      ...blank, id: e.id, name: e.name, roleId: e.roleId, username: e.username ?? '', password: '',
      deviceUserId: (e as any).deviceUserId ?? '', monthlySalary: (e as any).monthlySalaryCents ? String((e as any).monthlySalaryCents / 100) : '',
      outletIds: (e.outlets ?? []).map((o) => o.id),
    });
    setModal(true);
  }
  function toggleOutlet(id: string) {
    setForm((f) => ({ ...f, outletIds: f.outletIds.includes(id) ? f.outletIds.filter((x) => x !== id) : [...f.outletIds, id] }));
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    try {
      if (!form.roleId) throw new Error('Choose a role');
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        roleId: form.roleId,
      };
      if (form.username.trim()) payload.username = form.username.trim();
      payload.deviceUserId = form.deviceUserId.trim() || undefined;
      payload.monthlySalaryCents = Math.round((parseFloat(form.monthlySalary) || 0) * 100);
      if (form.password) payload.password = form.password;
      let id = form.id;
      if (id) {
        await api.patch(`/employees/${id}`, payload);
      } else {
        if (!form.username.trim() || !form.password) throw new Error('Username and password are required');
        const created = await api.post<Employee>('/employees', payload);
        id = created.id;
      }
      if (outlets.length > 1 && myPermissions().includes('outlets.manage')) await api.patch(`/employees/${id}/outlets`, { outletIds: form.outletIds });
      setModal(false);
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function clock(e: Employee, dir: 'in' | 'out') {
    try {
      await api.post(`/employees/${e.id}/clock-${dir}`, {});
      load();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }
  async function remove(e: Employee) {
    if (!(await confirmDialog(`Deactivate ${e.name}?`, { danger: true, confirmLabel: 'Deactivate' }))) return;
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
                    {(e.permissions ?? []).map((key) => (
                      <span key={key} className="badge bg-brand-50 text-brand-600 text-[10px]">{labelFor(key)}</span>
                    ))}
                    {(!e.permissions || e.permissions.length === 0) && <span className="text-xs text-slate-300">—</span>}
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
              <select className="input" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} required>
                <option value="" disabled>Choose a role…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Manage what each role can do on the <a href="/roles" className="underline">Roles &amp; Permissions</a> page.
              </p>
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
          {outlets.length > 1 && myPermissions().includes('outlets.manage') && (
            <div>
              <label className="label">Outlets (blank = any outlet)</label>
              <div className="space-y-1 rounded-lg border border-slate-100 p-3 dark:border-slate-700">
                {outlets.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={form.outletIds.includes(o.id)} onChange={() => toggleOutlet(o.id)} />
                    {o.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

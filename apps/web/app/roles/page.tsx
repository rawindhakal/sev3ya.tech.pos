'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Role, RolePortal } from '@/lib/types';
import Modal from '@/components/Modal';
import { confirmDialog, notify } from '@/lib/dialog';

interface PermissionCatalogEntry { key: string; label: string; module: string }

const blank = {
  id: '',
  name: '',
  description: '',
  portal: 'BACK_OFFICE' as RolePortal,
  permissionKeys: [] as string[],
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<typeof blank>(blank);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [r, c] = await Promise.all([
        api.get<Role[]>('/roles'),
        api.get<PermissionCatalogEntry[]>('/roles/permissions-catalog'),
      ]);
      setRoles(r);
      setCatalog(c);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const g = new Map<string, PermissionCatalogEntry[]>();
    for (const c of catalog) g.set(c.module, [...(g.get(c.module) ?? []), c]);
    return [...g.entries()];
  }, [catalog]);

  function openCreate() {
    setForm(blank);
    setModal(true);
  }
  function openEdit(r: Role) {
    if (r.isProtected) return;
    setForm({ id: r.id, name: r.name, description: r.description ?? '', portal: r.portal, permissionKeys: [...r.permissions] });
    setModal(true);
  }

  function togglePerm(key: string) {
    setForm((f) => ({
      ...f,
      permissionKeys: f.permissionKeys.includes(key) ? f.permissionKeys.filter((k) => k !== key) : [...f.permissionKeys, key],
    }));
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        portal: form.portal,
        permissionKeys: form.permissionKeys,
      };
      if (form.id) await api.patch(`/roles/${form.id}`, payload);
      else await api.post('/roles', payload);
      setModal(false);
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: Role) {
    if (r.isProtected) return;
    if (r.employeeCount) {
      notify(`Reassign ${r.employeeCount} employee(s) to a different role before deleting "${r.name}"`, 'error');
      return;
    }
    if (!(await confirmDialog(`Delete role "${r.name}"?`, { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await api.delete(`/roles/${r.id}`);
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Roles &amp; Permissions</h1>
          <p className="text-sm text-slate-500">Define custom roles and exactly what each one can access</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Role</button>
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="p-3 font-semibold">Role</th>
              <th className="p-3 font-semibold">Portal</th>
              <th className="p-3 font-semibold">Employees</th>
              <th className="p-3 font-semibold">Permissions</th>
              <th className="p-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {roles.map((r) => (
              <tr key={r.id}>
                <td className="p-3 font-medium text-slate-700">
                  {r.isProtected && <span title="Protected — cannot be edited or deleted">🔒 </span>}
                  {r.name}
                  {r.description && <div className="text-xs font-normal text-slate-400">{r.description}</div>}
                </td>
                <td className="p-3">
                  <span className="badge bg-slate-100 text-slate-600">{r.portal === 'WAITER_ONLY' ? 'Waiter Panel only' : 'Back office'}</span>
                </td>
                <td className="p-3 text-slate-600">{r.employeeCount ?? 0}</td>
                <td className="p-3 text-slate-600">{r.permissions.length}</td>
                <td className="p-3">
                  {!r.isProtected && (
                    <div className="flex justify-end gap-1">
                      <button className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100" onClick={() => openEdit(r)}>Edit</button>
                      <button className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50" onClick={() => remove(r)}>✕</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} title={form.id ? 'Edit role' : 'New role'} onClose={() => setModal(false)}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
            </div>
            <div>
              <label className="label">Portal</label>
              <select className="input" value={form.portal} onChange={(e) => setForm({ ...form, portal: e.target.value as RolePortal })}>
                <option value="BACK_OFFICE">Back office</option>
                <option value="WAITER_ONLY">Waiter Panel only</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Description (optional)</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Handles accounting entries only" />
          </div>
          <div>
            <label className="label">Permissions</label>
            <div className="max-h-80 space-y-4 overflow-y-auto rounded-lg border border-slate-100 p-3 dark:border-slate-700">
              {grouped.map(([module, perms]) => (
                <div key={module}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{module}</div>
                  <div className="space-y-1">
                    {perms.map((p) => (
                      <label key={p.key} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <input type="checkbox" checked={form.permissionKeys.includes(p.key)} onChange={() => togglePerm(p.key)} />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
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

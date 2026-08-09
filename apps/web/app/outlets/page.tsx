'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Outlet } from '@/lib/types';
import Modal from '@/components/Modal';
import { confirmDialog, promptDialog, notify } from '@/lib/dialog';

const blank = {
  id: '', name: '', address: '', phone: '', taxId: '', receiptHeader: '', receiptFooter: '', isActive: true,
};

export default function OutletsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<typeof blank>(blank);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setOutlets(await api.get<Outlet[]>('/outlets'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm(blank);
    setModal(true);
  }
  function openEdit(o: Outlet) {
    setForm({
      id: o.id, name: o.name, address: o.address ?? '', phone: o.phone ?? '', taxId: o.taxId ?? '',
      receiptHeader: o.receiptHeader ?? '', receiptFooter: o.receiptFooter ?? '', isActive: o.isActive,
    });
    setModal(true);
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        taxId: form.taxId.trim() || undefined,
        receiptHeader: form.receiptHeader.trim() || undefined,
        receiptFooter: form.receiptFooter.trim() || undefined,
        ...(form.id ? { isActive: form.isActive } : {}),
      };
      if (form.id) await api.patch(`/outlets/${form.id}`, payload);
      else await api.post('/outlets', payload);
      setModal(false);
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(o: Outlet) {
    if (!(await confirmDialog(`Delete outlet "${o.name}"?${o._count?.orders || o._count?.tables ? ' It has history, so it will be deactivated instead.' : ''}`, { danger: true, confirmLabel: 'Delete' }))) return;
    try { await api.delete(`/outlets/${o.id}`); load(); } catch (e) { notify((e as Error).message, 'error'); }
  }

  async function addTerminal(o: Outlet) {
    const name = await promptDialog('Terminal name:', '', { title: `New terminal — ${o.name}` });
    if (!name?.trim()) return;
    try { await api.post(`/outlets/${o.id}/terminals`, { name: name.trim() }); load(); } catch (e) { notify((e as Error).message, 'error'); }
  }
  async function renameTerminal(t: { id: string; name: string }) {
    const name = await promptDialog('Rename terminal:', t.name, { title: 'Rename terminal' });
    if (!name?.trim()) return;
    try { await api.patch(`/terminals/${t.id}`, { name: name.trim() }); load(); } catch (e) { notify((e as Error).message, 'error'); }
  }
  async function removeTerminal(t: { id: string; name: string }) {
    if (!(await confirmDialog(`Remove terminal "${t.name}"?`, { danger: true, confirmLabel: 'Remove' }))) return;
    try { await api.delete(`/terminals/${t.id}`); load(); } catch (e) { notify((e as Error).message, 'error'); }
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Outlets &amp; Terminals</h1>
          <p className="text-sm text-slate-500">Physical locations this restaurant operates, and the tills at each one</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Outlet</button>
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {outlets.length <= 1 && !error && (
        <p className="mb-4 text-xs text-slate-400">A single outlet needs no setup — add a second one here once this restaurant opens another branch, and staff will be asked which outlet a till belongs to at their next sign-in.</p>
      )}

      <div className="space-y-3">
        {outlets.map((o) => (
          <div key={o.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">{o.name}</span>
                  {o.isDefault && <span className="badge bg-indigo-50 text-indigo-600">Default</span>}
                  {!o.isActive && <span className="badge bg-slate-100 text-slate-400">Inactive</span>}
                </div>
                <p className="text-xs text-slate-400">
                  {[o.address, o.phone, o.taxId ? `PAN ${o.taxId}` : null].filter(Boolean).join(' · ') || 'No address/contact set'}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost text-xs" onClick={() => openEdit(o)}>Edit</button>
                {!o.isDefault && <button className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50" onClick={() => remove(o)}>Delete</button>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Terminals</span>
              {(o.terminals ?? []).map((t) => (
                <span key={t.id} className={`badge flex items-center gap-1 ${t.isActive ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-300'}`}>
                  {t.name}
                  <button title="Rename" onClick={() => renameTerminal(t)} className="text-slate-400 hover:text-slate-600">✏️</button>
                  <button title="Remove" onClick={() => removeTerminal(t)} className="text-slate-400 hover:text-red-600">✕</button>
                </span>
              ))}
              <button className="badge border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50" onClick={() => addTerminal(o)}>+ Terminal</button>
            </div>
          </div>
        ))}
        {outlets.length === 0 && !error && <p className="text-sm text-slate-400">Loading…</p>}
      </div>

      <Modal open={modal} title={form.id ? 'Edit outlet' : 'New outlet'} onClose={() => setModal(false)}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus placeholder="e.g. CakeZake — Baneshwor" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">PAN / Tax ID</label>
              <input className="input" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Receipt header (optional)</label>
              <input className="input" value={form.receiptHeader} onChange={(e) => setForm({ ...form, receiptHeader: e.target.value })} placeholder="Falls back to the tenant default" />
            </div>
            <div>
              <label className="label">Receipt footer (optional)</label>
              <input className="input" value={form.receiptFooter} onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })} placeholder="Falls back to the tenant default" />
            </div>
          </div>
          {form.id && (
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active
            </label>
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

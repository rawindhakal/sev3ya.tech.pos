'use client';

import { useEffect, useState } from 'react';
import { api, formatMoney, dollarsToCents } from '@/lib/api';
import type { ModifierGroup } from '@/lib/types';
import Modal from '@/components/Modal';

export default function ModifiersPage() {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [groupModal, setGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', minSelect: 0, maxSelect: 1 });

  const [modForFor, setModForFor] = useState<string | null>(null);
  const [modForm, setModForm] = useState({ name: '', priceDollars: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setGroups(await api.get<ModifierGroup[]>('/modifier-groups'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/modifier-groups', {
        name: groupForm.name.trim(),
        minSelect: Number(groupForm.minSelect),
        maxSelect: Number(groupForm.maxSelect),
      });
      setGroupForm({ name: '', minSelect: 0, maxSelect: 1 });
      setGroupModal(false);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addModifier(e: React.FormEvent) {
    e.preventDefault();
    if (!modForFor) return;
    setSaving(true);
    try {
      await api.post(`/modifier-groups/${modForFor}/modifiers`, {
        name: modForm.name.trim(),
        priceCents: dollarsToCents(parseFloat(modForm.priceDollars || '0')),
      });
      setModForm({ name: '', priceDollars: '' });
      setModForFor(null);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteModifier(id: string) {
    if (!confirm('Delete this option?')) return;
    try {
      await api.delete(`/modifier-groups/modifiers/${id}`);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm('Delete this whole group and its options?')) return;
    try {
      await api.delete(`/modifier-groups/${id}`);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Modifiers</h1>
          <p className="text-sm text-slate-500">
            Option groups (Size, Add-ons…) you can attach to menu items
          </p>
        </div>
        <button className="btn-primary" onClick={() => setGroupModal(true)}>
          + Group
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error} — is the API running on port 4000?
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">No modifier groups yet.</div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.id} className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{g.name}</h3>
                  <span className="text-xs text-slate-400">
                    Select {g.minSelect}–{g.maxSelect}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs"
                    onClick={() => setModForFor(g.id)}
                  >
                    + Option
                  </button>
                  <button
                    className="btn-danger px-3 py-1.5 text-xs"
                    onClick={() => deleteGroup(g.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {g.modifiers.length === 0 ? (
                  <span className="text-xs text-slate-400">No options yet</span>
                ) : (
                  g.modifiers.map((m) => (
                    <span
                      key={m.id}
                      className="badge group gap-1.5 bg-slate-100 py-1 text-slate-700"
                    >
                      {m.name}
                      {m.priceCents > 0 && (
                        <span className="text-brand-600">+{formatMoney(m.priceCents)}</span>
                      )}
                      <button
                        onClick={() => deleteModifier(m.id)}
                        className="ml-1 text-slate-400 hover:text-red-500"
                      >
                        ✕
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New group modal */}
      <Modal open={groupModal} title="New modifier group" onClose={() => setGroupModal(false)}>
        <form onSubmit={createGroup} className="space-y-4">
          <div>
            <label className="label">Group name</label>
            <input
              className="input"
              value={groupForm.name}
              onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
              placeholder="e.g. Size"
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Min select</label>
              <input
                className="input"
                type="number"
                min="0"
                value={groupForm.minSelect}
                onChange={(e) => setGroupForm({ ...groupForm, minSelect: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Max select</label>
              <input
                className="input"
                type="number"
                min="1"
                value={groupForm.maxSelect}
                onChange={(e) => setGroupForm({ ...groupForm, maxSelect: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setGroupModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add option modal */}
      <Modal open={!!modForFor} title="Add option" onClose={() => setModForFor(null)}>
        <form onSubmit={addModifier} className="space-y-4">
          <div>
            <label className="label">Option name</label>
            <input
              className="input"
              value={modForm.name}
              onChange={(e) => setModForm({ ...modForm, name: e.target.value })}
              placeholder="e.g. Large"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Extra price (Rs)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={modForm.priceDollars}
              onChange={(e) => setModForm({ ...modForm, priceDollars: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setModForFor(null)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

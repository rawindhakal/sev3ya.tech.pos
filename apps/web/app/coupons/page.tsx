'use client';

import { useEffect, useState } from 'react';
import { api, formatMoney, dollarsToCents } from '@/lib/api';
import type { Coupon } from '@/lib/types';
import { confirmDialog, notify } from '@/lib/dialog';
import FeatureGate from '@/components/FeatureGate';

const emptyForm = { code: '', type: 'PCT' as 'PCT' | 'RS', value: '', minOrderRs: '', maxUsesTotal: '', maxUsesPerCustomer: '', expiresAt: '' };

function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setCoupons(await api.get<Coupon[]>('/promotions/coupons'));
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.value) return;
    setSaving(true);
    try {
      await api.post('/promotions/coupons', {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: form.type === 'PCT' ? Math.round(parseFloat(form.value)) : dollarsToCents(parseFloat(form.value)),
        minOrderCents: form.minOrderRs ? dollarsToCents(parseFloat(form.minOrderRs)) : undefined,
        maxUsesTotal: form.maxUsesTotal ? parseInt(form.maxUsesTotal) : undefined,
        maxUsesPerCustomer: form.maxUsesPerCustomer ? parseInt(form.maxUsesPerCustomer) : undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      });
      setForm(emptyForm);
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: Coupon) {
    setCoupons((prev) => prev.map((x) => (x.id === c.id ? { ...x, isActive: !x.isActive } : x)));
    try {
      await api.patch(`/promotions/coupons/${c.id}`, { isActive: !c.isActive });
    } catch (e) {
      notify((e as Error).message, 'error');
      load();
    }
  }

  async function remove(c: Coupon) {
    if (!(await confirmDialog(`Delete coupon "${c.code}"?`, { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await api.delete(`/promotions/coupons/${c.id}`);
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Coupons</h1>
        <p className="text-sm text-slate-500">Rule-based promo codes — usable at the POS or on the QR self-order page</p>
      </header>

      <div className="card mb-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="p-3 font-semibold">Code</th>
              <th className="p-3 font-semibold">Discount</th>
              <th className="p-3 font-semibold">Min order</th>
              <th className="p-3 font-semibold">Uses</th>
              <th className="p-3 font-semibold">Expires</th>
              <th className="p-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {coupons.map((c) => (
              <tr key={c.id} className={!c.isActive ? 'opacity-50' : ''}>
                <td className="p-3 font-mono font-semibold text-slate-800">{c.code}</td>
                <td className="p-3 text-slate-600">{c.type === 'PCT' ? `${c.value}%` : formatMoney(c.value)}</td>
                <td className="p-3 text-slate-500">{c.minOrderCents > 0 ? formatMoney(c.minOrderCents) : '—'}</td>
                <td className="p-3 text-slate-500">{c.usedCount}{c.maxUsesTotal ? ` / ${c.maxUsesTotal}` : ''}</td>
                <td className="p-3 text-slate-500">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : '—'}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <button className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100" onClick={() => toggleActive(c)}>
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50" onClick={() => remove(c)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && coupons.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">No coupons yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">New coupon</h2>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Code</label>
            <input className="input font-mono uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="WELCOME10" required />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'PCT' | 'RS' })}>
              <option value="PCT">Percent (%)</option>
              <option value="RS">Fixed (Rs)</option>
            </select>
          </div>
          <div>
            <label className="label">Value</label>
            <input className="input" type="number" min={0} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={form.type === 'PCT' ? '10' : '100'} required />
          </div>
          <div>
            <label className="label">Min order (Rs, optional)</label>
            <input className="input" type="number" min={0} value={form.minOrderRs} onChange={(e) => setForm({ ...form, minOrderRs: e.target.value })} />
          </div>
          <div>
            <label className="label">Max total uses (optional)</label>
            <input className="input" type="number" min={1} value={form.maxUsesTotal} onChange={(e) => setForm({ ...form, maxUsesTotal: e.target.value })} placeholder="Unlimited" />
          </div>
          <div>
            <label className="label">Max uses per customer (optional)</label>
            <input className="input" type="number" min={1} value={form.maxUsesPerCustomer} onChange={(e) => setForm({ ...form, maxUsesPerCustomer: e.target.value })} placeholder="Unlimited" />
          </div>
          <div>
            <label className="label">Expires (optional)</label>
            <input className="input" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </div>
          <div className="flex items-end sm:col-span-2">
            <button className="btn-primary" disabled={saving}>{saving ? 'Creating…' : '+ Create coupon'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}


export default function CouponsPageGated() {
  return (
    <FeatureGate feature="marketing">
      <CouponsPage />
    </FeatureGate>
  );
}

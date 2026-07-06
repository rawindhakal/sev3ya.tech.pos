'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Features, Settings } from '@/lib/types';

// UI feature key → backend column.
const FEATURES: { key: keyof Features; col: string; label: string }[] = [
  { key: 'reservations', col: 'featReservations', label: 'Reservations & waitlist' },
  { key: 'inventory', col: 'featInventory', label: 'Inventory & recipes' },
  { key: 'purchasing', col: 'featPurchasing', label: 'Purchasing & suppliers' },
  { key: 'roastery', col: 'featRoastery', label: 'Roastery' },
  { key: 'modifiers', col: 'featModifiers', label: 'Modifiers / item options' },
  { key: 'crm', col: 'featCrm', label: 'Customers (CRM & loyalty)' },
  { key: 'finance', col: 'featFinance', label: 'Finance & P&L' },
  { key: 'kds', col: 'featKds', label: 'Kitchen display (KDS)' },
];

export default function SettingsPage() {
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Settings>('/settings').then(setForm).catch((e) => setError((e as Error).message));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const updated = await api.patch<Settings>('/settings', {
        restaurantName: form.restaurantName,
        address: form.address,
        phone: form.phone,
        taxId: form.taxId,
        vatRate: form.vatRate,
        serviceChargeRate: form.serviceChargeRate,
        receiptHeader: form.receiptHeader,
        receiptFooter: form.receiptFooter,
        wifiPassword: form.wifiPassword,
      });
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleFeature(key: keyof Features, col: string) {
    if (!form?.features) return;
    const next = !form.features[key];
    setForm({ ...form, features: { ...form.features, [key]: next } });
    try {
      await api.patch('/settings', { [col]: next });
    } catch (e) {
      alert((e as Error).message);
      setForm({ ...form, features: { ...form.features, [key]: !next } });
    }
  }

  if (error) return <div className="p-8"><div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div></div>;
  if (!form) return <div className="p-8 text-sm text-slate-400">Loading…</div>;

  const set = (k: keyof Settings, v: string) => setForm({ ...form, [k]: v });

  return (
    <div className="mx-auto max-w-2xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Receipt branding &amp; outlet details</p>
      </header>

      <form onSubmit={save} className="card space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Restaurant name</label>
            <input className="input" value={form.restaurantName ?? ''} onChange={(e) => set('restaurantName', e.target.value)} required />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="01-4XXXXXX" />
          </div>
          <div>
            <label className="label">Tax ID (PAN/VAT)</label>
            <input className="input" value={form.taxId ?? ''} onChange={(e) => set('taxId', e.target.value)} placeholder="PAN 601234567" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <input className="input" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Thamel, Kathmandu" />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Receipt template</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Header line (above items)</label>
              <input className="input" value={form.receiptHeader ?? ''} onChange={(e) => set('receiptHeader', e.target.value)} placeholder="Welcome to CakeZake!" />
            </div>
            <div>
              <label className="label">Footer line (bottom of bill)</label>
              <input className="input" value={form.receiptFooter ?? ''} onChange={(e) => set('receiptFooter', e.target.value)} placeholder="Dhanyabad! Visit again 🙏" />
            </div>
            <div>
              <label className="label">WiFi password (printed on bill)</label>
              <input className="input" value={form.wifiPassword ?? ''} onChange={(e) => set('wifiPassword', e.target.value)} placeholder="cakezake123" />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Taxes &amp; charges</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">VAT rate (%)</label>
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={Math.round(form.vatRate * 1000) / 10}
                onChange={(e) => setForm({ ...form, vatRate: (parseFloat(e.target.value) || 0) / 100 })}
              />
            </div>
            <div>
              <label className="label">Service charge (%)</label>
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={Math.round(form.serviceChargeRate * 1000) / 10}
                onChange={(e) => setForm({ ...form, serviceChargeRate: (parseFloat(e.target.value) || 0) / 100 })}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Applied to every new order: service charge on the discounted subtotal, then VAT on top. Currency (<strong>{form.currency}</strong>) is set in <code>apps/api/.env</code>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && <span className="text-sm text-emerald-600">✓ Saved</span>}
        </div>
      </form>

      {/* Feature toggles — enable/disable whole modules app-wide */}
      {form.features && (
        <div className="card mt-6 p-6">
          <h2 className="mb-1 text-sm font-semibold text-slate-700">Modules</h2>
          <p className="mb-4 text-xs text-slate-400">Turn sections on or off. Disabled modules are hidden from the sidebar for everyone.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FEATURES.map((f) => {
              const on = form.features![f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggleFeature(f.key, f.col)}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-700">{f.label}</span>
                  <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? 'bg-brand-500' : 'bg-slate-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

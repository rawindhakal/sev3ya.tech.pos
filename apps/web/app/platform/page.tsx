'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney, tenantSlug } from '@/lib/api';

// Platform-owner console (SaaS control plane): tenants with their own
// isolated databases, subscription plans, and the manual payment gateway
// (cash at office / direct bank transfer). ADMIN-only, main domain only.

interface Plan { id: string; code: string; name: string; priceMonthlyCents: number; priceYearlyCents: number; maxEmployees: number; maxItems: number; features?: string[] | null }
interface Payment { id: string; amountCents: number; method: string; reference?: string | null; months: number; periodEnd: string; createdAt: string }
interface Tenant {
  id: string; slug: string; name: string; dbName: string; status: string;
  plan?: Plan | null; ownerName?: string | null; ownerPhone?: string | null;
  trialEndsAt?: string | null; paidUntil?: string | null; payments: Payment[]; createdAt: string;
}
interface Stats { tenants: number; active: number; trial: number; suspended: number; mrrCents: number; collectedThisMonthCents: number; collectedTotalCents: number }

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  TRIAL: 'bg-blue-100 text-blue-700',
  SUSPENDED: 'bg-red-100 text-red-600',
};

export default function PlatformPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [payFor, setPayFor] = useState<Tenant | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ name: '', slug: '', planCode: 'PRO', ownerName: '', ownerPhone: '', adminUsername: '', adminPassword: '', trialDays: 14 });
  const [pay, setPay] = useState({ amount: '', method: 'CASH', reference: '', months: 1, planCode: '', note: '' });

  const load = useCallback(async () => {
    try {
      const [s, t, p] = await Promise.all([
        api.get<Stats>('/platform/stats'),
        api.get<Tenant[]>('/platform/tenants'),
        api.get<Plan[]>('/platform/plans'),
      ]);
      setStats(s); setTenants(t); setPlans(p); setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const t = await api.post<Tenant & { loginHint: string }>('/platform/tenants', { ...form, trialDays: Number(form.trialDays) });
      alert(`Restaurant provisioned with its own database (${t.dbName}).\n${(t as any).loginHint}`);
      setCreateOpen(false);
      setForm({ name: '', slug: '', planCode: 'PRO', ownerName: '', ownerPhone: '', adminUsername: '', adminPassword: '', trialDays: 14 });
      load();
    } catch (er) { alert((er as Error).message); } finally { setBusy(false); }
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payFor) return;
    setBusy(true);
    try {
      await api.post('/platform/payments', {
        tenantId: payFor.id,
        amountCents: Math.round((parseFloat(pay.amount) || 0) * 100),
        method: pay.method, reference: pay.reference || undefined,
        months: Number(pay.months), planCode: pay.planCode || undefined, note: pay.note || undefined,
      });
      setPayFor(null);
      setPay({ amount: '', method: 'CASH', reference: '', months: 1, planCode: '', note: '' });
      load();
    } catch (er) { alert((er as Error).message); } finally { setBusy(false); }
  }

  async function setStatus(t: Tenant, status: string) {
    if (status === 'SUSPENDED' && !confirm(`Suspend ${t.name}? Their POS stops working immediately.`)) return;
    await api.post(`/platform/tenants/${t.id}/status`, { status });
    load();
  }

  if (tenantSlug()) {
    return <div className="p-10 text-center text-slate-400">The platform console is only available on the main s3vya domain.</div>;
  }

  const th = 'p-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400';
  const days = (d?: string | null) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 864e5) : null;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Console</h1>
          <p className="text-sm text-slate-500">Tenants · plans · subscription payments (cash / bank transfer)</p>
        </div>
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ New restaurant</button>
      </header>

      {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Restaurants', String(stats.tenants)], ['Active', String(stats.active)], ['On trial', String(stats.trial)],
            ['Suspended', String(stats.suspended)], ['MRR', formatMoney(stats.mrrCents)], ['Collected (month)', formatMoney(stats.collectedThisMonthCents)],
          ].map(([l, v]) => (
            <div key={l} className="card p-3"><div className="truncate text-lg font-bold text-slate-900">{v}</div><div className="text-xs text-slate-500">{l}</div></div>
          ))}
        </div>
      )}

      {/* Plans */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className="card p-4">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-bold text-slate-800">{p.name}</span>
              <span className="text-sm font-semibold text-brand-700">{formatMoney(p.priceMonthlyCents)}/mo</span>
            </div>
            <div className="mb-2 text-xs text-slate-400">up to {p.maxEmployees} staff · {p.maxItems} menu items · {formatMoney(p.priceYearlyCents)}/yr</div>
            <ul className="list-disc pl-4 text-xs text-slate-500">
              {(p.features ?? []).map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        ))}
      </div>

      {/* Tenants */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100">
            <th className={th}>Restaurant</th><th className={th}>Plan</th><th className={th}>Status</th>
            <th className={th}>Valid until</th><th className={th}>Owner</th><th className={`${th} text-right`}>Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-50">
            {tenants.map((t) => {
              const until = t.status === 'TRIAL' ? t.trialEndsAt : t.paidUntil;
              const d = days(until);
              return (
                <tr key={t.id}>
                  <td className="p-2.5">
                    <div className="font-medium text-slate-700">{t.name}</div>
                    <div className="font-mono text-xs text-slate-400">{t.slug}.s3vya.tech · {t.dbName}</div>
                  </td>
                  <td className="p-2.5">{t.plan ? <span className="badge bg-slate-100 text-slate-600">{t.plan.name}</span> : '—'}</td>
                  <td className="p-2.5"><span className={`badge ${STATUS_BADGE[t.status] ?? 'bg-slate-100'}`}>{t.status}</span></td>
                  <td className="p-2.5 text-slate-600">
                    {until ? new Date(until).toLocaleDateString() : '—'}
                    {d != null && <span className={`ml-1 text-xs ${d < 7 ? 'text-red-500' : 'text-slate-400'}`}>({d}d)</span>}
                  </td>
                  <td className="p-2.5 text-slate-500">{t.ownerName ?? '—'}{t.ownerPhone ? ` · ${t.ownerPhone}` : ''}</td>
                  <td className="p-2.5">
                    <div className="flex justify-end gap-1">
                      <button className="rounded-md px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50" onClick={() => { setPayFor(t); setPay((p) => ({ ...p, planCode: t.plan?.code ?? '', amount: t.plan ? String(t.plan.priceMonthlyCents / 100) : '' })); }}>💵 Payment</button>
                      {t.status !== 'SUSPENDED'
                        ? <button className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50" onClick={() => setStatus(t, 'SUSPENDED')}>Suspend</button>
                        : <button className="rounded-md px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50" onClick={() => setStatus(t, 'ACTIVE')}>Activate</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {tenants.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-400">No restaurants yet — provision the first one.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Create tenant modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCreateOpen(false)}>
          <form onSubmit={createTenant} className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-800">Provision new restaurant</h2>
            <p className="text-xs text-slate-400">Creates a fully isolated database, applies the schema, and seeds the owner&apos;s admin account.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Restaurant name</label>
                <input className="input" value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} /></div>
              <div><label className="label">Code / subdomain</label>
                <input className="input font-mono" value={form.slug} required onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="everest" /></div>
              <div><label className="label">Plan</label>
                <select className="input" value={form.planCode} onChange={(e) => setForm({ ...form, planCode: e.target.value })}>
                  {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select></div>
              <div><label className="label">Owner name</label>
                <input className="input" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} /></div>
              <div><label className="label">Owner phone</label>
                <input className="input" value={form.ownerPhone} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} /></div>
              <div><label className="label">Admin username</label>
                <input className="input" value={form.adminUsername} required autoComplete="off" onChange={(e) => setForm({ ...form, adminUsername: e.target.value })} /></div>
              <div><label className="label">Admin password</label>
                <input className="input" type="password" value={form.adminPassword} required autoComplete="new-password" onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} /></div>
              <div><label className="label">Trial days</label>
                <input className="input" type="number" min={0} max={90} value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>{busy ? 'Provisioning…' : 'Create restaurant'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Record payment modal */}
      {payFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPayFor(null)}>
          <form onSubmit={recordPayment} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-800">Record payment — {payFor.name}</h2>
            <p className="text-xs text-slate-400">Cash at office or direct bank transfer. Verifying extends validity immediately.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Amount (Rs)</label>
                <input className="input" inputMode="decimal" value={pay.amount} required onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
              <div><label className="label">Months</label>
                <input className="input" type="number" min={1} max={24} value={pay.months} onChange={(e) => setPay({ ...pay, months: Number(e.target.value) })} /></div>
              <div><label className="label">Method</label>
                <select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Direct bank transfer</option>
                </select></div>
              <div><label className="label">Plan</label>
                <select className="input" value={pay.planCode} onChange={(e) => setPay({ ...pay, planCode: e.target.value })}>
                  <option value="">Keep current</option>
                  {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select></div>
              {pay.method === 'BANK_TRANSFER' && (
                <div className="col-span-2"><label className="label">Bank txn reference (required)</label>
                  <input className="input" value={pay.reference} required onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="e.g. NIBL-2083-000123" /></div>
              )}
              <div className="col-span-2"><label className="label">Note</label>
                <input className="input" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setPayFor(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>{busy ? 'Recording…' : 'Verify & extend'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

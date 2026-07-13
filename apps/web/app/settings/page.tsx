'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Features, Settings } from '@/lib/types';
import Modal from '@/components/Modal';

// UI feature key → backend column.
const FEATURES: { key: keyof Features; col: string; label: string }[] = [
  { key: 'reservations', col: 'featReservations', label: 'Reservations & waitlist' },
  { key: 'inventory', col: 'featInventory', label: 'Inventory & recipes' },
  { key: 'purchasing', col: 'featPurchasing', label: 'Purchasing & suppliers' },
  { key: 'crm', col: 'featCrm', label: 'Customers (CRM & loyalty)' },
  { key: 'finance', col: 'featFinance', label: 'Finance & P&L' },
  { key: 'kds', col: 'featKds', label: 'Kitchen display (KDS)' },
];

export default function SettingsPage() {
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  // RestroX-style settings hub: left sub-nav, one section at a time.
  const [section, setSection] = useState<'details' | 'tax' | 'invoice' | 'ird' | 'modules' | 'desktop' | 'danger'>('details');

  async function resetData() {
    setResetting(true);
    setResetMsg(null);
    try {
      const r = await api.post<{ cleared: Record<string, number> }>('/settings/reset-data', {});
      const total = Object.values(r.cleared).reduce((a, b) => a + b, 0);
      setResetMsg(`Done — cleared ${total} records. Your menu, staff, tables & settings were kept.`);
      setResetOpen(false);
      setConfirmText('');
    } catch (e) {
      setResetMsg((e as Error).message || 'Reset failed — admin permission required.');
    } finally {
      setResetting(false);
    }
  }

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

  const NAV: { group: string; items: ({ id: typeof section; label: string } | { href: string; label: string })[] }[] = [
    {
      group: 'General Setting',
      items: [
        { id: 'details', label: 'Restaurant Details' },
        { id: 'modules', label: 'Modules' },
        { id: 'desktop', label: 'Desktop Application' },
        { href: '/employees', label: 'Users & Roles' },
        { href: '/reports', label: 'Activity Log' },
      ],
    },
    {
      group: 'Order Setting',
      items: [
        { id: 'tax', label: 'Tax & Charges' },
        { id: 'invoice', label: 'Invoice Setting' },
        { href: '/printing', label: 'KOT & Printer' },
        { id: 'ird', label: 'IRD Nepal (CBMS)' },
      ],
    },
    {
      group: 'Dangerous Area',
      items: [{ id: 'danger', label: 'Reset Restaurant' }],
    },
  ];

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Settings sub-navigation (RestroX-style) */}
      <aside className="w-full shrink-0 border-b border-slate-200 p-4 dark:border-slate-700 md:w-64 md:border-b-0 md:border-r">
        <h1 className="mb-4 text-lg font-bold text-slate-900">Settings</h1>
        {NAV.map((g) => (
          <div key={g.group} className="mb-4">
            <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${g.group === 'Dangerous Area' ? 'text-red-400' : 'text-slate-400'}`}>{g.group}</div>
            <div className="space-y-0.5">
              {g.items.map((it) =>
                'href' in it ? (
                  <a key={it.label} href={it.href} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700/50">
                    {it.label}
                    <svg className="h-3.5 w-3.5 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M7 7h10v10" /></svg>
                  </a>
                ) : (
                  <button
                    key={it.label}
                    onClick={() => setSection(it.id)}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      section === it.id
                        ? it.id === 'danger' ? 'bg-red-50 font-medium text-red-600 dark:bg-red-950/30' : 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10'
                        : it.id === 'danger' ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20' : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    {it.label}
                  </button>
                ),
              )}
            </div>
          </div>
        ))}
      </aside>

      <main className="min-w-0 max-w-2xl flex-1 overflow-y-auto p-4 sm:p-6">
      {['details', 'tax', 'invoice'].includes(section) && (
      <form onSubmit={save} className="card space-y-5 p-6">
        {section === 'details' && (
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
        )}

        {section === 'invoice' && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Invoice / receipt lines</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Header line (above items)</label>
              <input className="input" value={form.receiptHeader ?? ''} onChange={(e) => set('receiptHeader', e.target.value)} placeholder="Welcome to s3vya!" />
            </div>
            <div>
              <label className="label">Footer line (bottom of bill)</label>
              <input className="input" value={form.receiptFooter ?? ''} onChange={(e) => set('receiptFooter', e.target.value)} placeholder="Dhanyabad! Visit again 🙏" />
            </div>
            <div>
              <label className="label">WiFi password (printed on bill)</label>
              <input className="input" value={form.wifiPassword ?? ''} onChange={(e) => set('wifiPassword', e.target.value)} placeholder="guest-wifi-123" />
            </div>
            <p className="text-xs text-slate-400">Ticket layout, fields and printers are under <a className="text-brand-600 underline" href="/printing">KOT &amp; Printer</a>.</p>
          </div>
        </div>
        )}

        {section === 'tax' && (
        <div>
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
          <div className="mt-3">
            <button
              type="button"
              onClick={async () => {
                const next = !form.pricesIncludeVat;
                setForm({ ...form, pricesIncludeVat: next });
                try { await api.patch('/settings', { pricesIncludeVat: next }); } catch (err) { alert((err as Error).message); setForm({ ...form, pricesIncludeVat: !next }); }
              }}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
            >
              <span>
                <span className="font-medium text-slate-700">Menu prices include VAT</span>
                <span className="block text-xs text-slate-400">
                  {form.pricesIncludeVat
                    ? 'ON — customers pay the menu price; VAT is extracted from it on the bill.'
                    : 'OFF — VAT is added on top of the menu price at billing.'}
                </span>
              </span>
              <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${form.pricesIncludeVat ? 'bg-brand-500' : 'bg-slate-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.pricesIncludeVat ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </span>
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Applied to every new order: service charge on the discounted subtotal, then VAT. Currency (<strong>{form.currency}</strong>) is set in <code>apps/api/.env</code>.
          </p>
        </div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span className="text-sm text-emerald-600">✓ Saved</span>}
        </div>
      </form>
      )}

      {/* Feature toggles — enable/disable whole modules app-wide */}
      {section === 'modules' && form.features && (
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

      {/* ── IRD (CBMS Nepal) e-billing ── */}
      {section === 'ird' && form && <IrdCard settings={form} onSaved={setForm} />}

      {/* ── Desktop application downloads ── */}
      {section === 'desktop' && (
      <div className="card space-y-5 p-6">
        <div>
          <h2 className="mb-1 text-sm font-semibold text-slate-700">s3vyaPOS Desktop (cashier till)</h2>
          <p className="text-xs text-slate-400">
            The native till app connects to s3vya.tech out of the box and adds what a browser can&apos;t:
            <strong> silent KOT/bill printing</strong> to your chosen printers, <strong>auto-printing of waiter KOTs</strong>,
            and the <strong>ZKTeco fingerprint bridge</strong> that syncs attendance punches to the cloud every 5 minutes.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <a href="https://s3vya.tech/downloads/s3vyaPOS-Setup-0.1.0.exe" download
            className="group flex items-center gap-4 rounded-xl border border-slate-200 p-4 transition-colors hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-600">
            <svg className="h-9 w-9 shrink-0 text-slate-500 group-hover:text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 5.5 10.5 4.5v7H3z" /><path d="M12.5 4.2 21 3v8.5h-8.5z" /><path d="M3 13h7.5v7L3 18.5z" /><path d="M12.5 13H21v8l-8.5-1.2z" />
            </svg>
            <span>
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Download for Windows</span>
              <span className="block text-xs text-slate-400">.exe installer · 64-bit · ~78 MB</span>
            </span>
          </a>
          <a href="https://s3vya.tech/downloads/s3vyaPOS-0.1.0-arm64.dmg" download
            className="group flex items-center gap-4 rounded-xl border border-slate-200 p-4 transition-colors hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-600">
            <svg className="h-9 w-9 shrink-0 text-slate-500 group-hover:text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z" /><path d="M10 2c1 .5 2 2 2 5" />
            </svg>
            <span>
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Download for macOS</span>
              <span className="block text-xs text-slate-400">.dmg · Apple Silicon · ~94 MB</span>
            </span>
          </a>
        </div>
        <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-700/40 dark:text-slate-300">
          <p className="mb-1 font-semibold text-slate-600 dark:text-slate-200">First-launch notes (unsigned builds)</p>
          <p><strong>Windows:</strong> SmartScreen may warn — click <em>More info → Run anyway</em>.</p>
          <p><strong>macOS:</strong> right-click the app → <em>Open</em> (first launch only), or run <code>xattr -cr /Applications/s3vyaPOS.app</code>.</p>
          <p className="mt-2">After installing: sign in, pick printers under <a className="text-brand-600 underline" href="/printing">Settings → Printing</a>, and set the scanner IP under <a className="text-brand-600 underline" href="/attendance">Staff → Attendance → Device</a>.</p>
        </div>
      </div>
      )}

      {/* ── Danger zone ── */}
      {section === 'danger' && (
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-6 dark:border-red-900/40 dark:bg-red-950/20">
        <h2 className="mb-1 text-sm font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          <strong>Reset all data</strong> permanently deletes all orders, payments, KOTs, cash-drawer
          sessions, reservations, stock movements and the audit log. Your menu, staff, tables,
          suppliers and settings are kept. Use this once, before you start real trading.
        </p>
        {resetMsg && <p className="mb-3 text-xs font-medium text-slate-700 dark:text-slate-200">{resetMsg}</p>}
        <button
          type="button"
          onClick={() => { setResetMsg(null); setConfirmText(''); setResetOpen(true); }}
          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          Reset all data…
        </button>
      </div>
      )}

      <Modal open={resetOpen} title="Reset all data" onClose={() => setResetOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This <strong>permanently</strong> deletes all sales &amp; operational data (orders,
            payments, cash sessions, reservations, stock movements, audit log). It <strong>cannot be
            undone</strong>. Your menu, staff, tables and settings will be kept.
          </p>
          <div>
            <label className="label">Type <span className="font-mono text-red-600">RESET</span> to confirm</label>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESET" autoFocus />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setResetOpen(false)} className="btn-ghost">Cancel</button>
            <button
              type="button"
              disabled={confirmText !== 'RESET' || resetting}
              onClick={resetData}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {resetting ? 'Resetting…' : 'Permanently reset'}
            </button>
          </div>
        </div>
      </Modal>
      </main>
    </div>
  );
}

// ── IRD (CBMS) credentials card ──────────────────────
function IrdCard({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const ird = settings.ird ?? { enabled: false, hasPassword: false };
  const [enabled, setEnabled] = useState(ird.enabled);
  const [username, setUsername] = useState(ird.username ?? '');
  const [password, setPassword] = useState('');
  const [pan, setPan] = useState(ird.sellerPan ?? '');
  const [url, setUrl] = useState(ird.apiUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const updated = await api.patch<Settings>('/settings', {
        irdEnabled: enabled,
        irdUsername: username || undefined,
        ...(password ? { irdPassword: password } : {}),
        irdSellerPan: pan || undefined,
        irdApiUrl: url || undefined,
      });
      onSaved(updated);
      setPassword('');
      setNote('Saved ✓');
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-6 p-6">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">IRD Nepal — e-billing (CBMS)</h2>
      <p className="mb-4 text-xs text-slate-400">
        Credentials issued by IRD for the Central Billing Monitoring System. Invoices sync from
        Reports → &quot;Sync to IRD&quot;. The password is stored server-side and never shown again.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">IRD username</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" /></div>
        <div><label className="label">IRD password {ird.hasPassword && '— saved, blank to keep'}</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={ird.hasPassword ? '••••••••' : ''} /></div>
        <div><label className="label">Seller PAN</label>
          <input className="input" value={pan} onChange={(e) => setPan(e.target.value)} placeholder="e.g. 601234567" /></div>
        <div><label className="label">API URL (blank = official CBMS)</label>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://cbapi.ird.gov.np/api/bill" /></div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => setEnabled(!enabled)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-brand-500' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </span>
          <span className="text-slate-700">{enabled ? 'Sync enabled' : 'Sync disabled'}</span>
        </button>
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save IRD settings'}</button>
        {note && <span className="text-xs font-medium text-slate-500">{note}</span>}
      </div>
    </div>
  );
}

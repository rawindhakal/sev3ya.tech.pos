'use client';

import { useEffect, useState } from 'react';
import { api, setTenantSlug, tenantSlug } from '@/lib/api';
import type { Employee } from '@/lib/types';

// Standalone Platform Admin panel — its own login (control-DB admin only,
// never a tenant context) and its own dark chrome, fully separate from the
// restaurant back-office shell.

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const [emp, setEmp] = useState<Employee | null>(null);
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState<'ok' | 'denied' | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem('cakezake-emp');
      if (s) setEmp(JSON.parse(s));
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  // Verify the signed-in user really is a control-plane admin (403 otherwise).
  useEffect(() => {
    if (!emp) return;
    if (tenantSlug()) { setChecked('denied'); return; }
    api.get('/platform/me').then(() => setChecked('ok')).catch(() => setChecked('denied'));
  }, [emp]);

  function logout() {
    localStorage.removeItem('cakezake-emp');
    localStorage.removeItem('cakezake-token');
    setEmp(null);
    setChecked(null);
  }

  if (!ready) return null;
  if (!emp) return <PlatformLogin onLogin={setEmp} />;
  if (checked === null) return <div className="flex h-screen items-center justify-center text-slate-400">Checking access…</div>;
  if (checked === 'denied') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-5xl">🔒</div>
        <p className="text-lg font-medium text-slate-700 dark:text-slate-200">Platform access denied</p>
        <p className="max-w-sm text-sm text-slate-400">The console is only for s3vya platform administrators signed in on the main domain (no restaurant code).</p>
        <button onClick={logout} className="btn-primary mt-2">Sign in as platform admin</button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-[#0F172A]">
      <header className="flex shrink-0 items-center justify-between bg-slate-900 px-4 py-3 text-white sm:px-8">
        <div className="flex items-center gap-3">
          <svg className="h-6 w-6 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" />
          </svg>
          <div>
            <div className="text-sm font-bold leading-tight">s3vya Platform Console</div>
            <div className="text-[11px] text-slate-400">Tenants · plans · payments · remote settings</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-slate-300 sm:inline">{emp.name}</span>
          <button onClick={logout} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Sign out</button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

function PlatformLogin({ onLogin }: { onLogin: (e: Employee) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!username.trim() || !password) return setErr('Enter your username and password');
    setTenantSlug(''); // platform admins always authenticate against the control DB
    setBusy(true);
    setErr('');
    try {
      const e = await api.post<Employee & { token?: string }>('/employees/login', { username: username.trim(), password });
      localStorage.setItem('cakezake-emp', JSON.stringify(e));
      if (e.token) localStorage.setItem('cakezake-token', e.token);
      onLogin(e);
    } catch {
      setErr('Invalid platform credentials');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-80 rounded-2xl border border-slate-700 bg-slate-800 p-6 text-center shadow-xl">
        <svg className="mx-auto mb-2 h-8 w-8 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" />
        </svg>
        <div className="text-lg font-bold text-white">s3vya Platform</div>
        <p className="mb-4 text-xs text-slate-400">Platform administrators only</p>
        {err && <p className="mb-3 text-xs text-red-400">{err}</p>}
        <div className="space-y-2 text-left">
          <input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoFocus autoComplete="username" placeholder="Username"
            className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-500" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()}
            type="password" autoComplete="current-password" placeholder="Password"
            className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-500" />
        </div>
        <button onClick={submit} disabled={busy}
          className="mt-3 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <a href="/" className="mt-3 block text-xs text-slate-500 underline">Restaurant staff sign-in →</a>
      </div>
    </div>
  );
}

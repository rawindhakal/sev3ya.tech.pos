'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { Employee } from '@/lib/types';

// Back-office sign-in with username + password. The token is stored so the API
// client sends it and role/permission gating can apply across admin pages.
export default function Login({ onLogin }: { onLogin: (e: Employee) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!username.trim() || !password) return setErr('Enter your username and password');
    setBusy(true);
    setErr('');
    try {
      const e = await api.post<Employee & { token?: string }>('/employees/login', {
        username: username.trim(),
        password,
      });
      localStorage.setItem('cakezake-emp', JSON.stringify(e));
      if (e.token) localStorage.setItem('cakezake-token', e.token);
      onLogin(e);
    } catch {
      setErr('Invalid username or password');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-4 dark:bg-[#0F172A]">
      <div className="w-80 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-1 text-3xl">🍰</div>
        <div className="text-lg font-bold text-brand-700">CakeZake Back-Office</div>
        <p className="mb-4 text-xs text-slate-400">Sign in with your username &amp; password</p>
        {err && <p className="mb-3 text-xs text-red-500">{err}</p>}
        <div className="space-y-2 text-left">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoFocus
            autoComplete="username"
            placeholder="Username"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
        </div>
        <button
          onClick={submit}
          disabled={busy}
          className="mt-3 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="mt-4 text-[10px] text-slate-400">admin / admin123 · gita / manager123</p>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { Employee } from '@/lib/types';

// Back-office sign-in. Reuses staff PIN login; the token is stored so the API
// client sends it and role/permission gating can apply across admin pages.
export default function Login({ onLogin }: { onLogin: (e: Employee) => void }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!/^\d{4,6}$/.test(pin)) return setErr('Enter your 4–6 digit PIN');
    setBusy(true);
    try {
      const e = await api.post<Employee & { token?: string }>('/employees/login', { pin });
      localStorage.setItem('cakezake-emp', JSON.stringify(e));
      if (e.token) localStorage.setItem('cakezake-token', e.token);
      onLogin(e);
    } catch {
      setErr('Invalid PIN');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  const key = (d: string) => setPin((p) => (p.length < 6 ? p + d : p));

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-4 dark:bg-[#0F172A]">
      <div className="w-80 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-1 text-3xl">🍰</div>
        <div className="text-lg font-bold text-brand-700">CakeZake Back-Office</div>
        <p className="mb-4 text-xs text-slate-400">Sign in with your staff PIN</p>
        <div className="mb-4 flex justify-center gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={`h-3 w-3 rounded-full ${i < pin.length ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-600'}`} />
          ))}
        </div>
        {err && <p className="mb-3 text-xs text-red-500">{err}</p>}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} onClick={() => key(d)} className="rounded-lg bg-slate-100 py-3 text-lg font-semibold hover:bg-slate-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600">{d}</button>
          ))}
          <button onClick={() => setPin((p) => p.slice(0, -1))} className="rounded-lg bg-slate-100 py-3 hover:bg-slate-200 dark:bg-slate-700 dark:text-white">⌫</button>
          <button onClick={() => key('0')} className="rounded-lg bg-slate-100 py-3 text-lg font-semibold hover:bg-slate-200 dark:bg-slate-700 dark:text-white">0</button>
          <button onClick={submit} disabled={busy} className="rounded-lg bg-brand-600 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">{busy ? '…' : 'Enter'}</button>
        </div>
        <p className="mt-4 text-[10px] text-slate-400">Admin 1111 · Manager 2222 · Cashier 3333</p>
      </div>
    </div>
  );
}

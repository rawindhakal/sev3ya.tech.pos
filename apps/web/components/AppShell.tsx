'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Login from './Login';
import type { Employee } from '@/lib/types';

// Permission required to view each admin route (absent = any signed-in user).
export const ROUTE_PERM: Record<string, keyof Employee> = {
  '/reports': 'canViewReports',
  '/finance': 'canViewReports',
  '/accounting': 'canViewReports',
  '/mis': 'canViewReports',
  '/sales-report': 'canViewReports',
  '/inventory': 'canManageInventory',
  '/purchasing': 'canManageInventory',
  '/employees': 'canManageStaff',
  '/attendance': 'canManageStaff',
  '/settings': 'canManageStaff',
  '/menu': 'canManageStaff',
  '/printing': 'canManageStaff',
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? '';
  // Terminals self-gate (their own PIN screens) and run full-screen.
  const fullscreen = path === '/pos' || path === '/kds' || path.startsWith('/waiter');
  const [emp, setEmp] = useState<Employee | null>(null);
  const [ready, setReady] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  // Close the mobile drawer on navigation.
  useEffect(() => { setNavOpen(false); }, [path]);

  useEffect(() => {
    try {
      const s = localStorage.getItem('cakezake-emp');
      if (s) setEmp(JSON.parse(s));
    } catch {
      /* ignore */
    }
    setReady(true);
    // PWA: register the service worker so the app is installable (e.g. the
    // waiter panel on a phone) and the shell survives network blips.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  if (fullscreen) return <main className="h-screen overflow-hidden">{children}</main>;
  if (!ready) return null;
  if (!emp) return <Login onLogin={setEmp} />;

  function logout() {
    localStorage.removeItem('cakezake-emp');
    localStorage.removeItem('cakezake-token');
    setEmp(null);
  }

  // Waiters are locked to the Waiter Panel — no back-office at all.
  if (emp.role === 'WAITER') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-5xl">🧑‍🍳</div>
        <p className="text-lg font-medium text-slate-700 dark:text-slate-200">Hi {emp.name} — waiters work from the Waiter Panel</p>
        <a href="/waiter" className="btn-primary">Open Waiter Panel →</a>
        <button onClick={logout} className="text-xs text-slate-400 underline">Sign out</button>
      </div>
    );
  }

  const perm = ROUTE_PERM[path];
  const denied = !!perm && !emp[perm];

  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row">
      {/* Mobile top bar with hamburger */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800 md:hidden">
        <button onClick={() => setNavOpen(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-lg leading-none dark:border-slate-600" aria-label="Open menu">☰</button>
        <span className="font-bold text-brand-700">🍰 s3vyaPOS</span>
        <span className="text-xs text-slate-400">{emp.name}</span>
      </div>

      {/* Sidebar: static on desktop, slide-over drawer on mobile */}
      <div className="hidden h-full md:block [&>aside]:h-full">
        <Sidebar emp={emp} onLogout={logout} />
      </div>
      {navOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="h-full [&>aside]:h-full" onClick={() => setNavOpen(false)}>
            <Sidebar emp={emp} onLogout={logout} />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setNavOpen(false)} />
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto">
        {denied ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-400">
            <div className="mb-2 text-5xl">🔒</div>
            <p className="text-lg font-medium text-slate-600 dark:text-slate-300">Access denied</p>
            <p className="text-sm">Your role ({emp.role}) doesn&apos;t have permission for this section.</p>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

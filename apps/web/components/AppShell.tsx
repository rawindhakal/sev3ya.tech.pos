'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Login from './Login';
import LandingPage from './LandingPage';
import GlobalTopProgressBar from './TopProgressBar';
import Link from 'next/link';
import { api, tenantSlug } from '@/lib/api';
import DialogHost from '@/lib/dialog';
import type { Employee } from '@/lib/types';

// Permission key required to view each admin route (absent = any signed-in
// user). Values are permission keys from apps/api/src/common/permissions.ts.
export const ROUTE_PERM: Record<string, string> = {
  '/reports': 'reports.view',
  '/finance': 'reports.view',
  '/accounting': 'reports.view',
  '/mis': 'reports.view',
  '/sales-report': 'reports.view',
  '/platform': 'platform.manage',
  '/inventory': 'inventory.manage',
  '/purchasing': 'inventory.manage',
  '/employees': 'staff.manage',
  '/roles': 'roles.manage',
  '/outlets': 'outlets.manage',
  '/attendance': 'attendance.manage',
  '/hr': 'hr.manage',
  '/hr/leave': 'hr.manage',
  '/hr/shifts': 'hr.manage',
  '/hr/documents': 'hr.manage',
  '/hr/performance': 'hr.manage',
  '/sales-forecast': 'reports.view',
  '/settings': 'settings.manage',
  '/menu': 'settings.manage',
  '/printing': 'settings.manage',
  '/coupons': 'promotions.manage',
  '/gift-cards': 'giftcards.manage',
  '/feedback': 'reports.view',
  '/sync-recovery': 'syncFailures.manage',
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? '';
  // Terminals self-gate (their own PIN screens) and run full-screen. The
  // Platform Console is a standalone section with its own layout + login.
  // /order/[token] is the public QR self-order page; /pay/* are the public
  // payment-gateway redirect/callback bridges — no login, no sidebar.
  const fullscreen = path === '/pos' || path === '/kds' || path.startsWith('/waiter') || path.startsWith('/platform') || path.startsWith('/order') || path.startsWith('/pay');
  const [emp, setEmp] = useState<Employee | null>(null);
  const [ready, setReady] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [wantsLogin, setWantsLogin] = useState(false);
  const [syncFailures, setSyncFailures] = useState(0);

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

  // Manager alert: poll for unacknowledged offline-sync failures — a paid or
  // billed order the server rejected on replay must never go unnoticed.
  // Skipped entirely for staff without syncFailures.manage (they can't act on it).
  const canManageSync = !!emp?.permissions?.includes('syncFailures.manage');
  useEffect(() => {
    if (!canManageSync) { setSyncFailures(0); return; }
    let cancelled = false;
    const poll = () =>
      api.get<{ acknowledgedAt: string | null }[]>('/sync-failures', { silent: true })
        .then((items) => { if (!cancelled) setSyncFailures(items.filter((i) => !i.acknowledgedAt).length); })
        .catch(() => {});
    poll();
    const id = window.setInterval(poll, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [canManageSync]);

  function logout() {
    localStorage.removeItem('cakezake-emp');
    localStorage.removeItem('cakezake-token');
    setEmp(null);
  }

  // The bare main domain, signed out, shows the marketing home page instead
  // of jumping straight to a login form. Existing tenants/staff still land
  // on their own sign-in immediately (subdomain or any non-root path).
  const isControlHome = !tenantSlug() && path === '/';

  let content: React.ReactNode;
  if (fullscreen) {
    content = <main className="h-screen overflow-hidden">{children}</main>;
  } else if (!ready) {
    content = null;
  } else if (!emp) {
    content = isControlHome && !wantsLogin
      ? <LandingPage onSignIn={() => setWantsLogin(true)} />
      : <Login onLogin={setEmp} onBack={isControlHome ? () => setWantsLogin(false) : undefined} />;
  } else if (!tenantSlug() && emp.permissions?.includes('platform.manage')) {
    // Control context (no restaurant code) is the platform owner's world —
    // the back-office belongs to tenants. Send platform admins to their console.
    if (typeof window !== 'undefined') window.location.replace('/platform');
    content = null;
  } else if (emp.portal === 'WAITER_ONLY') {
    // Waiters are locked to the Waiter Panel — no back-office at all.
    content = (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-5xl">🧑‍🍳</div>
        <p className="text-lg font-medium text-slate-700 dark:text-slate-200">Hi {emp.name} — waiters work from the Waiter Panel</p>
        <a href="/waiter" className="btn-primary">Open Waiter Panel →</a>
        <button onClick={logout} className="text-xs text-slate-400 underline">Sign out</button>
      </div>
    );
  } else {
    const perm = ROUTE_PERM[path];
    const denied = !!perm && !emp.permissions?.includes(perm);
    content = (
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
          {syncFailures > 0 && path !== '/sync-recovery' && (
            <Link
              href="/sync-recovery"
              className="flex items-center justify-between bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <span>{syncFailures} offline sync failure{syncFailures === 1 ? '' : 's'} need review — an order or payment may not have reached the server</span>
              <span className="underline">Open Sync Recovery →</span>
            </Link>
          )}
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

  return (
    <>
      <GlobalTopProgressBar />
      {content}
      <DialogHost />
    </>
  );
}

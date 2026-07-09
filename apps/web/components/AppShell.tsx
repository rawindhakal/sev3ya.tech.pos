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
  '/inventory': 'canManageInventory',
  '/purchasing': 'canManageInventory',
  '/roastery': 'canManageInventory',
  '/employees': 'canManageStaff',
  '/settings': 'canManageStaff',
  '/menu': 'canManageStaff',
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? '';
  // Terminals self-gate (their own PIN screens) and run full-screen.
  const fullscreen = path === '/pos' || path === '/kds' || path.startsWith('/waiter');
  const [emp, setEmp] = useState<Employee | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem('cakezake-emp');
      if (s) setEmp(JSON.parse(s));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  if (fullscreen) return <main className="h-screen overflow-hidden">{children}</main>;
  if (!ready) return null;
  if (!emp) return <Login onLogin={setEmp} />;

  function logout() {
    localStorage.removeItem('cakezake-emp');
    localStorage.removeItem('cakezake-token');
    setEmp(null);
  }

  const perm = ROUTE_PERM[path];
  const denied = !!perm && !emp[perm];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar emp={emp} onLogout={logout} />
      <main className="flex-1 overflow-y-auto">
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

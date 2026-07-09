'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Employee, Features } from '@/lib/types';
import { ROUTE_PERM } from './AppShell';
import ThemeToggle from './ThemeToggle';

// `feature` maps a nav item to an admin toggle; permission comes from ROUTE_PERM.
const NAV: { href: string; label: string; icon: string; feature?: keyof Features }[] = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/pos', label: 'New Order (POS)', icon: '🛒' },
  { href: '/waiter', label: 'Waiter Panel', icon: '🧑‍🍳' },
  { href: '/reservations', label: 'Reservations', icon: '📅', feature: 'reservations' },
  { href: '/customers', label: 'Customers (CRM)', icon: '🧑‍🤝‍🧑', feature: 'crm' },
  { href: '/orders', label: 'Orders / KOT', icon: '🧾' },
  { href: '/kds', label: 'Kitchen (KDS)', icon: '👨‍🍳', feature: 'kds' },
  { href: '/menu', label: 'Menu & Items', icon: '🍽️' },
  { href: '/modifiers', label: 'Modifiers', icon: '➕', feature: 'modifiers' },
  { href: '/inventory', label: 'Inventory', icon: '📦', feature: 'inventory' },
  { href: '/purchasing', label: 'Purchasing', icon: '🚚', feature: 'purchasing' },
  { href: '/roastery', label: 'Roastery', icon: '🔥', feature: 'roastery' },
  { href: '/employees', label: 'Employees', icon: '👥' },
  { href: '/cash-drawer', label: 'Cash Drawer', icon: '💵' },
  { href: '/reports', label: 'Reports', icon: '📈' },
  { href: '/finance', label: 'Finance', icon: '💰', feature: 'finance' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar({ emp, onLogout }: { emp?: Employee | null; onLogout?: () => void }) {
  const pathname = usePathname();
  const [features, setFeatures] = useState<Features | null>(null);

  useEffect(() => {
    api.get<{ features?: Features }>('/settings').then((s) => setFeatures(s.features ?? null)).catch(() => {});
  }, [pathname]);

  const visible = NAV.filter((i) => {
    if (i.feature && features && !features[i.feature]) return false;
    const perm = ROUTE_PERM[i.href];
    if (perm && emp && !emp[perm]) return false; // hide sections the role can't use
    return true;
  });

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-2 px-6 py-5">
        <span className="text-2xl">🍰</span>
        <div>
          <div className="text-lg font-bold leading-none text-brand-700">s3vyaPOS</div>
          <div className="text-xs font-medium text-slate-400">POS Platform</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {visible.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-slate-100 px-4 py-4 dark:border-slate-700">
        {emp && (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-700">
            <span className="text-slate-600 dark:text-slate-200">👤 {emp.name} · {emp.role}</span>
            <button onClick={onLogout} className="font-medium text-red-500 hover:underline">Sign out</button>
          </div>
        )}
        <ThemeToggle />
        <div className="text-center text-xs text-slate-400">v0.1 · sev3ya.tech</div>
      </div>
    </aside>
  );
}

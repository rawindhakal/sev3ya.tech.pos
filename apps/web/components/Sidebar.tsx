'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Employee, Features } from '@/lib/types';
import { ROUTE_PERM } from './AppShell';
import ThemeToggle from './ThemeToggle';

// Hierarchical navigation: top-level items are either direct links or
// collapsible groups with children. `feature` maps an item to an admin toggle;
// permission comes from ROUTE_PERM. A group hides itself when every child is
// hidden, and auto-expands when it contains the current page.
interface NavLeaf { href: string; label: string; icon?: string; feature?: keyof Features }
interface NavNode extends Omit<NavLeaf, 'href'> { href?: string; icon: string; children?: NavLeaf[] }

const NAV: NavNode[] = [
  { label: 'Dashboard', icon: '📊', href: '/' },
  {
    label: 'Orders', icon: '🧾',
    children: [
      { href: '/pos', label: 'POS Terminal' },
      { href: '/waiter', label: 'Waiter Panel' },
      { href: '/orders', label: 'Orders / KOT' },
      { href: '/kds', label: 'Kitchen (KDS)', feature: 'kds' },
    ],
  },
  {
    label: 'Menu', icon: '🍽️',
    children: [
      { href: '/menu', label: 'Items & Categories' },
    ],
  },
  { label: 'Reservations', icon: '📅', href: '/reservations', feature: 'reservations' },
  { label: 'Customers', icon: '🧑‍🤝‍🧑', href: '/customers', feature: 'crm' },
  {
    label: 'Inventory', icon: '📦', feature: 'inventory',
    children: [
      { href: '/inventory', label: 'Stock & Recipes' },
      { href: '/purchasing', label: 'Purchasing', feature: 'purchasing' },
    ],
  },
  {
    label: 'Finance', icon: '💰', feature: 'finance',
    children: [
      { href: '/reports', label: 'Reports' },
      { href: '/finance', label: 'P&L & Expenses' },
      { href: '/accounting', label: 'Accounting' },
      { href: '/cash-drawer', label: 'Cash Drawer' },
    ],
  },
  {
    label: 'Settings', icon: '⚙️',
    children: [
      { href: '/settings', label: 'General' },
      { href: '/printing', label: 'Printing' },
      { href: '/employees', label: 'Employees' },
    ],
  },
];

const OPEN_KEY = 's3vya-nav-open';

export default function Sidebar({ emp, onLogout }: { emp?: Employee | null; onLogout?: () => void }) {
  const pathname = usePathname();
  const [features, setFeatures] = useState<Features | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get<{ features?: Features }>('/settings').then((s) => setFeatures(s.features ?? null)).catch(() => {});
  }, [pathname]);

  // Restore expanded groups; always expand the group holding the current page.
  useEffect(() => {
    let stored: Record<string, boolean> = {};
    try { stored = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}'); } catch {}
    for (const node of NAV) {
      if (node.children?.some((c) => c.href === pathname)) stored[node.label] = true;
    }
    setOpen(stored);
  }, [pathname]);

  function toggle(label: string) {
    setOpen((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const allowed = (leafOrNode: { href?: string; feature?: keyof Features }) => {
    if (leafOrNode.feature && features && !features[leafOrNode.feature]) return false;
    if (leafOrNode.href) {
      const perm = ROUTE_PERM[leafOrNode.href];
      if (perm && emp && !emp[perm]) return false;
    }
    return true;
  };

  const leafClasses = (active: boolean, child = false) =>
    `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      child ? 'py-1.5 pl-4 text-[13px]' : 'py-2.5'
    } ${active
      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10'
      : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`;

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-2 px-6 py-5">
        <span className="text-2xl">🍰</span>
        <div>
          <div className="text-lg font-bold leading-none text-brand-700">s3vyaPOS</div>
          <div className="text-xs font-medium text-slate-400">POS Platform</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map((node) => {
          if (!allowed(node)) return null;

          // Direct link (no children)
          if (!node.children) {
            const active = pathname === node.href;
            return (
              <Link key={node.label} href={node.href!} className={leafClasses(active)}>
                {active && <span className="absolute left-0 top-1/2 h-1/2 w-1 -translate-y-1/2 rounded-e-full bg-brand-500" />}
                <span className="text-base">{node.icon}</span>
                <span>{node.label}</span>
              </Link>
            );
          }

          // Collapsible group
          const children = node.children.filter(allowed);
          if (children.length === 0) return null;
          const childActive = children.some((c) => pathname === c.href);
          const isOpen = open[node.label] ?? childActive;
          return (
            <div key={node.label}>
              <button
                onClick={() => toggle(node.label)}
                className={`relative flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  childActive ? 'text-brand-700' : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
                aria-expanded={isOpen}
              >
                {childActive && <span className="absolute left-0 top-1/2 h-1/2 w-1 -translate-y-1/2 rounded-e-full bg-brand-500" />}
                <span className="flex items-center gap-3">
                  <span className="text-base">{node.icon}</span>
                  <span>{node.label}</span>
                </span>
                <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-0' : '-rotate-90'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {isOpen && (
                <div className="ml-4 space-y-0.5 border-l border-slate-100 pl-2 dark:border-slate-700">
                  {children.map((c) => {
                    const active = pathname === c.href;
                    return (
                      <Link key={c.href} href={c.href} className={leafClasses(active, true)}>
                        {active && <span className="absolute left-0 top-1/2 h-1/2 w-0.5 -translate-y-1/2 rounded-e-full bg-brand-500" />}
                        <span>{c.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
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

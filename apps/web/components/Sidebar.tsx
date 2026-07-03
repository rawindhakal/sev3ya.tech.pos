'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Navigation is defined once here. As features land, flip `enabled: true`
// and point href at the new route — the shell already handles the rest.
const NAV = [
  { href: '/', label: 'Dashboard', icon: '📊', enabled: true },
  { href: '/pos', label: 'New Order (POS)', icon: '🛒', enabled: true },
  { href: '/tables', label: 'Tables', icon: '🪑', enabled: true },
  { href: '/orders', label: 'Orders / KOT', icon: '🧾', enabled: true },
  { href: '/menu', label: 'Menu & Items', icon: '🍽️', enabled: true },
  { href: '/modifiers', label: 'Modifiers', icon: '➕', enabled: true },
  { href: '/cash-drawer', label: 'Cash Drawer', icon: '💵', enabled: true },
  { href: '/settings', label: 'Settings', icon: '⚙️', enabled: true },
  { href: '/forecast', label: 'Sales & Forecast', icon: '📈', enabled: false },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-6 py-5">
        <span className="text-2xl">🍰</span>
        <div>
          <div className="text-lg font-bold leading-none text-brand-700">CakeZake</div>
          <div className="text-xs font-medium text-slate-400">POS Platform</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const base =
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors';
          if (!item.enabled) {
            return (
              <div
                key={item.href}
                className={`${base} cursor-not-allowed text-slate-300`}
                title="Coming soon"
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                <span className="badge bg-slate-100 text-slate-400">soon</span>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${base} ${
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 px-6 py-4 text-xs text-slate-400">
        v0.1 · sev3ya.tech
      </div>
    </aside>
  );
}

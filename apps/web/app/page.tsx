'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Category, MenuItem } from '@/lib/types';

export default function DashboardPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .get<{ status: string }>('/health')
      .then((h) => setOnline(h.status === 'ok'))
      .catch(() => setOnline(false));
    api.get<MenuItem[]>('/menu-items').then(setItems).catch(() => {});
    api.get<Category[]>('/categories').then(setCategories).catch(() => {});
  }, []);

  const available = items.filter((i) => i.isAvailable).length;

  const stats = [
    { label: 'Menu items', value: items.length, href: '/menu', icon: '🍽️' },
    { label: 'Categories', value: categories.length, href: '/menu', icon: '🗂️' },
    { label: 'Available now', value: available, href: '/menu', icon: '✅' },
    { label: 'Modifier groups', value: '—', href: '/modifiers', icon: '➕' },
  ];

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Welcome back to CakeZake POS</p>
        </div>
        <span
          className={`badge ${
            online === null
              ? 'bg-slate-100 text-slate-500'
              : online
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
          }`}
        >
          {online === null ? 'Checking API…' : online ? 'API online' : 'API offline'}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-5 transition-shadow hover:shadow-md">
            <div className="mb-3 text-2xl">{s.icon}</div>
            <div className="text-3xl font-bold text-slate-900">{s.value}</div>
            <div className="text-sm text-slate-500">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-800">Recent menu items</h2>
          {items.length === 0 ? (
            <p className="text-sm text-slate-400">No items yet. Add some from the Menu page.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-medium text-slate-700">{i.name}</span>
                  <span className="text-xs text-slate-400">{i.category?.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Roadmap</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2 text-green-700">✅ Menu & items</li>
            <li className="flex items-center gap-2 text-green-700">✅ Modifiers</li>
            <li className="flex items-center gap-2 text-slate-400">⬜ Table management</li>
            <li className="flex items-center gap-2 text-slate-400">⬜ Orders & KOT</li>
            <li className="flex items-center gap-2 text-slate-400">⬜ Billing</li>
            <li className="flex items-center gap-2 text-slate-400">⬜ Sales forecast</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

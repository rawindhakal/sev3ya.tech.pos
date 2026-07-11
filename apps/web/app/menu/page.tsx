'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, formatMoney, dollarsToCents } from '@/lib/api';
import type { Category, MenuItem } from '@/lib/types';
import { toCsv, downloadCsv, parseCsv } from '@/lib/csv';
import Modal from '@/components/Modal';

type ItemForm = {
  name: string;
  description: string;
  priceDollars: string;
  takeawayDollars: string;
  deliveryDollars: string;
  station: string;
  categoryId: string;
  isAvailable: boolean;
  variants: { name: string; price: string }[];
};

const emptyForm: ItemForm = {
  name: '',
  description: '',
  priceDollars: '',
  takeawayDollars: '',
  deliveryDollars: '',
  station: 'BILLING',
  categoryId: '',
  isAvailable: true,
  variants: [],
};

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCat, setActiveCat] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [itemModal, setItemModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [catModal, setCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [cats, its] = await Promise.all([
        api.get<Category[]>('/categories'),
        api.get<MenuItem[]>('/menu-items'),
      ]);
      setCategories(cats);
      setItems(its);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () =>
      activeCat === 'all'
        ? items
        : items.filter((i) => i.categoryId === activeCat),
    [items, activeCat],
  );

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      categoryId: activeCat !== 'all' ? activeCat : categories[0]?.id ?? '',
    });
    setItemModal(true);
  }

  function openEdit(item: MenuItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description ?? '',
      priceDollars: (item.priceCents / 100).toFixed(2),
      takeawayDollars: item.takeawayPriceCents != null ? (item.takeawayPriceCents / 100).toFixed(2) : '',
      deliveryDollars: item.deliveryPriceCents != null ? (item.deliveryPriceCents / 100).toFixed(2) : '',
      station: item.station ?? 'BILLING',
      categoryId: item.categoryId,
      isAvailable: item.isAvailable,
      variants: (item.variants ?? []).map((v) => ({ name: v.name, price: (v.priceCents / 100).toString() })),
    });
    setItemModal(true);
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const optCents = (v: string) =>
        v.trim() === '' ? null : dollarsToCents(parseFloat(v));
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        priceCents: dollarsToCents(parseFloat(form.priceDollars || '0')),
        takeawayPriceCents: optCents(form.takeawayDollars),
        deliveryPriceCents: optCents(form.deliveryDollars),
        station: form.station,
        categoryId: form.categoryId,
        isAvailable: form.isAvailable,
        variants: form.variants.filter((v) => v.name.trim()).map((v, i) => ({ name: v.name.trim(), priceCents: dollarsToCents(parseFloat(v.price || '0')), sortOrder: i })),
      };
      if (editingId) {
        await api.patch(`/menu-items/${editingId}`, payload);
      } else {
        await api.post('/menu-items', payload);
      }
      setItemModal(false);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailable(item: MenuItem) {
    // Optimistic update.
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isAvailable: !i.isAvailable } : i)),
    );
    try {
      await api.patch(`/menu-items/${item.id}`, { isAvailable: !item.isAvailable });
    } catch {
      load();
    }
  }

  async function deleteItem(item: MenuItem) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      await api.delete(`/menu-items/${item.id}`);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // ── Category rename / delete ─────────────────────
  async function renameCategory(c: Category) {
    const name = prompt('Rename category:', c.name);
    if (!name?.trim() || name.trim() === c.name) return;
    try {
      await api.patch(`/categories/${c.id}`, { name: name.trim() });
      load();
    } catch (e) { alert((e as Error).message); }
  }
  async function deleteCategory(c: Category) {
    const n = c._count?.items ?? 0;
    if (!confirm(`Delete category "${c.name}"${n ? ` and its ${n} item(s)` : ''}? This cannot be undone.`)) return;
    try {
      await api.delete(`/categories/${c.id}`);
      setActiveCat('all');
      load();
    } catch (e) { alert((e as Error).message); }
  }

  // ── CSV import / export ──────────────────────────
  // Portions/variants travel in one column encoded as "name:price|name:price"
  // (prices in rupees) — e.g. "30ml:250|60ml:450".
  const CSV_COLS = ['name', 'category', 'description', 'price', 'takeawayPrice', 'deliveryPrice', 'station', 'available', 'variants'];

  const encodeVariants = (i: MenuItem) =>
    (i.variants ?? []).map((v) => `${v.name}:${(v.priceCents / 100).toFixed(2)}`).join('|');

  function parseVariants(raw: string): { name: string; priceCents: number; sortOrder: number }[] {
    if (!raw.trim()) return [];
    return raw.split('|').map((part, idx) => {
      const cut = part.lastIndexOf(':');
      const name = (cut > 0 ? part.slice(0, cut) : part).trim();
      const price = cut > 0 ? parseFloat(part.slice(cut + 1)) || 0 : 0;
      return { name, priceCents: dollarsToCents(price), sortOrder: idx };
    }).filter((v) => v.name);
  }

  function exportItemsCsv() {
    downloadCsv('menu-items.csv', toCsv(CSV_COLS, items.map((i) => [
      i.name,
      i.category?.name ?? '',
      i.description ?? '',
      (i.priceCents / 100).toFixed(2),
      i.takeawayPriceCents != null ? (i.takeawayPriceCents / 100).toFixed(2) : '',
      i.deliveryPriceCents != null ? (i.deliveryPriceCents / 100).toFixed(2) : '',
      i.station ?? 'BILLING',
      i.isAvailable ? 'yes' : 'no',
      encodeVariants(i),
    ])));
  }

  // A fill-in-ready template with example rows (one shows portions/variants).
  function downloadTemplate() {
    downloadCsv('menu-items-template.csv', toCsv(CSV_COLS, [
      ['Cappuccino', 'Hot Coffee', 'Rich espresso with steamed milk', '180.00', '170.00', '190.00', 'BAR', 'yes', ''],
      ['Chicken Momo', 'Food', 'Steamed dumplings (10 pcs)', '250.00', '', '', 'KITCHEN', 'yes', ''],
      ['Whiskey', 'Bar', 'Premium blend — choose a portion', '0.00', '', '', 'BAR', 'yes', '30ml:250.00|60ml:450.00'],
      ['Birthday Cake 1kg', 'Bakery', '', '1200.00', '', '', 'BILLING', 'yes', '0.5kg:650.00|1kg:1200.00|2kg:2300.00'],
    ]));
  }

  async function importItemsCsv(file: File) {
    setSaving(true);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('CSV needs a header row + at least one item');
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const idx = (n: string) => header.indexOf(n.toLowerCase());
      if (idx('name') < 0 || idx('price') < 0) throw new Error('CSV must have "name" and "price" columns (use the export as a template)');
      const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
      let created = 0, failed = 0;
      for (const r of rows.slice(1)) {
        const get = (n: string) => (idx(n) >= 0 ? (r[idx(n)] ?? '').trim() : '');
        const name = get('name');
        if (!name) continue;
        try {
          // Find or create the category.
          const catName = get('category') || 'Uncategorised';
          let categoryId = catByName.get(catName.toLowerCase());
          if (!categoryId) {
            const c = await api.post<Category>('/categories', { name: catName, sortOrder: categories.length + catByName.size });
            categoryId = c.id;
            catByName.set(catName.toLowerCase(), c.id);
          }
          const money = (v: string) => (v === '' ? null : dollarsToCents(parseFloat(v) || 0));
          const station = get('station').toUpperCase();
          await api.post('/menu-items', {
            name,
            description: get('description') || undefined,
            priceCents: money(get('price')) ?? 0,
            takeawayPriceCents: money(get('takeawayPrice')),
            deliveryPriceCents: money(get('deliveryPrice')),
            station: ['KITCHEN', 'BAR', 'BILLING'].includes(station) ? station : 'BILLING',
            categoryId,
            isAvailable: !/^(no|false|0)$/i.test(get('available') || 'yes'),
            variants: parseVariants(get('variants')),
          });
          created++;
        } catch { failed++; }
      }
      alert(`Import finished — ${created} item(s) created${failed ? `, ${failed} failed` : ''}.`);
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setSaving(true);
    try {
      await api.post('/categories', { name: newCatName.trim(), sortOrder: categories.length });
      setNewCatName('');
      setCatModal(false);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Menu & Items</h1>
          <p className="text-sm text-slate-500">Manage your categories and menu items</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={downloadTemplate} title="Blank CSV template with example rows (incl. portions)">📄 Template</button>
          <button className="btn-ghost" onClick={exportItemsCsv} disabled={items.length === 0}>⬇ Export CSV</button>
          <label className="btn-ghost cursor-pointer">
            ⬆ Import CSV
            <input type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importItemsCsv(f); e.target.value = ''; }} />
          </label>
          <button className="btn-ghost" onClick={() => setCatModal(true)}>
            + Category
          </button>
          <button className="btn-primary" onClick={openCreate} disabled={categories.length === 0}>
            + Add Item
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error} — is the API running on port 4000?
        </div>
      )}

      {/* Category filter tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCat('all')}
          className={`badge px-3 py-1.5 ${
            activeCat === 'all' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          All ({items.length})
        </button>
        {categories.map((c) => (
          <span key={c.id} className="inline-flex items-center">
            <button
              onClick={() => setActiveCat(c.id)}
              className={`badge px-3 py-1.5 ${
                activeCat === c.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {c.name} ({c._count?.items ?? 0})
            </button>
            {activeCat === c.id && (
              <span className="ml-1 flex gap-0.5">
                <button title="Rename category" onClick={() => renameCategory(c)} className="rounded px-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600">✏️</button>
                <button title="Delete category" onClick={() => deleteCategory(c)} className="rounded px-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600">🗑</button>
              </span>
            )}
          </span>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          No items here yet. Click <strong>+ Add Item</strong> to create one.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div key={item.id} className="card flex flex-col p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{item.name}</h3>
                <span className="whitespace-nowrap font-bold text-brand-700">
                  {formatMoney(item.priceCents)}
                </span>
              </div>
              <p className="mb-3 line-clamp-2 min-h-[2.5rem] text-xs text-slate-500">
                {item.description || 'No description'}
              </p>
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="badge bg-slate-100 text-slate-500">{item.category?.name}</span>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
                <button
                  onClick={() => toggleAvailable(item)}
                  className={`badge ${
                    item.isAvailable ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {item.isAvailable ? '● Available' : '○ Unavailable'}
                </button>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(item)}
                    className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteItem(item)}
                    className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Item modal */}
      <Modal
        open={itemModal}
        title={editingId ? 'Edit item' : 'New item'}
        onClose={() => setItemModal(false)}
      >
        <form onSubmit={saveItem} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Dine-in Price (Rs)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={form.priceDollars}
                onChange={(e) => setForm({ ...form, priceDollars: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Category</label>
              <select
                className="input"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Takeaway Price (Rs)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                placeholder="Same as dine-in"
                value={form.takeawayDollars}
                onChange={(e) => setForm({ ...form, takeawayDollars: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Delivery Price (Rs)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                placeholder="Same as dine-in"
                value={form.deliveryDollars}
                onChange={(e) => setForm({ ...form, deliveryDollars: e.target.value })}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-slate-400">
            Leave takeaway/delivery blank to use the dine-in price.
          </p>
          <div>
            <label className="label">Prep station (printer)</label>
            <select className="input" value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })}>
              <option value="BILLING">Billing only (no ticket)</option>
              <option value="KITCHEN">Kitchen — KOT</option>
              <option value="BAR">Bar — BOT</option>
            </select>
            <p className="mt-1 text-xs text-slate-400">Routes this item to the kitchen (KOT) or bar (BOT) printer when fired. Default is billing-only.</p>
          </div>
          <div>
            <label className="label">Portions / variants (optional)</label>
            <p className="mb-2 text-xs text-slate-400">e.g. Whiskey → 30ml, 60ml. A variant&apos;s price replaces the base price when ordered.</p>
            <div className="space-y-2">
              {form.variants.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input flex-1" value={v.name} placeholder="Portion (e.g. 60ml)" onChange={(e) => setForm((f) => ({ ...f, variants: f.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
                  <input className="input w-28" type="number" step="0.01" min="0" value={v.price} placeholder="Price Rs" onChange={(e) => setForm((f) => ({ ...f, variants: f.variants.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) }))} />
                  <button type="button" className="rounded-md px-2 text-red-500 hover:bg-red-50" onClick={() => setForm((f) => ({ ...f, variants: f.variants.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              ))}
            </div>
            <button type="button" className="mt-2 text-xs text-brand-600 hover:underline" onClick={() => setForm((f) => ({ ...f, variants: [...f.variants, { name: '', price: '' }] }))}>+ Add portion</button>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
            />
            Available for ordering
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={() => setItemModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create item'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Category modal */}
      <Modal open={catModal} title="New category" onClose={() => setCatModal(false)}>
        <form onSubmit={createCategory} className="space-y-4">
          <div>
            <label className="label">Category name</label>
            <input
              className="input"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. Beverages"
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setCatModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

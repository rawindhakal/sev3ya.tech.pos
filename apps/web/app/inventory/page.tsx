'use client';

import { useEffect, useState } from 'react';
import { api, formatMoney, dollarsToCents } from '@/lib/api';
import type { MenuItem } from '@/lib/types';
import Modal from '@/components/Modal';
import { confirmDialog, promptDialog, notify } from '@/lib/dialog';

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stockQty: number;
  reorderLevel: number;
  costPerUnitCents: number;
  lowStock: boolean;
  valuationCents: number;
}
interface RecipeLine {
  id: string;
  ingredientId: string;
  quantity: number;
  ingredient: { name: string; unit: string; stockQty?: number };
}
interface Valuation {
  totalValuationCents: number;
  ingredientCount: number;
  lowStockCount: number;
}

export default function InventoryPage() {
  const [tab, setTab] = useState<'stock' | 'recipes'>('stock');
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [val, setVal] = useState<Valuation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', unit: 'g', stockQty: 0, reorderLevel: 0, costRs: '' });
  const [saving, setSaving] = useState(false);

  // recipe editor
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selMenu, setSelMenu] = useState('');
  const [recipe, setRecipe] = useState<RecipeLine[]>([]);
  const [recipeForm, setRecipeForm] = useState({ ingredientId: '', quantity: '' });

  async function load() {
    try {
      const [i, v] = await Promise.all([
        api.get<Ingredient[]>('/inventory/ingredients'),
        api.get<Valuation>('/inventory/valuation'),
      ]);
      setIngs(i);
      setVal(v);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    api.get<MenuItem[]>('/menu-items').then(setMenuItems).catch(() => {});
  }, []);

  async function loadRecipe(menuItemId: string) {
    setSelMenu(menuItemId);
    if (!menuItemId) return setRecipe([]);
    setRecipe(await api.get<RecipeLine[]>(`/inventory/recipe/${menuItemId}`));
  }

  async function addIngredient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/inventory/ingredients', {
        name: form.name.trim(),
        unit: form.unit,
        stockQty: Number(form.stockQty),
        reorderLevel: Number(form.reorderLevel),
        costPerUnitCents: form.costRs ? dollarsToCents(parseFloat(form.costRs)) : 0,
      });
      setForm({ name: '', unit: 'g', stockQty: 0, reorderLevel: 0, costRs: '' });
      setAddOpen(false);
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function movement(i: Ingredient, type: 'PURCHASE' | 'WASTAGE') {
    const qty = await promptDialog(`${type === 'PURCHASE' ? 'Add stock' : 'Log wastage'} for ${i.name} (${i.unit}):`, '', { title: type === 'PURCHASE' ? 'Add stock' : 'Log wastage' });
    if (!qty) return;
    const reason = type === 'WASTAGE' ? (await promptDialog('Reason (optional):', '', { title: 'Wastage reason' })) ?? undefined : undefined;
    try {
      await api.post(`/inventory/ingredients/${i.id}/movement`, { type, quantity: Math.abs(parseFloat(qty)), reason });
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }
  async function stockTake(i: Ingredient) {
    const counted = await promptDialog(`Physical count for ${i.name} (${i.unit}), system shows ${i.stockQty}:`, String(i.stockQty), { title: 'Stock take' });
    if (counted === null) return;
    try {
      await api.post(`/inventory/ingredients/${i.id}/stock-take`, { countedQty: parseFloat(counted) });
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }
  async function removeIngredient(i: Ingredient) {
    if (!(await confirmDialog(`Delete ${i.name}?`, { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await api.delete(`/inventory/ingredients/${i.id}`);
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function addRecipeLine(e: React.FormEvent) {
    e.preventDefault();
    if (!selMenu || !recipeForm.ingredientId || !recipeForm.quantity) return;
    try {
      await api.post('/inventory/recipe', {
        menuItemId: selMenu,
        ingredientId: recipeForm.ingredientId,
        quantity: parseFloat(recipeForm.quantity),
      });
      setRecipeForm({ ingredientId: '', quantity: '' });
      loadRecipe(selMenu);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }
  async function removeRecipeLine(id: string) {
    await api.delete(`/inventory/recipe/${id}`);
    loadRecipe(selMenu);
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory &amp; Recipes</h1>
          <p className="text-sm text-slate-500">Stock auto-deducts from recipes on every sale</p>
        </div>
        {tab === 'stock' && <button className="btn-primary" onClick={() => setAddOpen(true)}>+ Ingredient</button>}
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error} — is the API running on port 4000?</div>}

      {/* valuation stats */}
      {val && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="card p-5"><div className="text-2xl font-bold text-slate-900">{formatMoney(val.totalValuationCents)}</div><div className="text-sm text-slate-500">Stock valuation</div></div>
          <div className="card p-5"><div className="text-2xl font-bold text-slate-900">{val.ingredientCount}</div><div className="text-sm text-slate-500">Ingredients</div></div>
          <div className={`card p-5 ${val.lowStockCount > 0 ? 'border-amber-300 bg-amber-50' : ''}`}><div className="text-2xl font-bold text-slate-900">{val.lowStockCount}</div><div className="text-sm text-slate-500">Low-stock alerts</div></div>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {(['stock', 'recipes'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`badge px-3 py-1.5 ${tab === t ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {t === 'stock' ? 'Stock' : 'Recipes (BOM)'}
          </button>
        ))}
      </div>

      {tab === 'stock' ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="p-3 font-semibold">Ingredient</th>
                <th className="p-3 font-semibold">On hand</th>
                <th className="p-3 font-semibold">Reorder ≤</th>
                <th className="p-3 font-semibold">Cost/unit</th>
                <th className="p-3 font-semibold">Value</th>
                <th className="p-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ings.map((i) => (
                <tr key={i.id} className={i.lowStock ? 'bg-amber-50/50' : ''}>
                  <td className="p-3 font-medium text-slate-700">
                    {i.name}
                    {i.lowStock && <span className="badge ml-2 bg-amber-100 text-amber-700">low</span>}
                  </td>
                  <td className="p-3 text-slate-600">{i.stockQty} {i.unit}</td>
                  <td className="p-3 text-slate-400">{i.reorderLevel} {i.unit}</td>
                  <td className="p-3 text-slate-500">{formatMoney(i.costPerUnitCents)}/{i.unit}</td>
                  <td className="p-3 font-semibold text-slate-700">{formatMoney(i.valuationCents)}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <button className="rounded-md px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50" onClick={() => movement(i, 'PURCHASE')}>+ Stock</button>
                      <button className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50" onClick={() => movement(i, 'WASTAGE')}>Wastage</button>
                      <button className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100" onClick={() => stockTake(i)}>Count</button>
                      <button className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100" onClick={() => removeIngredient(i)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
              {ings.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">No ingredients yet.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card p-6">
          <label className="label">Menu item</label>
          <select className="input mb-4 max-w-sm" value={selMenu} onChange={(e) => loadRecipe(e.target.value)}>
            <option value="">Select a menu item…</option>
            {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>

          {selMenu && (
            <>
              <div className="mb-4 space-y-2">
                {recipe.length === 0 ? (
                  <p className="text-sm text-slate-400">No recipe yet — add ingredients below. They&apos;ll auto-deduct on sale.</p>
                ) : (
                  recipe.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <span><strong>{r.quantity} {r.ingredient.unit}</strong> {r.ingredient.name}</span>
                      <button className="text-xs text-red-500 hover:underline" onClick={() => removeRecipeLine(r.id)}>Remove</button>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={addRecipeLine} className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="label">Ingredient</label>
                  <select className="input" value={recipeForm.ingredientId} onChange={(e) => setRecipeForm({ ...recipeForm, ingredientId: e.target.value })} required>
                    <option value="">Select…</option>
                    {ings.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                  </select>
                </div>
                <div className="w-28">
                  <label className="label">Qty per item</label>
                  <input className="input" type="number" step="0.01" min="0" value={recipeForm.quantity} onChange={(e) => setRecipeForm({ ...recipeForm, quantity: e.target.value })} required />
                </div>
                <button className="btn-primary" type="submit">Add</button>
              </form>
            </>
          )}
        </div>
      )}

      {/* add ingredient modal */}
      <Modal open={addOpen} title="Add ingredient" onClose={() => setAddOpen(false)}>
        <form onSubmit={addIngredient} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Oat Milk" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Unit</label>
              <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option value="g">grams (g)</option>
                <option value="ml">millilitres (ml)</option>
                <option value="pcs">pieces (pcs)</option>
              </select>
            </div>
            <div>
              <label className="label">Cost per unit (Rs)</label>
              <input className="input" type="number" step="0.01" min="0" value={form.costRs} onChange={(e) => setForm({ ...form, costRs: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <label className="label">Opening stock</label>
              <input className="input" type="number" min="0" value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Reorder level</label>
              <input className="input" type="number" min="0" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

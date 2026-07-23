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
interface Warehouse {
  id: string;
  name: string;
  address?: string | null;
  isActive: boolean;
  isDefault: boolean;
  itemCount: number;
  valuationCents: number;
}
interface WarehouseStockLine {
  id: string;
  ingredientId: string;
  name: string;
  unit: string;
  qty: number;
  lowStock: boolean;
  valuationCents: number;
}

export default function InventoryPage() {
  const [tab, setTab] = useState<'stock' | 'recipes' | 'warehouses'>('stock');
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

  // warehouses
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selWarehouse, setSelWarehouse] = useState('');
  const [whStock, setWhStock] = useState<WarehouseStockLine[]>([]);
  const [whAddOpen, setWhAddOpen] = useState(false);
  const [whForm, setWhForm] = useState({ name: '', address: '' });
  const [whSaving, setWhSaving] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({ ingredientId: '', fromWarehouseId: '', toWarehouseId: '', quantity: '', reason: '' });
  const [transferSaving, setTransferSaving] = useState(false);

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
  async function loadWarehouses() {
    try {
      setWarehouses(await api.get<Warehouse[]>('/inventory/warehouses'));
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }
  useEffect(() => {
    load();
    loadWarehouses();
    api.get<MenuItem[]>('/menu-items').then(setMenuItems).catch(() => {});
  }, []);

  async function selectWarehouse(id: string) {
    setSelWarehouse(id);
    if (!id) return setWhStock([]);
    try {
      setWhStock(await api.get<WarehouseStockLine[]>(`/inventory/warehouses/${id}/stock`));
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }
  async function createWarehouseSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWhSaving(true);
    try {
      await api.post('/inventory/warehouses', { name: whForm.name.trim(), address: whForm.address.trim() || undefined });
      setWhForm({ name: '', address: '' });
      setWhAddOpen(false);
      loadWarehouses();
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setWhSaving(false);
    }
  }
  async function toggleWarehouseActive(w: Warehouse) {
    try {
      await api.patch(`/inventory/warehouses/${w.id}`, { isActive: !w.isActive });
      loadWarehouses();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }
  async function removeWarehouse(w: Warehouse) {
    if (!(await confirmDialog(`Delete ${w.name}? Any stock must be transferred out first.`, { danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await api.delete(`/inventory/warehouses/${w.id}`);
      if (selWarehouse === w.id) {
        setSelWarehouse('');
        setWhStock([]);
      }
      loadWarehouses();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }
  function openTransfer(prefill?: Partial<typeof transferForm>) {
    setTransferForm({ ingredientId: '', fromWarehouseId: selWarehouse || '', toWarehouseId: '', quantity: '', reason: '', ...prefill });
    setTransferOpen(true);
  }
  async function submitTransfer(e: React.FormEvent) {
    e.preventDefault();
    setTransferSaving(true);
    try {
      await api.post('/inventory/transfer', {
        ingredientId: transferForm.ingredientId,
        fromWarehouseId: transferForm.fromWarehouseId,
        toWarehouseId: transferForm.toWarehouseId,
        quantity: parseFloat(transferForm.quantity),
        reason: transferForm.reason.trim() || undefined,
      });
      setTransferOpen(false);
      loadWarehouses();
      if (selWarehouse) selectWarehouse(selWarehouse);
      notify('Stock transferred.', 'success');
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setTransferSaving(false);
    }
  }

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
        {tab === 'warehouses' && (
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => openTransfer()}>⇄ Transfer stock</button>
            <button className="btn-primary" onClick={() => setWhAddOpen(true)}>+ Warehouse</button>
          </div>
        )}
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
        {(['stock', 'recipes', 'warehouses'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`badge px-3 py-1.5 ${tab === t ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {t === 'stock' ? 'Stock' : t === 'recipes' ? 'Recipes (BOM)' : 'Warehouses'}
          </button>
        ))}
      </div>

      {tab === 'warehouses' ? (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-1 space-y-2">
            {warehouses.map((w) => (
              <div
                key={w.id}
                onClick={() => selectWarehouse(w.id)}
                className={`card cursor-pointer p-4 transition-colors ${selWarehouse === w.id ? 'border-brand-500 ring-1 ring-brand-500' : ''} ${!w.isActive ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-slate-800">
                      {w.name}
                      {w.isDefault && <span className="badge ml-2 bg-slate-100 text-slate-500">default</span>}
                      {!w.isActive && <span className="badge ml-2 bg-red-50 text-red-500">inactive</span>}
                    </div>
                    {w.address && <div className="text-xs text-slate-400">{w.address}</div>}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">{w.itemCount} item{w.itemCount === 1 ? '' : 's'}</span>
                  <span className="font-semibold text-slate-700">{formatMoney(w.valuationCents)}</span>
                </div>
                <div className="mt-3 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <button className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100" onClick={() => toggleWarehouseActive(w)}>
                    {w.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  {!w.isDefault && (
                    <button className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50" onClick={() => removeWarehouse(w)}>Delete</button>
                  )}
                </div>
              </div>
            ))}
            {warehouses.length === 0 && <p className="p-4 text-sm text-slate-400">No warehouses yet.</p>}
          </div>

          <div className="col-span-2">
            {selWarehouse ? (
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="p-3 font-semibold">Ingredient</th>
                      <th className="p-3 font-semibold">On hand</th>
                      <th className="p-3 font-semibold">Value</th>
                      <th className="p-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {whStock.map((r) => (
                      <tr key={r.id} className={r.lowStock ? 'bg-amber-50/50' : ''}>
                        <td className="p-3 font-medium text-slate-700">
                          {r.name}
                          {r.lowStock && <span className="badge ml-2 bg-amber-100 text-amber-700">low</span>}
                        </td>
                        <td className="p-3 text-slate-600">{r.qty} {r.unit}</td>
                        <td className="p-3 font-semibold text-slate-700">{formatMoney(r.valuationCents)}</td>
                        <td className="p-3 text-right">
                          <button
                            className="rounded-md px-2 py-1 text-xs text-brand-600 hover:bg-brand-50"
                            onClick={() => openTransfer({ ingredientId: r.ingredientId, fromWarehouseId: selWarehouse })}
                          >
                            ⇄ Transfer
                          </button>
                        </td>
                      </tr>
                    ))}
                    {whStock.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">Nothing stocked here yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card flex h-40 items-center justify-center text-sm text-slate-400">Select a warehouse to see its stock breakdown.</div>
            )}
          </div>
        </div>
      ) : tab === 'stock' ? (
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

      {/* add warehouse modal */}
      <Modal open={whAddOpen} title="Add warehouse" onClose={() => setWhAddOpen(false)}>
        <form onSubmit={createWarehouseSubmit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={whForm.name} onChange={(e) => setWhForm({ ...whForm, name: e.target.value })} placeholder="e.g. Central Kitchen" required autoFocus />
          </div>
          <div>
            <label className="label">Address (optional)</label>
            <input className="input" value={whForm.address} onChange={(e) => setWhForm({ ...whForm, address: e.target.value })} placeholder="e.g. Warehouse Rd, Kathmandu" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setWhAddOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={whSaving}>{whSaving ? 'Saving…' : 'Add'}</button>
          </div>
        </form>
      </Modal>

      {/* transfer stock modal */}
      <Modal open={transferOpen} title="Transfer stock" onClose={() => setTransferOpen(false)}>
        <form onSubmit={submitTransfer} className="space-y-4">
          <div>
            <label className="label">Ingredient</label>
            <select className="input" value={transferForm.ingredientId} onChange={(e) => setTransferForm({ ...transferForm, ingredientId: e.target.value })} required>
              <option value="">Select…</option>
              {ings.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">From</label>
              <select className="input" value={transferForm.fromWarehouseId} onChange={(e) => setTransferForm({ ...transferForm, fromWarehouseId: e.target.value })} required>
                <option value="">Select…</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">To</label>
              <select className="input" value={transferForm.toWarehouseId} onChange={(e) => setTransferForm({ ...transferForm, toWarehouseId: e.target.value })} required>
                <option value="">Select…</option>
                {warehouses.filter((w) => w.id !== transferForm.fromWarehouseId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Quantity</label>
            <input className="input" type="number" step="0.01" min="0" value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} required />
          </div>
          <div>
            <label className="label">Reason (optional)</label>
            <input className="input" value={transferForm.reason} onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })} placeholder="e.g. Restocking branch" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setTransferOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={transferSaving}>{transferSaving ? 'Transferring…' : 'Transfer'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

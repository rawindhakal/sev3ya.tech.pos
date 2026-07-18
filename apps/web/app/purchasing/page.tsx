'use client';

import { useEffect, useState } from 'react';
import { api, formatMoney, dollarsToCents } from '@/lib/api';
import Modal from '@/components/Modal';
import { notify } from '@/lib/dialog';

interface Supplier { id: string; name: string; contact?: string | null; address?: string | null; taxId?: string | null }
interface Ingredient { id: string; name: string; unit: string; costPerUnitCents: number }
interface POLine { id: string; ingredientId: string; quantity: number; receivedQty: number; unitCostCents: number; ingredient: { name: string; unit: string } }
interface PO { id: string; number: number; status: string; notes?: string | null; supplier: { name: string }; lines: POLine[]; createdAt: string }

const STATUS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  ORDERED: 'bg-blue-100 text-blue-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
};

export default function PurchasingPage() {
  const [tab, setTab] = useState<'orders' | 'suppliers'>('orders');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [supModal, setSupModal] = useState(false);
  const [supForm, setSupForm] = useState({ name: '', contact: '', address: '', taxId: '' });

  const [poModal, setPoModal] = useState(false);
  const [poSupplier, setPoSupplier] = useState('');
  const [poLines, setPoLines] = useState<{ ingredientId: string; quantity: string; costRs: string }[]>([{ ingredientId: '', quantity: '', costRs: '' }]);

  const [receivePo, setReceivePo] = useState<PO | null>(null);
  const [receipts, setReceipts] = useState<Record<string, string>>({});

  async function load() {
    try {
      const [s, i, p] = await Promise.all([
        api.get<Supplier[]>('/suppliers'),
        api.get<Ingredient[]>('/inventory/ingredients'),
        api.get<PO[]>('/purchase-orders'),
      ]);
      setSuppliers(s);
      setIngs(i);
      setPos(p);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function saveSupplier(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/suppliers', {
        name: supForm.name.trim(),
        contact: supForm.contact.trim() || undefined,
        address: supForm.address.trim() || undefined,
        taxId: supForm.taxId.trim() || undefined,
      });
      setSupForm({ name: '', contact: '', address: '', taxId: '' });
      setSupModal(false);
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function createPO(e: React.FormEvent) {
    e.preventDefault();
    const lines = poLines
      .filter((l) => l.ingredientId && l.quantity)
      .map((l) => ({ ingredientId: l.ingredientId, quantity: parseFloat(l.quantity), unitCostCents: l.costRs ? dollarsToCents(parseFloat(l.costRs)) : 0 }));
    if (!poSupplier || lines.length === 0) return notify('Pick a supplier and at least one line', 'error');
    try {
      await api.post('/purchase-orders', { supplierId: poSupplier, lines });
      setPoModal(false);
      setPoSupplier('');
      setPoLines([{ ingredientId: '', quantity: '', costRs: '' }]);
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function poAction(id: string, action: 'order' | 'cancel') {
    try {
      await api.post(`/purchase-orders/${id}/${action}`, {});
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }
  async function autoGenerate() {
    try {
      const r = await api.post<{ created: number; message?: string }>('/purchase-orders/auto-generate', {});
      notify(r.created ? `Created ${r.created} draft PO(s) from stock deficits.` : r.message ?? 'No deficits.', r.created ? 'success' : 'info');
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  function openReceive(po: PO) {
    setReceivePo(po);
    const init: Record<string, string> = {};
    po.lines.forEach((l) => (init[l.id] = String(Math.max(0, l.quantity - l.receivedQty))));
    setReceipts(init);
  }
  async function submitReceive() {
    if (!receivePo) return;
    const receiptsArr = Object.entries(receipts)
      .map(([lineId, q]) => ({ lineId, receiveQty: parseFloat(q) || 0 }))
      .filter((r) => r.receiveQty > 0);
    try {
      await api.post(`/purchase-orders/${receivePo.id}/receive`, { receipts: receiptsArr });
      setReceivePo(null);
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchasing &amp; Suppliers</h1>
          <p className="text-sm text-slate-500">Vendors, purchase orders &amp; goods receiving</p>
        </div>
        <div className="flex gap-2">
          {tab === 'orders' && <button className="btn-ghost" onClick={autoGenerate}>⚡ Auto-PO from deficits</button>}
          <button className="btn-primary" onClick={() => (tab === 'orders' ? setPoModal(true) : setSupModal(true))}>
            {tab === 'orders' ? '+ Purchase Order' : '+ Supplier'}
          </button>
        </div>
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error} — is the API running on port 4000?</div>}

      <div className="mb-4 flex gap-2">
        {(['orders', 'suppliers'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`badge px-3 py-1.5 ${tab === t ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {t === 'orders' ? 'Purchase Orders' : 'Suppliers'}
          </button>
        ))}
      </div>

      {tab === 'suppliers' ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="p-3 font-semibold">Supplier</th><th className="p-3 font-semibold">Contact</th><th className="p-3 font-semibold">Address</th><th className="p-3 font-semibold">Tax ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {suppliers.map((s) => (
                <tr key={s.id}><td className="p-3 font-medium text-slate-700">{s.name}</td><td className="p-3 text-slate-500">{s.contact ?? '—'}</td><td className="p-3 text-slate-500">{s.address ?? '—'}</td><td className="p-3 text-slate-500">{s.taxId ?? '—'}</td></tr>
              ))}
              {suppliers.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">No suppliers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {pos.length === 0 ? (
            <div className="card p-10 text-center text-slate-400">No purchase orders yet.</div>
          ) : pos.map((po) => (
            <div key={po.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-800">PO #{po.number}</span>
                  <span className="text-sm text-slate-500">{po.supplier.name}</span>
                  <span className={`badge ${STATUS[po.status]}`}>{po.status}</span>
                </div>
                <div className="flex gap-1">
                  {po.status === 'DRAFT' && <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => poAction(po.id, 'order')}>Mark Ordered</button>}
                  {(po.status === 'ORDERED' || po.status === 'PARTIAL') && <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => openReceive(po)}>Receive (GRN)</button>}
                  {po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => poAction(po.id, 'cancel')}>Cancel</button>}
                </div>
              </div>
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                {po.lines.map((l) => (
                  <div key={l.id} className="flex justify-between">
                    <span>{l.ingredient.name}</span>
                    <span className="text-slate-400">{l.receivedQty}/{l.quantity} {l.ingredient.unit} · {formatMoney(l.unitCostCents)}/{l.ingredient.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Supplier modal */}
      <Modal open={supModal} title="Add supplier" onClose={() => setSupModal(false)}>
        <form onSubmit={saveSupplier} className="space-y-4">
          <div><label className="label">Name</label><input className="input" value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} required autoFocus /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Contact</label><input className="input" value={supForm.contact} onChange={(e) => setSupForm({ ...supForm, contact: e.target.value })} /></div>
            <div><label className="label">Tax ID</label><input className="input" value={supForm.taxId} onChange={(e) => setSupForm({ ...supForm, taxId: e.target.value })} /></div>
          </div>
          <div><label className="label">Address</label><input className="input" value={supForm.address} onChange={(e) => setSupForm({ ...supForm, address: e.target.value })} /></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setSupModal(false)}>Cancel</button><button type="submit" className="btn-primary">Save</button></div>
        </form>
      </Modal>

      {/* New PO modal */}
      <Modal open={poModal} title="New purchase order" onClose={() => setPoModal(false)}>
        <form onSubmit={createPO} className="space-y-4">
          <div>
            <label className="label">Supplier</label>
            <select className="input" value={poSupplier} onChange={(e) => setPoSupplier(e.target.value)} required>
              <option value="">Select…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Items</label>
            <div className="space-y-2">
              {poLines.map((l, idx) => (
                <div key={idx} className="flex gap-2">
                  <select className="input flex-1" value={l.ingredientId} onChange={(e) => setPoLines((p) => p.map((x, i) => i === idx ? { ...x, ingredientId: e.target.value } : x))}>
                    <option value="">Ingredient…</option>
                    {ings.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                  </select>
                  <input className="input w-24" type="number" min="0" placeholder="Qty" value={l.quantity} onChange={(e) => setPoLines((p) => p.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} />
                  <input className="input w-28" type="number" step="0.01" min="0" placeholder="Cost/unit Rs" value={l.costRs} onChange={(e) => setPoLines((p) => p.map((x, i) => i === idx ? { ...x, costRs: e.target.value } : x))} />
                </div>
              ))}
            </div>
            <button type="button" className="mt-2 text-xs text-brand-600 hover:underline" onClick={() => setPoLines((p) => [...p, { ingredientId: '', quantity: '', costRs: '' }])}>+ Add line</button>
          </div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setPoModal(false)}>Cancel</button><button type="submit" className="btn-primary">Create PO</button></div>
        </form>
      </Modal>

      {/* Receive (GRN) modal */}
      <Modal open={!!receivePo} title={`Receive PO #${receivePo?.number ?? ''}`} onClose={() => setReceivePo(null)}>
        {receivePo && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Enter received quantities (partial deliveries keep the PO open).</p>
            <div className="space-y-2">
              {receivePo.lines.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="flex-1">{l.ingredient.name}<span className="text-slate-400"> · {l.receivedQty}/{l.quantity} {l.ingredient.unit} received</span></span>
                  <input className="input w-24" type="number" min="0" value={receipts[l.id] ?? ''} onChange={(e) => setReceipts((r) => ({ ...r, [l.id]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setReceivePo(null)}>Cancel</button><button className="btn-primary" onClick={submitReceive}>Receive &amp; add to stock</button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

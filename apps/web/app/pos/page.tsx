'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, formatMoney } from '@/lib/api';
import type {
  Category,
  MenuItem,
  ModifierGroup,
  Order,
  OrderType,
  PaymentMethod,
  RestaurantTable,
  Settings,
  TableArea,
  Waiter,
} from '@/lib/types';
import { priceForType } from '@/lib/types';
import Modal from '@/components/Modal';
import Receipt from '@/components/Receipt';
import PaymentPanel from '@/components/PaymentPanel';

type Step = 'type' | 'table' | 'order';

interface CartLine {
  key: string;
  menuItemId?: string; // absent for open (custom) items
  name: string;
  unitPriceCents: number;
  modifiers: { name: string; priceCents: number }[];
  quantity: number;
}

const lineKey = (id: string, mods: { name: string }[]) =>
  id + '::' + mods.map((m) => m.name).sort().join(',');

export default function PosPage() {
  const [step, setStep] = useState<Step>('type');
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [settings, setSettings] = useState<Settings | null>(null);

  // reference data
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [areas, setAreas] = useState<TableArea[]>([]);

  // order context
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [waiterId, setWaiterId] = useState<string>('');
  const [guestCount, setGuestCount] = useState(2);
  const [order, setOrder] = useState<Order | null>(null);

  // cart + menu ui
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(''); // order-level discount in rupees
  const [activeCat, setActiveCat] = useState('all');
  const [search, setSearch] = useState('');

  // held tickets (resume) + open item (custom line)
  const [held, setHeld] = useState<Order[]>([]);
  const [openItem, setOpenItem] = useState<{ name: string; price: string } | null>(null);

  // modifier picker
  const [picker, setPicker] = useState<{ item: MenuItem; groups: ModifierGroup[] } | null>(null);
  const [pickSel, setPickSel] = useState<Record<string, string[]>>({});

  // payment
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // receipt for printing
  const [receipt, setReceipt] = useState<{ order: Order; mode: 'KOT' | 'BILL' } | null>(null);

  useEffect(() => {
    api.get<Settings>('/settings').then(setSettings).catch(() => {});
    api.get<Category[]>('/categories').then(setCategories).catch(() => {});
    api.get<MenuItem[]>('/menu-items').then(setItems).catch(() => {});
    api.get<Waiter[]>('/waiters').then(setWaiters).catch(() => {});
  }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  const vatRate = settings?.vatRate ?? 0.13;
  const serviceChargeRate = settings?.serviceChargeRate ?? 0;
  const totals = useMemo(() => {
    let subtotal = 0;
    let count = 0;
    for (const l of cart) {
      const mod = l.modifiers.reduce((s, m) => s + m.priceCents, 0);
      subtotal += (l.unitPriceCents + mod) * l.quantity;
      count += l.quantity;
    }
    // Mirrors the server (common/settings.ts): subtotal − discount →
    // + service charge → + VAT.
    const discountCents = Math.min(subtotal, Math.round((parseFloat(discount) || 0) * 100));
    const taxable = subtotal - discountCents;
    const serviceCharge = Math.round(taxable * serviceChargeRate);
    const tax = Math.round((taxable + serviceCharge) * vatRate);
    return { count, subtotal, discountCents, serviceCharge, tax, total: taxable + serviceCharge + tax };
  }, [cart, vatRate, serviceChargeRate, discount]);

  const filteredItems = useMemo(() => {
    let list = items.filter((i) => i.isAvailable);
    if (activeCat !== 'all') list = list.filter((i) => i.categoryId === activeCat);
    if (search.trim())
      list = list.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [items, activeCat, search]);

  // ── Flow navigation ────────────────────────────────
  async function chooseType(type: OrderType) {
    setOrderType(type);
    if (type === 'DINE_IN') {
      const data = await api.get<TableArea[]>('/tables?groupBy=area');
      setAreas(data);
      setStep('table');
    } else {
      await startOrder(type, null);
    }
  }

  // Hold & resume tickets (matrix #4): open drafts are "held" — load one back
  // into the POS to keep serving it.
  async function loadHeld() {
    try {
      const all = await api.get<Order[]>('/orders');
      setHeld(all.filter((o) => ['OPEN', 'SENT_TO_KITCHEN', 'BILLED'].includes(o.status)));
    } catch {
      /* ignore */
    }
  }

  function resume(o: Order) {
    setOrder(o);
    setOrderType(o.type);
    setTable(o.table ? ({ id: o.table.id, name: o.table.name } as RestaurantTable) : null);
    setWaiterId(o.waiterId ?? '');
    setGuestCount(o.guestCount);
    setDiscount(o.discountCents ? (o.discountCents / 100).toFixed(2) : '');
    setCart(
      o.items.map((it) => ({
        key: lineKey(it.menuItemId ?? it.nameSnapshot, it.modifiers ?? []),
        menuItemId: it.menuItemId ?? undefined,
        name: it.nameSnapshot,
        unitPriceCents: it.unitPriceCents,
        modifiers: (it.modifiers ?? []).map((m) => ({ name: m.name, priceCents: m.priceCents })),
        quantity: it.quantity,
      })),
    );
    setStep('order');
  }

  useEffect(() => {
    if (step === 'type') loadHeld();
  }, [step]);

  async function startOrder(type: OrderType, tbl: RestaurantTable | null) {
    setBusy(true);
    try {
      const created = await api.post<Order>('/orders', {
        type,
        tableId: tbl?.id,
        waiterId: waiterId || undefined,
        guestCount,
      });
      setOrder(created);
      setTable(tbl);
      setCart([]);
      setStep('order');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ── Cart ───────────────────────────────────────────
  async function clickItem(item: MenuItem) {
    if (item.modifierGroups && item.modifierGroups.length > 0) {
      const detail = await api.get<{ modifierGroups: ModifierGroup[] }>(`/menu-items/${item.id}`);
      setPickSel({});
      setPicker({ item, groups: detail.modifierGroups });
    } else {
      addLine(item, []);
    }
  }

  function addLine(item: MenuItem, mods: { name: string; priceCents: number }[]) {
    setCart((prev) => {
      const key = lineKey(item.id, mods);
      const existing = prev.find((l) => l.key === key);
      if (existing)
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...prev,
        {
          key,
          menuItemId: item.id,
          name: item.name,
          unitPriceCents: priceForType(item, orderType), // tier price (#15)
          modifiers: mods,
          quantity: 1,
        },
      ];
    });
  }

  // Open item: a custom name/price line not on the menu (matrix #16).
  function addOpenItem() {
    if (!openItem) return;
    const priceCents = Math.round((parseFloat(openItem.price) || 0) * 100);
    if (!openItem.name.trim() || priceCents <= 0) {
      flash('Enter a name and a price above zero');
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        key: `open::${openItem.name}::${priceCents}::${Date.now()}`,
        name: openItem.name.trim(),
        unitPriceCents: priceCents,
        modifiers: [],
        quantity: 1,
      },
    ]);
    setOpenItem(null);
  }

  function confirmPicker() {
    if (!picker) return;
    const mods: { name: string; priceCents: number }[] = [];
    for (const g of picker.groups) {
      const chosen = pickSel[g.id] ?? [];
      for (const mid of chosen) {
        const m = g.modifiers.find((x) => x.id === mid);
        if (m) mods.push({ name: m.name, priceCents: m.priceCents });
      }
    }
    addLine(picker.item, mods);
    setPicker(null);
  }

  function changeQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  // ── Persist + actions ──────────────────────────────
  async function persistCart(): Promise<Order> {
    if (!order) throw new Error('No active order');
    const saved = await api.put<Order>(`/orders/${order.id}/cart`, {
      items: cart.map((l) =>
        l.menuItemId
          ? { menuItemId: l.menuItemId, quantity: l.quantity, modifiers: l.modifiers }
          : { name: l.name, unitPriceCents: l.unitPriceCents, quantity: l.quantity, modifiers: l.modifiers },
      ),
      discountCents: totals.discountCents,
      waiterId: waiterId || undefined,
      guestCount,
    });
    setOrder(saved);
    return saved;
  }

  function doPrint(o: Order, mode: 'KOT' | 'BILL') {
    setReceipt({ order: o, mode });
    setTimeout(() => window.print(), 150);
  }

  async function runAction(
    kind:
      | 'draft'
      | 'kot'
      | 'kot_print'
      | 'kot_bill_print_pay'
      | 'bill'
      | 'bill_pay'
      | 'bill_print',
  ) {
    if (cart.length === 0) {
      flash('Add at least one item first');
      return;
    }
    setBusy(true);
    try {
      let current = await persistCart();
      const id = current.id;
      const kot = async () => (current = await api.post<Order>(`/orders/${id}/kot`, {}));
      const bill = async () => (current = await api.post<Order>(`/orders/${id}/bill`, {}));

      switch (kind) {
        case 'draft':
          flash(`Order #${current.number} saved to draft`);
          break;
        case 'kot':
          await kot();
          flash(`KOT sent for order #${current.number}`);
          break;
        case 'kot_print':
          await kot();
          doPrint(current, 'KOT');
          flash('KOT sent & printed');
          break;
        case 'bill':
          await bill();
          flash(`Bill generated for #${current.number}`);
          break;
        case 'bill_print':
          await bill();
          doPrint(current, 'BILL');
          flash('Bill printed');
          break;
        case 'bill_pay':
          await bill();
          setOrder(current);
          setPayOpen(true);
          break;
        case 'kot_bill_print_pay':
          await kot();
          await bill();
          doPrint(current, 'BILL');
          setOrder(current);
          setPayOpen(true);
          break;
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmPayment(
    payments: { method: PaymentMethod; amountCents: number }[],
  ) {
    if (!order) return;
    setBusy(true);
    try {
      await api.post(`/orders/${order.id}/pay`, { payments });
      setPayOpen(false);
      flash(`Order #${order.number} paid ✓`);
      resetToStart();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function resetToStart() {
    setStep('type');
    setOrder(null);
    setTable(null);
    setCart([]);
    setDiscount('');
    setActiveCat('all');
    setSearch('');
  }

  async function cancelOrder() {
    if (!order) {
      resetToStart();
      return;
    }
    // Voiding an order that already has items needs an audited reason (#10).
    let reason: string | undefined;
    if (cart.length > 0) {
      const r = prompt('Reason for voiding this order?');
      if (r === null) return; // cancelled the prompt
      if (!r.trim()) {
        flash('A reason is required to void an order with items');
        return;
      }
      reason = r.trim();
    } else if (!confirm('Discard this empty order?')) {
      return;
    }
    try {
      await api.delete(`/orders/${order.id}`, reason ? { reason } : undefined);
    } catch (e) {
      alert((e as Error).message);
      return;
    }
    resetToStart();
  }

  // ── Render ─────────────────────────────────────────
  return (
    <div className="relative h-full">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* STEP 1: order type popup */}
      <Modal open={step === 'type'} title="Start a new order" onClose={() => {}}>
        <p className="mb-4 text-sm text-slate-500">Choose the order type</p>
        <div className="grid grid-cols-3 gap-3">
          {([
            { t: 'DINE_IN', label: 'Dine In', icon: '🍽️' },
            { t: 'TAKEAWAY', label: 'Pickup', icon: '🥡' },
            { t: 'DELIVERY', label: 'Delivery', icon: '🛵' },
          ] as const).map((o) => (
            <button
              key={o.t}
              onClick={() => chooseType(o.t)}
              disabled={busy}
              className="flex flex-col items-center gap-2 rounded-xl border-2 border-slate-200 p-6 transition-colors hover:border-brand-400 hover:bg-brand-50"
            >
              <span className="text-3xl">{o.icon}</span>
              <span className="font-semibold text-slate-700">{o.label}</span>
            </button>
          ))}
        </div>

        {held.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Held tickets ({held.length}) — tap to resume
            </p>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {held.map((o) => (
                <button
                  key={o.id}
                  onClick={() => resume(o)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span>
                    <span className="font-semibold text-slate-700">#{o.number}</span>{' '}
                    <span className="text-slate-400">
                      {o.type.replace('_', ' ')}
                      {o.table ? ` · ${o.table.name}` : ''} · {o.items.length} items
                    </span>
                  </span>
                  <span className="badge bg-amber-100 text-amber-700">{o.status.replace('_', ' ')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* STEP 2: table selection */}
      {step === 'table' && (
        <div className="mx-auto max-w-5xl p-8">
          <header className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Select a table</h1>
              <p className="text-sm text-slate-500">Dine-in · pick an available table</p>
            </div>
            <button className="btn-ghost" onClick={resetToStart}>
              ← Back
            </button>
          </header>

          <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <label className="label">Waiter</label>
              <select className="input w-44" value={waiterId} onChange={(e) => setWaiterId(e.target.value)}>
                <option value="">Unassigned</option>
                {waiters.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Guests</label>
              <input
                type="number"
                min={1}
                className="input w-24"
                value={guestCount}
                onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value)))}
              />
            </div>
          </div>

          {areas.map((a) => (
            <div key={a.area} className="mb-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{a.area}</h2>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {a.tables.map((t) => {
                  const free = t.status === 'AVAILABLE';
                  return (
                    <button
                      key={t.id}
                      disabled={!free || busy}
                      onClick={() => startOrder('DINE_IN', t)}
                      className={`flex aspect-square flex-col items-center justify-center rounded-xl border-2 transition-colors ${
                        free
                          ? 'border-slate-200 bg-white hover:border-brand-400 hover:bg-brand-50'
                          : 'cursor-not-allowed border-transparent bg-amber-50'
                      }`}
                    >
                      <span className="text-lg font-bold text-slate-800">{t.name}</span>
                      <span className="text-xs text-slate-400">{t.seats} seats</span>
                      <span className={`badge mt-1 ${free ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {free ? 'Free' : 'Busy'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* STEP 3: ordering screen */}
      {step === 'order' && (
        <div className="flex h-full">
          {/* menu */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-3">
                <button className="btn-ghost px-3 py-1.5 text-xs" onClick={cancelOrder}>
                  ✕ Cancel
                </button>
                <span className="badge bg-brand-50 text-brand-700">
                  {orderType.replace('_', ' ')}
                  {table ? ` · ${table.name}` : ''}
                </span>
                <input
                  className="input ml-auto max-w-xs"
                  placeholder="🔍 Search items…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button
                  className="btn-ghost whitespace-nowrap px-3 py-1.5 text-xs"
                  onClick={() => setOpenItem({ name: '', price: '' })}
                >
                  + Custom item
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveCat('all')}
                  className={`badge px-3 py-1.5 ${activeCat === 'all' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  All
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveCat(c.id)}
                    className={`badge px-3 py-1.5 ${activeCat === c.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 lg:grid-cols-4">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => clickItem(item)}
                  className="card flex flex-col items-start p-3 text-left transition-shadow hover:shadow-md"
                >
                  <span className="font-medium text-slate-800">{item.name}</span>
                  <span className="mt-1 font-bold text-brand-700">{formatMoney(priceForType(item, orderType))}</span>
                  {item.modifierGroups && item.modifierGroups.length > 0 && (
                    <span className="badge mt-1 bg-slate-100 text-slate-400">options</span>
                  )}
                </button>
              ))}
              {filteredItems.length === 0 && (
                <p className="col-span-full py-10 text-center text-sm text-slate-400">No items found</p>
              )}
            </div>
          </div>

          {/* cart / bill */}
          <aside className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-800">
                  Order {order ? `#${order.number}` : ''}
                </h2>
                <select
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                  value={waiterId}
                  onChange={(e) => setWaiterId(e.target.value)}
                >
                  <option value="">No waiter</option>
                  {waiters.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {cart.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">Tap items to add them</p>
              ) : (
                <ul className="space-y-3">
                  {cart.map((l) => {
                    const mod = l.modifiers.reduce((s, m) => s + m.priceCents, 0);
                    return (
                      <li key={l.key} className="flex items-start gap-2">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-800">{l.name}</div>
                          {l.modifiers.length > 0 && (
                            <div className="text-xs text-slate-400">
                              {l.modifiers.map((m) => m.name).join(', ')}
                            </div>
                          )}
                          <div className="text-xs text-slate-500">
                            {formatMoney(l.unitPriceCents + mod)} each
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => changeQty(l.key, -1)}
                            className="h-6 w-6 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
                          >
                            −
                          </button>
                          <span className="w-5 text-center text-sm font-semibold">{l.quantity}</span>
                          <button
                            onClick={() => changeQty(l.key, 1)}
                            className="h-6 w-6 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
                          >
                            +
                          </button>
                        </div>
                        <div className="w-16 text-right text-sm font-semibold text-slate-800">
                          {formatMoney((l.unitPriceCents + mod) * l.quantity)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* totals */}
            <div className="border-t border-slate-100 p-4">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Items</span>
                  <span>{totals.count}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Sub Total</span>
                  <span>{formatMoney(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Discount (Rs)</span>
                  <input
                    type="number"
                    min={0}
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0"
                    className="w-24 rounded-md border border-slate-200 px-2 py-1 text-right text-sm"
                  />
                </div>
                {totals.discountCents > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount applied</span>
                    <span>−{formatMoney(totals.discountCents)}</span>
                  </div>
                )}
                {serviceChargeRate > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Service charge ({Math.round(serviceChargeRate * 100)}%)</span>
                    <span>{formatMoney(totals.serviceCharge)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500">
                  <span>VAT ({Math.round(vatRate * 100)}%)</span>
                  <span>{formatMoney(totals.tax)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-1.5 text-base font-bold text-slate-900">
                  <span>TOTAL</span>
                  <span>{formatMoney(totals.total)}</span>
                </div>
              </div>

              {/* action buttons */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="btn-ghost text-xs" disabled={busy} onClick={() => runAction('draft')}>
                  Save Draft
                </button>
                <button className="btn-ghost text-xs" disabled={busy} onClick={() => runAction('kot')}>
                  KOT
                </button>
                <button className="btn-ghost text-xs" disabled={busy} onClick={() => runAction('kot_print')}>
                  KOT &amp; Print
                </button>
                <button className="btn-ghost text-xs" disabled={busy} onClick={() => runAction('bill')}>
                  Bill
                </button>
                <button className="btn-ghost text-xs" disabled={busy} onClick={() => runAction('bill_print')}>
                  Bill &amp; Print
                </button>
                <button className="btn-primary text-xs" disabled={busy} onClick={() => runAction('bill_pay')}>
                  Bill &amp; Pay
                </button>
                <button
                  className="btn-primary col-span-2 text-xs"
                  disabled={busy}
                  onClick={() => runAction('kot_bill_print_pay')}
                >
                  KOT · Bill · Print &amp; Pay
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* modifier picker */}
      <Modal open={!!picker} title={picker ? `Options · ${picker.item.name}` : ''} onClose={() => setPicker(null)}>
        {picker && (
          <div className="space-y-4">
            {picker.groups.map((g) => {
              const single = g.maxSelect === 1;
              const sel = pickSel[g.id] ?? [];
              return (
                <div key={g.id}>
                  <div className="label">
                    {g.name}{' '}
                    <span className="text-slate-400">
                      (select {g.minSelect}–{g.maxSelect})
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {g.modifiers.map((m) => {
                      const checked = sel.includes(m.id);
                      return (
                        <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                          <input
                            type={single ? 'radio' : 'checkbox'}
                            name={g.id}
                            checked={checked}
                            onChange={() => {
                              setPickSel((prev) => {
                                const cur = prev[g.id] ?? [];
                                if (single) return { ...prev, [g.id]: [m.id] };
                                if (cur.includes(m.id))
                                  return { ...prev, [g.id]: cur.filter((x) => x !== m.id) };
                                if (cur.length >= g.maxSelect) return prev;
                                return { ...prev, [g.id]: [...cur, m.id] };
                              });
                            }}
                          />
                          <span className="flex-1">{m.name}</span>
                          {m.priceCents > 0 && (
                            <span className="text-brand-600">+{formatMoney(m.priceCents)}</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setPicker(null)}>Cancel</button>
              <button className="btn-primary" onClick={confirmPicker}>Add to order</button>
            </div>
          </div>
        )}
      </Modal>

      {/* open (custom) item modal */}
      <Modal open={!!openItem} title="Custom item" onClose={() => setOpenItem(null)}>
        {openItem && (
          <div className="space-y-4">
            <div>
              <label className="label">Item name</label>
              <input
                className="input"
                value={openItem.name}
                onChange={(e) => setOpenItem({ ...openItem, name: e.target.value })}
                placeholder="e.g. Special of the day"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Price (Rs)</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={openItem.price}
                onChange={(e) => setOpenItem({ ...openItem, price: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setOpenItem(null)}>Cancel</button>
              <button className="btn-primary" onClick={addOpenItem}>Add to order</button>
            </div>
          </div>
        )}
      </Modal>

      {/* payment modal — split-tender settlement */}
      <Modal open={payOpen} title="Take payment" onClose={() => setPayOpen(false)}>
        {order && (
          <PaymentPanel
            totalCents={order.totalCents}
            busy={busy}
            onCancel={() => setPayOpen(false)}
            onConfirm={confirmPayment}
          />
        )}
      </Modal>

      {/* off-screen printable receipt */}
      <Receipt order={receipt?.order ?? null} settings={settings} mode={receipt?.mode ?? 'BILL'} />
    </div>
  );
}

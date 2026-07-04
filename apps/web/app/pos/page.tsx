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

// Order modes per design spec §2.1. Quick-Bill maps to a TAKEAWAY order with
// an express settle path.
type ModeKey = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'QUICK';
const MODES: { key: ModeKey; label: string; icon: string }[] = [
  { key: 'DINE_IN', label: 'Dine-In', icon: '🍽️' },
  { key: 'TAKEAWAY', label: 'Takeaway', icon: '🥡' },
  { key: 'DELIVERY', label: 'Home Delivery', icon: '🛵' },
  { key: 'QUICK', label: 'Quick-Bill', icon: '⚡' },
];

interface CartLine {
  key: string;
  menuItemId?: string;
  name: string;
  unitPriceCents: number;
  modifiers: { name: string; priceCents: number }[];
  quantity: number;
}

const lineKey = (id: string, mods: { name: string }[]) =>
  id + '::' + mods.map((m) => m.name).sort().join(',');

// Match by substring OR word-initials ("CB" → "Chicken Burger"). (spec §2.2)
function matchesQuery(name: string, q: string) {
  const s = q.toLowerCase().trim();
  if (!s) return true;
  const lower = name.toLowerCase();
  if (lower.includes(s)) return true;
  const initials = name.split(/\s+/).map((w) => w[0]?.toLowerCase() ?? '').join('');
  return initials.startsWith(s);
}

export default function PosPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [now, setNow] = useState(new Date());

  // active order context
  const [mode, setMode] = useState<ModeKey | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [waiterId, setWaiterId] = useState('');
  const [guestCount, setGuestCount] = useState(2);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState('');
  const [isQuick, setIsQuick] = useState(false);

  // capture overlays
  const [overlay, setOverlay] = useState<null | 'table' | 'customer'>(null);
  const [areas, setAreas] = useState<TableArea[]>([]);
  const [cust, setCust] = useState({ name: '', phone: '' });

  // menu ui
  const [activeCat, setActiveCat] = useState('all');
  const [search, setSearch] = useState('');

  // modifier picker / open item / held / payment
  const [picker, setPicker] = useState<{ item: MenuItem; groups: ModifierGroup[] } | null>(null);
  const [pickSel, setPickSel] = useState<Record<string, string[]>>({});
  const [openItem, setOpenItem] = useState<{ name: string; price: string } | null>(null);
  const [held, setHeld] = useState<Order[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ order: Order; mode: 'KOT' | 'BILL' } | null>(null);

  useEffect(() => {
    api.get<Settings>('/settings').then(setSettings).catch(() => {});
    api.get<Category[]>('/categories').then(setCategories).catch(() => {});
    api.get<MenuItem[]>('/menu-items').then(setItems).catch(() => {});
    api.get<Waiter[]>('/waiters').then(setWaiters).catch(() => {});
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!order) loadHeld();
  }, [order]);

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
    const discountCents = Math.min(subtotal, Math.round((parseFloat(discount) || 0) * 100));
    const taxable = subtotal - discountCents;
    const serviceCharge = Math.round(taxable * serviceChargeRate);
    const tax = Math.round((taxable + serviceCharge) * vatRate);
    return { count, subtotal, discountCents, serviceCharge, tax, total: taxable + serviceCharge + tax };
  }, [cart, vatRate, serviceChargeRate, discount]);

  const orderType: OrderType = mode === 'DELIVERY' ? 'DELIVERY' : mode === 'DINE_IN' ? 'DINE_IN' : 'TAKEAWAY';

  const filteredItems = useMemo(() => {
    let list = items.filter((i) => i.isAvailable);
    if (activeCat !== 'all') list = list.filter((i) => i.categoryId === activeCat);
    if (search.trim()) list = list.filter((i) => matchesQuery(i.name, search));
    return list;
  }, [items, activeCat, search]);

  async function loadHeld() {
    try {
      const all = await api.get<Order[]>('/orders');
      setHeld(all.filter((o) => ['OPEN', 'SENT_TO_KITCHEN', 'BILLED'].includes(o.status)));
    } catch {
      /* ignore */
    }
  }

  // ── Mode selection ─────────────────────────────────
  async function selectMode(key: ModeKey) {
    if (order) return; // finish/clear current order first
    setMode(key);
    if (key === 'DINE_IN') {
      // Show the floor inline in the terminal (no separate page/modal).
      const data = await api.get<TableArea[]>('/tables?groupBy=area');
      setAreas(data);
    } else if (key === 'QUICK') {
      startOrder('TAKEAWAY', null, true);
    } else {
      setCust({ name: '', phone: '' });
      setOverlay('customer');
    }
  }

  async function startOrder(type: OrderType, tbl: RestaurantTable | null, quick = false, customer?: { name: string; phone: string }) {
    setBusy(true);
    try {
      const created = await api.post<Order>('/orders', {
        type,
        tableId: tbl?.id,
        waiterId: waiterId || undefined,
        guestCount,
        customerName: customer?.name || undefined,
        customerPhone: customer?.phone || undefined,
      });
      setOrder(created);
      setTable(tbl);
      setIsQuick(quick);
      setCart([]);
      setDiscount('');
      setOverlay(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function resume(o: Order) {
    setMode(o.type === 'DELIVERY' ? 'DELIVERY' : o.type === 'DINE_IN' ? 'DINE_IN' : 'TAKEAWAY');
    setOrder(o);
    setTable(o.table ? ({ id: o.table.id, name: o.table.name } as RestaurantTable) : null);
    setWaiterId(o.waiterId ?? '');
    setGuestCount(o.guestCount);
    setDiscount(o.discountCents ? (o.discountCents / 100).toFixed(2) : '');
    setIsQuick(false);
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
      if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { key, menuItemId: item.id, name: item.name, unitPriceCents: priceForType(item, orderType), modifiers: mods, quantity: 1 }];
    });
  }

  function addOpenItem() {
    if (!openItem) return;
    const priceCents = Math.round((parseFloat(openItem.price) || 0) * 100);
    if (!openItem.name.trim() || priceCents <= 0) return flash('Enter a name and price above zero');
    setCart((prev) => [...prev, { key: `open::${openItem.name}::${Date.now()}`, name: openItem.name.trim(), unitPriceCents: priceCents, modifiers: [], quantity: 1 }]);
    setOpenItem(null);
  }

  function confirmPicker() {
    if (!picker) return;
    const mods: { name: string; priceCents: number }[] = [];
    for (const g of picker.groups) for (const mid of pickSel[g.id] ?? []) {
      const m = g.modifiers.find((x) => x.id === mid);
      if (m) mods.push({ name: m.name, priceCents: m.priceCents });
    }
    addLine(picker.item, mods);
    setPicker(null);
  }

  function changeQty(key: string, delta: number) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0));
  }

  // ── Persist + actions ──────────────────────────────
  async function persistCart(): Promise<Order> {
    if (!order) throw new Error('No active order');
    const saved = await api.put<Order>(`/orders/${order.id}/cart`, {
      items: cart.map((l) => (l.menuItemId ? { menuItemId: l.menuItemId, quantity: l.quantity, modifiers: l.modifiers } : { name: l.name, unitPriceCents: l.unitPriceCents, quantity: l.quantity, modifiers: l.modifiers })),
      discountCents: totals.discountCents,
      waiterId: waiterId || undefined,
      guestCount,
    });
    setOrder(saved);
    return saved;
  }

  function doPrint(o: Order, m: 'KOT' | 'BILL') {
    setReceipt({ order: o, mode: m });
    setTimeout(() => window.print(), 150);
  }

  async function runAction(kind: 'draft' | 'kot' | 'kot_print' | 'bill' | 'bill_print' | 'pay') {
    if (cart.length === 0) return flash('Add at least one item first');
    setBusy(true);
    try {
      let current = await persistCart();
      const id = current.id;
      const kot = async () => (current = await api.post<Order>(`/orders/${id}/kot`, {}));
      const bill = async () => (current = await api.post<Order>(`/orders/${id}/bill`, {}));
      switch (kind) {
        case 'draft': flash(`Order #${current.number} held`); break;
        case 'kot': await kot(); flash(`KOT fired for #${current.number}`); break;
        case 'kot_print': await kot(); doPrint(current, 'KOT'); flash('KOT fired & printed'); break;
        case 'bill': await bill(); flash(`Bill generated #${current.number}`); break;
        case 'bill_print': await bill(); doPrint(current, 'BILL'); break;
        case 'pay': await bill(); setOrder(current); setPayOpen(true); break;
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmPayment(payments: { method: PaymentMethod; amountCents: number }[]) {
    if (!order) return;
    setBusy(true);
    try {
      await api.post(`/orders/${order.id}/pay`, { payments });
      setPayOpen(false);
      flash(`Order #${order.number} settled ✓`);
      resetTerminal();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function resetTerminal() {
    setMode(null);
    setOrder(null);
    setTable(null);
    setCart([]);
    setDiscount('');
    setIsQuick(false);
    setActiveCat('all');
    setSearch('');
  }

  async function voidBasket() {
    if (!order) return resetTerminal();
    let reason: string | undefined;
    if (cart.length > 0) {
      const r = prompt('Reason for voiding this order?');
      if (r === null) return;
      if (!r.trim()) return flash('A reason is required to void');
      reason = r.trim();
    }
    try {
      await api.delete(`/orders/${order.id}`, reason ? { reason } : undefined);
    } catch (e) {
      alert((e as Error).message);
      return;
    }
    resetTerminal();
  }

  const custLabel = order?.customerName ? `${order.customerName}${order.customerPhone ? ` · ${order.customerPhone}` : ''}` : null;

  // ── Render ─────────────────────────────────────────
  return (
    <div className="flex h-full flex-col bg-[#1A1A1A] text-white">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#2ECC71] px-4 py-2 text-sm font-medium text-black shadow-lg">
          {toast}
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#111] px-5 py-2.5 text-sm">
        <div className="flex items-center gap-3">
          <span className="text-lg">🍰</span>
          <span className="font-bold tracking-wide">POS TERMINAL</span>
          <span className="text-white/40">·</span>
          <span className="text-white/60">USER: Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[#2ECC71]">
            <span className="h-2 w-2 rounded-full bg-[#2ECC71]" /> ONLINE
          </span>
          <span className="text-white/60 tabular-nums">
            {now.toLocaleDateString()} {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <a href="/settings" className="text-white/60 hover:text-white">⚙ Settings</a>
        </div>
      </div>

      {/* Order modes */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#161616] px-4 py-2.5">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-white/40">Order Mode</span>
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              disabled={!!order && !active}
              onClick={() => selectMode(m.key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                active ? 'bg-[#2ECC71] text-black' : 'bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-30'
              }`}
            >
              {m.icon} {m.label}
            </button>
          );
        })}
        {order && (
          <button onClick={voidBasket} className="ml-auto rounded-lg bg-[#E74C3C]/15 px-4 py-2 text-sm font-semibold text-[#E74C3C] hover:bg-[#E74C3C]/25">
            ✕ Void Basket
          </button>
        )}
      </div>

      {/* Body */}
      {!order && mode === 'DINE_IN' ? (
        // Inline table floor for Dine-In (rendered in the terminal itself).
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
          <div className="mb-4 flex items-center gap-4">
            <h2 className="text-lg font-bold">Select a table</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-white/40">Waiter</span>
              <select className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm" value={waiterId} onChange={(e) => setWaiterId(e.target.value)}>
                <option value="" className="text-black">Unassigned</option>
                {waiters.map((w) => <option key={w.id} value={w.id} className="text-black">{w.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-white/40">Guests</span>
              <input type="number" min={1} className="w-16 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm" value={guestCount} onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value)))} />
            </div>
            <button onClick={resetTerminal} className="ml-auto text-sm text-white/50 hover:text-white">← Back</button>
          </div>
          {areas.map((a) => (
            <div key={a.area} className="mb-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">{a.area}</div>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
                {a.tables.map((t) => {
                  const free = t.status === 'AVAILABLE';
                  const cls = free
                    ? 'border-[#2ECC71]/40 bg-[#2ECC71]/10 hover:border-[#2ECC71] hover:bg-[#2ECC71]/20'
                    : t.status === 'RESERVED'
                      ? 'border-indigo-400/40 bg-indigo-400/10 cursor-not-allowed'
                      : 'border-[#F39C12]/40 bg-[#F39C12]/10 cursor-not-allowed';
                  return (
                    <button
                      key={t.id}
                      disabled={!free || busy}
                      onClick={() => startOrder('DINE_IN', t)}
                      className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border-2 ${cls}`}
                    >
                      {t.isVip && <span className="absolute right-1 top-1 text-[10px]">⭐</span>}
                      <span className="text-base font-bold">{t.name}</span>
                      <span className="text-[10px] text-white/50">{t.seats} seats</span>
                      <span className="mt-1 text-[9px] uppercase tracking-wide text-white/40">{t.status}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : !order ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="text-white/40">
            <div className="mb-2 text-5xl">🧾</div>
            <p className="text-lg font-medium">Select an order mode to begin</p>
            <p className="text-sm text-white/30">Dine-In · Takeaway · Home Delivery · Quick-Bill</p>
          </div>
          {held.length > 0 && (
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-4 text-left">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Held tickets — tap to resume</p>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {held.map((o) => (
                  <button key={o.id} onClick={() => resume(o)} className="flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
                    <span>#{o.number} · {o.type.replace('_', ' ')}{o.table ? ` · ${o.table.name}` : ''} · {o.items.length} items</span>
                    <span className="text-[#F39C12]">{o.status.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Menu / grid area */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-white/10 p-3">
              <div className="mb-2 flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#2ECC71]"
                  placeholder="🔍 Search item by initials (e.g. CB → Chicken Burger)…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                <button className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10" onClick={() => setOpenItem({ name: '', price: '' })}>
                  + Custom
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setActiveCat('all')} className={`rounded-md px-3 py-1 text-xs font-medium ${activeCat === 'all' ? 'bg-[#2ECC71] text-black' : 'bg-white/5 text-white/60'}`}>All</button>
                {categories.map((c) => (
                  <button key={c.id} onClick={() => setActiveCat(c.id)} className={`rounded-md px-3 py-1 text-xs font-medium ${activeCat === c.id ? 'bg-[#2ECC71] text-black' : 'bg-white/5 text-white/60'}`}>{c.name}</button>
                ))}
              </div>
            </div>
            <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2.5 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredItems.map((item) => (
                <button key={item.id} onClick={() => clickItem(item)} className="flex flex-col items-start rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-colors hover:border-[#2ECC71]/50 hover:bg-white/10">
                  <span className="font-semibold leading-tight">{item.name}</span>
                  <span className="mt-2 font-bold text-[#2ECC71]">{formatMoney(priceForType(item, orderType))}</span>
                  {item.modifierGroups && item.modifierGroups.length > 0 && <span className="mt-1 text-[10px] text-white/30">options</span>}
                </button>
              ))}
              {filteredItems.length === 0 && <p className="col-span-full py-10 text-center text-sm text-white/30">No items found</p>}
            </div>
          </div>

          {/* Cart summary */}
          <aside className="flex w-[400px] shrink-0 flex-col border-l border-white/10 bg-[#202020]">
            <div className="border-b border-white/10 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-white/40">Active Cart {order && `· #${order.number}`}</div>
                  <div className="font-bold">
                    {table ? `Table ${table.name}` : isQuick ? 'Quick Bill' : mode === 'DELIVERY' ? 'Home Delivery' : 'Takeaway'}
                  </div>
                </div>
                {orderType === 'DINE_IN' && (
                  <select className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs" value={waiterId} onChange={(e) => setWaiterId(e.target.value)}>
                    <option value="">No waiter</option>
                    {waiters.map((w) => <option key={w.id} value={w.id} className="text-black">{w.name}</option>)}
                  </select>
                )}
              </div>
            </div>

            {/* item table */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                <span>Item</span><span className="text-right">Unit</span><span className="text-right">Total</span>
              </div>
              {cart.length === 0 ? (
                <p className="py-12 text-center text-sm text-white/30">Tap items to add them</p>
              ) : (
                cart.map((l) => {
                  const mod = l.modifiers.reduce((s, m) => s + m.priceCents, 0);
                  return (
                    <div key={l.key} className="border-b border-white/5 px-4 py-2.5">
                      <div className="grid grid-cols-[1fr_auto_auto] items-start gap-2 text-sm">
                        <span className="font-medium">{l.name}</span>
                        <span className="text-right text-white/60">{formatMoney(l.unitPriceCents + mod)}</span>
                        <span className="text-right font-semibold">{formatMoney((l.unitPriceCents + mod) * l.quantity)}</span>
                      </div>
                      {l.modifiers.length > 0 && (
                        <div className="mt-0.5 text-[11px] text-white/40">— {l.modifiers.map((m) => m.name).join(', ')}</div>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <button onClick={() => changeQty(l.key, -1)} className="h-6 w-6 rounded bg-white/10 text-white/80 hover:bg-white/20">−</button>
                        <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
                        <button onClick={() => changeQty(l.key, 1)} className="h-6 w-6 rounded bg-white/10 text-white/80 hover:bg-white/20">+</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* totals */}
            <div className="border-t border-white/10 px-4 py-3">
              {custLabel && <div className="mb-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60">👤 {custLabel}</div>}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-white/50"><span>Sub-Total ({totals.count} items)</span><span>{formatMoney(totals.subtotal)}</span></div>
                <div className="flex items-center justify-between text-white/50">
                  <span>Discount (Rs)</span>
                  <input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="w-20 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-right text-sm text-white" />
                </div>
                {serviceChargeRate > 0 && <div className="flex justify-between text-white/50"><span>Service ({Math.round(serviceChargeRate * 100)}%)</span><span>{formatMoney(totals.serviceCharge)}</span></div>}
                <div className="flex justify-between text-white/50"><span>VAT ({Math.round(vatRate * 100)}%)</span><span>{formatMoney(totals.tax)}</span></div>
                <div className="flex justify-between border-t border-white/10 pt-1.5 text-lg font-bold text-[#2ECC71]"><span>TOTAL DUE</span><span>{formatMoney(totals.total)}</span></div>
              </div>

              {/* actions */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button className="rounded-lg bg-white/10 py-2 text-xs font-semibold text-white/80 hover:bg-white/20 disabled:opacity-40" disabled={busy} onClick={voidBasket}>Void Basket</button>
                <button className="rounded-lg bg-white/10 py-2 text-xs font-semibold text-white/80 hover:bg-white/20 disabled:opacity-40" disabled={busy || isQuick} onClick={() => runAction('kot_print')}>Print KOT</button>
                <button className="rounded-lg bg-[#2ECC71] py-2 text-xs font-bold text-black hover:bg-[#28b463] disabled:opacity-40" disabled={busy} onClick={() => runAction('pay')}>Proceed to Pay</button>
              </div>
              {!isQuick && (
                <div className="mt-2 grid grid-cols-4 gap-2">
                  <button className="rounded-lg bg-white/5 py-1.5 text-[11px] text-white/60 hover:bg-white/10" disabled={busy} onClick={() => runAction('draft')}>Hold</button>
                  <button className="rounded-lg bg-white/5 py-1.5 text-[11px] text-white/60 hover:bg-white/10" disabled={busy} onClick={() => runAction('kot')}>KOT</button>
                  <button className="rounded-lg bg-white/5 py-1.5 text-[11px] text-white/60 hover:bg-white/10" disabled={busy} onClick={() => runAction('bill')}>Bill</button>
                  <button className="rounded-lg bg-white/5 py-1.5 text-[11px] text-white/60 hover:bg-white/10" disabled={busy} onClick={() => runAction('bill_print')}>Bill+Print</button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Customer capture overlay */}
      <Modal open={overlay === 'customer'} title={mode === 'DELIVERY' ? 'Delivery details' : 'Customer details'} onClose={() => { setOverlay(null); setMode(null); }}>
        <form
          onSubmit={(e) => { e.preventDefault(); startOrder(mode === 'DELIVERY' ? 'DELIVERY' : 'TAKEAWAY', null, false, cust); }}
          className="space-y-4"
        >
          <div>
            <label className="label">Customer name</label>
            <input className="input" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} placeholder="Name" required autoFocus />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} placeholder="98XXXXXXXX" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setOverlay(null); setMode(null); }}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Starting…' : 'Start order'}</button>
          </div>
        </form>
      </Modal>

      {/* modifier picker */}
      <Modal open={!!picker} title={picker ? `Options · ${picker.item.name}` : ''} onClose={() => setPicker(null)}>
        {picker && (
          <div className="space-y-4">
            {picker.groups.map((g) => {
              const single = g.maxSelect === 1;
              const sel = pickSel[g.id] ?? [];
              return (
                <div key={g.id}>
                  <div className="label">{g.name} <span className="text-slate-400">(select {g.minSelect}–{g.maxSelect})</span></div>
                  <div className="space-y-1.5">
                    {g.modifiers.map((m) => {
                      const checked = sel.includes(m.id);
                      return (
                        <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                          <input type={single ? 'radio' : 'checkbox'} name={g.id} checked={checked} onChange={() => {
                            setPickSel((prev) => {
                              const cur = prev[g.id] ?? [];
                              if (single) return { ...prev, [g.id]: [m.id] };
                              if (cur.includes(m.id)) return { ...prev, [g.id]: cur.filter((x) => x !== m.id) };
                              if (cur.length >= g.maxSelect) return prev;
                              return { ...prev, [g.id]: [...cur, m.id] };
                            });
                          }} />
                          <span className="flex-1">{m.name}</span>
                          {m.priceCents > 0 && <span className="text-brand-600">+{formatMoney(m.priceCents)}</span>}
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

      {/* open item */}
      <Modal open={!!openItem} title="Custom item" onClose={() => setOpenItem(null)}>
        {openItem && (
          <div className="space-y-4">
            <div>
              <label className="label">Item name</label>
              <input className="input" value={openItem.name} onChange={(e) => setOpenItem({ ...openItem, name: e.target.value })} autoFocus />
            </div>
            <div>
              <label className="label">Price (Rs)</label>
              <input className="input" type="number" step="0.01" min="0" value={openItem.price} onChange={(e) => setOpenItem({ ...openItem, price: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setOpenItem(null)}>Cancel</button>
              <button className="btn-primary" onClick={addOpenItem}>Add</button>
            </div>
          </div>
        )}
      </Modal>

      {/* payment */}
      <Modal open={payOpen} title="Settle payment" onClose={() => setPayOpen(false)}>
        {order && <PaymentPanel totalCents={order.totalCents} busy={busy} onCancel={() => setPayOpen(false)} onConfirm={confirmPayment} />}
      </Modal>

      <Receipt order={receipt?.order ?? null} settings={settings} mode={receipt?.mode ?? 'BILL'} />
    </div>
  );
}

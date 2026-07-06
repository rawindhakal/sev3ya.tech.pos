'use client';

// Waiter handheld panel — take orders, fire KOT, view the bill. Settlement
// (payment / discount / cash) is intentionally NOT available here; bills are
// settled at the main POS counter.
import { useEffect, useMemo, useState } from 'react';
import { api, formatMoney } from '@/lib/api';
import type { Category, Employee, MenuItem, ModifierGroup, Order, TableArea } from '@/lib/types';
import { priceForType } from '@/lib/types';
import Modal from '@/components/Modal';

type Mode = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
interface Line { key: string; id?: string; menuItemId?: string; name: string; unitPriceCents: number; modifiers: { name: string; priceCents: number }[]; quantity: number; notes?: string; kotStatus?: string }

const fired = (l: Line) => !!l.kotStatus && l.kotStatus !== 'PENDING';
const toCart = (o: Order): Line[] => (o.items ?? []).filter((i) => !i.cancelledAt).map((it) => ({
  key: it.id, id: it.id, menuItemId: it.menuItemId ?? undefined, name: it.nameSnapshot, unitPriceCents: it.unitPriceCents,
  modifiers: (it.modifiers ?? []).map((m) => ({ name: m.name, priceCents: m.priceCents })), quantity: it.quantity, notes: it.notes ?? undefined, kotStatus: it.kotStatus,
}));

export default function WaiterPage() {
  const [emp, setEmp] = useState<Employee | null>(null);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState('');

  const [step, setStep] = useState<'home' | 'table' | 'order'>('home');
  const [mode, setMode] = useState<Mode>('DINE_IN');
  const [areas, setAreas] = useState<TableArea[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [tableName, setTableName] = useState<string | null>(null);
  const [cart, setCart] = useState<Line[]>([]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCat, setActiveCat] = useState('all');
  const [search, setSearch] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [custOpen, setCustOpen] = useState(false);
  const [cust, setCust] = useState({ name: '', phone: '' });
  const [picker, setPicker] = useState<{ item: MenuItem; groups: ModifierGroup[] } | null>(null);
  const [pickSel, setPickSel] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.get<Category[]>('/categories').then(setCategories).catch(() => {});
    api.get<MenuItem[]>('/menu-items').then(setItems).catch(() => {});
    try { const s = localStorage.getItem('cakezake-emp'); if (s) setEmp(JSON.parse(s)); } catch {}
  }, []);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2000); }

  async function login() {
    if (!/^\d{4,6}$/.test(pin)) return setPinErr('Enter your PIN');
    try {
      const e = await api.post<Employee & { token?: string }>('/employees/login', { pin });
      setEmp(e); localStorage.setItem('cakezake-emp', JSON.stringify(e));
      if (e.token) localStorage.setItem('cakezake-token', e.token);
      setPin(''); setPinErr('');
    } catch { setPinErr('Invalid PIN'); setPin(''); }
  }

  const vatRate = 0.13;
  const totals = useMemo(() => {
    let sub = 0, n = 0;
    for (const l of cart) { const mod = l.modifiers.reduce((s, m) => s + m.priceCents, 0); sub += (l.unitPriceCents + mod) * l.quantity; n += l.quantity; }
    return { sub, count: n, total: sub + Math.round(sub * vatRate) };
  }, [cart]);

  const filtered = useMemo(() => {
    let l = items.filter((i) => i.isAvailable);
    if (activeCat !== 'all') l = l.filter((i) => i.categoryId === activeCat);
    if (search.trim()) l = l.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
    return l;
  }, [items, activeCat, search]);

  async function chooseMode(m: Mode) {
    setMode(m);
    if (m === 'DINE_IN') { setAreas(await api.get<TableArea[]>('/tables?groupBy=area')); setStep('table'); }
    else { setCust({ name: '', phone: '' }); setCustOpen(true); }
  }

  async function start(tableId: string | null, resumeOrder?: Order) {
    setBusy(true);
    try {
      let o = resumeOrder;
      if (!o) o = await api.post<Order>('/orders', { type: mode, tableId: tableId ?? undefined, customerName: cust.name || undefined, customerPhone: cust.phone || undefined });
      setOrder(o); setTableName(o.table?.name ?? null); setCart(toCart(o)); setStep('order'); setCustOpen(false);
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }
  async function resumeTable(t: { id: string; activeOrder?: { id: string } | null; name: string }) {
    if (!t.activeOrder) return;
    const full = await api.get<Order>(`/orders/${t.activeOrder.id}`); await start(t.id, full);
  }

  async function clickItem(item: MenuItem) {
    if (item.modifierGroups && item.modifierGroups.length) {
      const detail = await api.get<{ modifierGroups: ModifierGroup[] }>(`/menu-items/${item.id}`);
      setPickSel({}); setPicker({ item, groups: detail.modifierGroups });
    } else addLine(item, []);
  }
  function addLine(item: MenuItem, mods: { name: string; priceCents: number }[]) {
    setCart((prev) => {
      const sig = mods.map((m) => m.name).sort().join(',');
      const ex = prev.find((l) => !fired(l) && l.menuItemId === item.id && !l.notes && l.modifiers.map((m) => m.name).sort().join(',') === sig);
      if (ex) return prev.map((l) => (l.key === ex.key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { key: `${item.id}:${Date.now()}`, menuItemId: item.id, name: item.name, unitPriceCents: priceForType(item, mode), modifiers: mods, quantity: 1 }];
    });
    flash(`${item.name} added`);
  }
  function confirmPicker() {
    if (!picker) return;
    const mods: { name: string; priceCents: number }[] = [];
    for (const g of picker.groups) for (const mid of pickSel[g.id] ?? []) { const m = g.modifiers.find((x) => x.id === mid); if (m) mods.push({ name: m.name, priceCents: m.priceCents }); }
    addLine(picker.item, mods); setPicker(null);
  }
  function qty(key: string, d: number) { setCart((p) => p.map((l) => (l.key === key && !fired(l) ? { ...l, quantity: l.quantity + d } : l)).filter((l) => l.quantity > 0)); }
  function note(key: string, v: string) { setCart((p) => p.map((l) => (l.key === key ? { ...l, notes: v } : l))); }

  async function save(): Promise<Order | null> {
    if (!order) return null;
    const saved = await api.put<Order>(`/orders/${order.id}/cart`, {
      items: cart.map((l) => ({ id: l.id, ...(l.menuItemId ? { menuItemId: l.menuItemId } : {}), quantity: l.quantity, modifiers: l.modifiers, notes: l.notes })),
      waiterId: undefined,
    });
    setOrder(saved); setCart(toCart(saved)); return saved;
  }
  async function sendKot() {
    if (cart.length === 0) return flash('Add items first');
    setBusy(true);
    try { await save(); await api.post(`/orders/${order!.id}/kot`, {}); const o = await api.get<Order>(`/orders/${order!.id}`); setOrder(o); setCart(toCart(o)); flash('Sent to kitchen ✓'); }
    catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }
  async function saveExit() {
    setBusy(true);
    try { await save(); flash('Saved'); reset(); }
    catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }
  function reset() { setStep('home'); setOrder(null); setTableName(null); setCart([]); setCartOpen(false); setActiveCat('all'); setSearch(''); }

  // ── PIN gate ──
  if (!emp) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1A1A1A] p-4 text-white">
        <div className="w-72 rounded-2xl border border-white/10 bg-[#202020] p-6 text-center">
          <div className="mb-1 text-3xl">🧑‍🍳</div>
          <div className="mb-1 font-bold">WAITER PANEL</div>
          <p className="mb-4 text-xs text-white/40">Enter your PIN</p>
          <div className="mb-3 flex justify-center gap-2">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-3 w-3 rounded-full ${i < pin.length ? 'bg-[#2ECC71]' : 'bg-white/15'}`} />)}</div>
          {pinErr && <p className="mb-2 text-xs text-[#E74C3C]">{pinErr}</p>}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => setPin((p) => (p.length < 6 ? p + d : p))} className="rounded-lg bg-white/5 py-3 text-lg font-semibold hover:bg-white/10">{d}</button>)}
            <button onClick={() => setPin((p) => p.slice(0, -1))} className="rounded-lg bg-white/5 py-3 hover:bg-white/10">⌫</button>
            <button onClick={() => setPin((p) => (p.length < 6 ? p + '0' : p))} className="rounded-lg bg-white/5 py-3 text-lg font-semibold hover:bg-white/10">0</button>
            <button onClick={login} className="rounded-lg bg-[#2ECC71] py-3 text-sm font-bold text-black">Enter</button>
          </div>
          <p className="mt-4 text-[10px] text-white/25">Dev: Barista Sita 4444</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#1A1A1A] text-white">
      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#2ECC71] px-4 py-2 text-sm font-medium text-black shadow-lg">{toast}</div>}

      {/* top bar */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#111] px-4 py-2.5 text-sm">
        <div className="flex items-center gap-2">
          {step !== 'home' && <button onClick={reset} className="rounded-md bg-white/5 px-2 py-1 text-xs">‹ Back</button>}
          <span className="font-bold">🧑‍🍳 Waiter</span>
          <span className="text-white/50">· {emp.name}</span>
        </div>
        <button onClick={() => { setEmp(null); localStorage.removeItem('cakezake-emp'); localStorage.removeItem('cakezake-token'); }} className="text-xs text-white/50">Sign out</button>
      </div>

      {/* HOME */}
      {step === 'home' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <p className="text-white/50">Start an order</p>
          <div className="grid w-full max-w-sm grid-cols-1 gap-3">
            {([['DINE_IN', '🍽️ Dine-In'], ['TAKEAWAY', '🥡 Takeaway'], ['DELIVERY', '🛵 Delivery']] as [Mode, string][]).map(([m, l]) => (
              <button key={m} onClick={() => chooseMode(m)} className="rounded-xl border-2 border-white/10 bg-white/5 py-5 text-lg font-semibold hover:border-[#2ECC71]">{l}</button>
            ))}
          </div>
        </div>
      )}

      {/* TABLE PICK */}
      {step === 'table' && (
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="mb-3 font-bold">Select a table</h2>
          {areas.map((a) => (
            <div key={a.area} className="mb-4">
              <div className="mb-2 text-xs uppercase tracking-wider text-white/40">{a.area}</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {a.tables.map((t) => {
                  const free = t.status === 'AVAILABLE'; const occ = t.status === 'OCCUPIED' && !!t.activeOrder;
                  return (
                    <button key={t.id} disabled={!free && !occ} onClick={() => (occ ? resumeTable(t) : start(t.id))}
                      className={`aspect-square rounded-xl border-2 p-2 ${free ? 'border-[#2ECC71]/40 bg-[#2ECC71]/10' : occ ? 'border-[#F39C12]/50 bg-[#F39C12]/15' : 'border-white/10 bg-white/5 opacity-50'}`}>
                      <div className="text-base font-bold">{t.name}</div>
                      {occ ? <div className="text-[10px] text-[#F39C12]">{formatMoney(t.activeOrder!.totalCents)}</div> : <div className="text-[10px] text-white/40">{t.seats} seats</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ORDER */}
      {step === 'order' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-white/10 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded bg-[#2ECC71]/15 px-2 py-1 text-xs font-semibold text-[#2ECC71]">{tableName ? `Table ${tableName}` : mode.replace('_', ' ')}{order && ` · #${order.number}`}</span>
              <input className="ml-auto w-40 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm" placeholder="🔍 Search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button onClick={() => setActiveCat('all')} className={`whitespace-nowrap rounded-md px-3 py-1 text-xs ${activeCat === 'all' ? 'bg-[#2ECC71] text-black' : 'bg-white/5'}`}>All</button>
              {categories.map((c) => <button key={c.id} onClick={() => setActiveCat(c.id)} className={`whitespace-nowrap rounded-md px-3 py-1 text-xs ${activeCat === c.id ? 'bg-[#2ECC71] text-black' : 'bg-white/5'}`}>{c.name}</button>)}
            </div>
          </div>
          <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((item) => (
              <button key={item.id} onClick={() => clickItem(item)} className="flex flex-col rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:border-[#2ECC71]/50">
                <span className="font-medium leading-tight">{item.name}</span>
                <span className="mt-1 font-bold text-[#2ECC71]">{formatMoney(priceForType(item, mode))}</span>
              </button>
            ))}
          </div>
          {/* bottom bar */}
          <button onClick={() => setCartOpen(true)} className="flex items-center justify-between border-t border-white/10 bg-[#2ECC71] px-5 py-3 font-bold text-black">
            <span>🛒 {totals.count} item(s)</span><span>{formatMoney(totals.total)} · View cart ›</span>
          </button>
        </div>
      )}

      {/* CART SHEET */}
      <Modal open={cartOpen} title="Order" onClose={() => setCartOpen(false)}>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {cart.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No items yet.</p> : cart.map((l) => {
            const mod = l.modifiers.reduce((s, m) => s + m.priceCents, 0);
            return (
              <div key={l.key} className="rounded-lg border border-slate-200 p-2">
                <div className="flex justify-between text-sm"><span className="font-medium">{l.name}{fired(l) && <span className="ml-1 text-[9px] text-amber-600">fired</span>}</span><span className="font-semibold">{formatMoney((l.unitPriceCents + mod) * l.quantity)}</span></div>
                {l.modifiers.length > 0 && <div className="text-[11px] text-slate-400">{l.modifiers.map((m) => m.name).join(', ')}</div>}
                {!fired(l) && <input value={l.notes ?? ''} onChange={(e) => note(l.key, e.target.value)} placeholder="+ note" className="mt-1 w-full rounded border border-slate-200 px-2 py-0.5 text-[11px]" />}
                <div className="mt-1 flex items-center gap-2">
                  {fired(l) ? <span className="text-sm">Qty {l.quantity}</span> : <>
                    <button onClick={() => qty(l.key, -1)} className="h-6 w-6 rounded bg-slate-100">−</button><span className="w-6 text-center text-sm font-semibold">{l.quantity}</span><button onClick={() => qty(l.key, 1)} className="h-6 w-6 rounded bg-slate-100">+</button>
                  </>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 font-bold"><span>Total (incl. VAT)</span><span>{formatMoney(totals.total)}</span></div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button className="btn-ghost text-xs" disabled={busy} onClick={saveExit}>Save</button>
          <button className="btn-ghost text-xs" disabled={busy} onClick={() => setBillOpen(true)}>View bill</button>
          <button className="btn-primary text-xs" disabled={busy} onClick={sendKot}>Send KOT</button>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">💳 Payment is taken at the main POS counter.</p>
      </Modal>

      {/* BILL (read-only) */}
      <Modal open={billOpen} title={`Bill · #${order?.number ?? ''}`} onClose={() => setBillOpen(false)}>
        <div className="space-y-1 text-sm">
          {cart.map((l) => { const mod = l.modifiers.reduce((s, m) => s + m.priceCents, 0); return (
            <div key={l.key} className="flex justify-between"><span>{l.quantity}× {l.name}</span><span>{formatMoney((l.unitPriceCents + mod) * l.quantity)}</span></div>
          ); })}
          <div className="flex justify-between border-t border-slate-100 pt-1 text-slate-500"><span>Subtotal</span><span>{formatMoney(totals.sub)}</span></div>
          <div className="flex justify-between text-slate-500"><span>VAT 13%</span><span>{formatMoney(Math.round(totals.sub * vatRate))}</span></div>
          <div className="flex justify-between border-t border-slate-100 pt-1 text-base font-bold"><span>TOTAL</span><span>{formatMoney(totals.total)}</span></div>
        </div>
        <div className="mt-3 rounded-lg bg-amber-50 p-2 text-center text-xs text-amber-700">Send the guest to the counter to settle this bill.</div>
      </Modal>

      {/* modifier picker */}
      <Modal open={!!picker} title={picker ? picker.item.name : ''} onClose={() => setPicker(null)}>
        {picker && <div className="space-y-4">
          {picker.groups.map((g) => { const single = g.maxSelect === 1; const sel = pickSel[g.id] ?? []; return (
            <div key={g.id}>
              <div className="label">{g.name} <span className="text-slate-400">(select {g.minSelect}–{g.maxSelect})</span></div>
              <div className="space-y-1.5">
                {g.modifiers.map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <input type={single ? 'radio' : 'checkbox'} name={g.id} checked={sel.includes(m.id)} onChange={() => setPickSel((prev) => {
                      const cur = prev[g.id] ?? [];
                      if (single) return { ...prev, [g.id]: [m.id] };
                      if (cur.includes(m.id)) return { ...prev, [g.id]: cur.filter((x) => x !== m.id) };
                      if (cur.length >= g.maxSelect) return prev;
                      return { ...prev, [g.id]: [...cur, m.id] };
                    })} />
                    <span className="flex-1">{m.name}</span>{m.priceCents > 0 && <span className="text-brand-600">+{formatMoney(m.priceCents)}</span>}
                  </label>
                ))}
              </div>
            </div>
          ); })}
          <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setPicker(null)}>Cancel</button><button className="btn-primary" onClick={confirmPicker}>Add</button></div>
        </div>}
      </Modal>

      {/* customer capture (takeaway/delivery) */}
      <Modal open={custOpen} title="Customer details" onClose={() => { setCustOpen(false); setStep('home'); }}>
        <form onSubmit={(e) => { e.preventDefault(); start(null); }} className="space-y-4">
          <div><label className="label">Name</label><input className="input" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} autoFocus /></div>
          <div><label className="label">Phone</label><input className="input" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} placeholder="98XXXXXXXX" /></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => { setCustOpen(false); setStep('home'); }}>Cancel</button><button type="submit" className="btn-primary" disabled={busy}>Start</button></div>
        </form>
      </Modal>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatMoney, dollarsToCents } from '@/lib/api';
import type {
  Category,
  Employee,
  MenuItem,
  ModifierGroup,
  Order,
  OrderItem,
  OrderType,
  PaymentMethod,
  RestaurantTable,
  Settings,
  TableArea,
  Waiter,
} from '@/lib/types';
import { priceForType } from '@/lib/types';
import Modal from '@/components/Modal';
import Receipt, { ReceiptMode } from '@/components/Receipt';
import DayReport, { DayReportData } from '@/components/DayReport';
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
  id?: string; // server OrderItem id once saved (enables reconcile + KOT status)
  menuItemId?: string;
  name: string;
  unitPriceCents: number;
  modifiers: { name: string; priceCents: number }[];
  quantity: number;
  discountCents?: number; // item-wise discount (needs discount permission)
  notes?: string;
  kotStatus?: string; // undefined/PENDING = editable; else fired (locked)
  station?: string;
}

const isFired = (l: CartLine) => !!l.kotStatus && l.kotStatus !== 'PENDING';

// Rebuild the cart from a server order (drops cancelled items, carries ids so
// re-saving reconciles instead of duplicating).
function orderToCart(o: Order): CartLine[] {
  return (o.items ?? [])
    .filter((it) => !it.cancelledAt)
    .map((it) => ({
      key: it.id,
      id: it.id,
      menuItemId: it.menuItemId ?? undefined,
      name: it.nameSnapshot,
      unitPriceCents: it.unitPriceCents,
      modifiers: (it.modifiers ?? []).map((m) => ({ name: m.name, priceCents: m.priceCents })),
      quantity: it.quantity,
      discountCents: (it as { discountCents?: number }).discountCents ?? 0,
      notes: it.notes ?? undefined,
      kotStatus: it.kotStatus,
      station: it.station,
    }));
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
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [now, setNow] = useState(new Date());

  // Terminal session (PIN login — spec §2.1 Step 1)
  const [emp, setEmp] = useState<Employee | null>(null);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState('');

  // Physical terminal identity (multi-terminal — each till has its own day)
  const [terminal, setTerminal] = useState<{ id: string; name: string } | null>(null);
  const [terminals, setTerminals] = useState<{ id: string; name: string }[]>([]);
  const [newTermName, setNewTermName] = useState('');

  // active order context
  const [mode, setMode] = useState<ModeKey | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [waiterId, setWaiterId] = useState('');
  const [guestCount, setGuestCount] = useState(2);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState('');
  const [discountMode, setDiscountMode] = useState<'rs' | 'pct'>('rs');
  const [discountApproved, setDiscountApproved] = useState(false); // manager override
  const [redeemPts, setRedeemPts] = useState(''); // loyalty points to redeem
  const [isQuick, setIsQuick] = useState(false);

  // capture overlays
  const [overlay, setOverlay] = useState<null | 'table' | 'customer'>(null);
  const [areas, setAreas] = useState<TableArea[]>([]);
  const [cust, setCust] = useState({ name: '', phone: '' });
  const [custInfo, setCustInfo] = useState<null | { found: boolean; name?: string; loyaltyPoints?: number; visitCount?: number; tier?: string; creditBalanceCents?: number }>(null);
  const [custModal, setCustModal] = useState(false);
  const [billCust, setBillCust] = useState({ name: '', phone: '' });

  // table management (folded into the POS floor)
  const [manage, setManage] = useState(false);
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [tableForm, setTableForm] = useState({ name: '', seats: 4, area: '', isVip: false });
  const [transferOpen, setTransferOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveSel, setMoveSel] = useState<Record<string, boolean>>({});

  // menu ui
  const [activeCat, setActiveCat] = useState('all');
  const [search, setSearch] = useState('');

  // modifier picker / open item / held / payment
  const [picker, setPicker] = useState<{ item: MenuItem; groups: ModifierGroup[] } | null>(null);
  const [pickSel, setPickSel] = useState<Record<string, string[]>>({});
  const [openItem, setOpenItem] = useState<{ name: string; price: string } | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ order: Order; mode: ReceiptMode; items?: OrderItem[] } | null>(null);

  // Cash drawer / business-day session (open at first login → close at day-end)
  const [drawerOpen, setDrawerOpen] = useState<boolean | null>(null);
  const [drawerInfo, setDrawerInfo] = useState<{ session?: { id: string; openingFloatCents: number }; expectedCents?: number; cashSalesCents?: number; payIn?: number; payOut?: number } | null>(null);
  const [openFloat, setOpenFloat] = useState('');
  const [dayEndOpen, setDayEndOpen] = useState(false);
  const [countRs, setCountRs] = useState('');
  const [dayReport, setDayReport] = useState<DayReportData | null>(null);

  useEffect(() => {
    api.get<Settings>('/settings').then(setSettings).catch(() => {});
    api.get<Category[]>('/categories').then(setCategories).catch(() => {});
    api.get<MenuItem[]>('/menu-items').then(setItems).catch(() => {});
    api.get<Waiter[]>('/waiters').then(setWaiters).catch(() => {});
    const clock = setInterval(() => setNow(new Date()), 1000);
    // Restore a previous terminal session + this device's till identity.
    try {
      const saved = localStorage.getItem('cakezake-emp');
      if (saved) setEmp(JSON.parse(saved));
      const t = localStorage.getItem('cakezake-terminal');
      if (t) setTerminal(JSON.parse(t));
    } catch {
      /* ignore */
    }
    api.get<{ id: string; name: string }[]>('/terminals').then(setTerminals).catch(() => {});
    return () => clearInterval(clock);
  }, []);

  function pickTerminal(t: { id: string; name: string }) {
    setTerminal(t);
    localStorage.setItem('cakezake-terminal', JSON.stringify(t));
    checkDrawer(t.id);
  }
  async function createTerminal() {
    if (!newTermName.trim()) return;
    try {
      const t = await api.post<{ id: string; name: string }>('/terminals', { name: newTermName.trim() });
      setNewTermName('');
      pickTerminal(t);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function login() {
    if (!/^\d{4,6}$/.test(pin)) return setPinErr('Enter your 4–6 digit PIN');
    try {
      const e = await api.post<Employee & { token?: string }>('/employees/login', { pin });
      setEmp(e);
      localStorage.setItem('cakezake-emp', JSON.stringify(e));
      if (e.token) localStorage.setItem('cakezake-token', e.token);
      setPin('');
      setPinErr('');
    } catch {
      setPinErr('Invalid PIN');
      setPin('');
    }
  }
  function lock() {
    setEmp(null);
    localStorage.removeItem('cakezake-emp');
    localStorage.removeItem('cakezake-token');
    resetTerminal();
  }

  // ── Cash drawer / business day (per terminal) ──────
  async function checkDrawer(tid?: string) {
    const terminalId = tid ?? terminal?.id;
    try {
      const r = await api.get<{ open: boolean; session?: { id: string; openingFloatCents: number }; expectedCents?: number; cashSalesCents?: number; payIn?: number; payOut?: number }>(`/cash-drawer/current${terminalId ? `?terminalId=${terminalId}` : ''}`);
      setDrawerOpen(r.open);
      setDrawerInfo(r);
    } catch {
      setDrawerOpen(true); // don't block the terminal on a fetch error
    }
  }
  // At first login (with a terminal chosen), require the drawer to be open.
  useEffect(() => {
    if (emp && terminal) checkDrawer(terminal.id);
  }, [emp, terminal]);

  async function openDrawer() {
    try {
      await api.post('/cash-drawer/open', { openingFloatCents: dollarsToCents(parseFloat(openFloat || '0')), openedBy: emp?.name, terminalId: terminal?.id });
      setOpenFloat('');
      checkDrawer();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function endDay() {
    const sessionId = drawerInfo?.session?.id;
    setBusy(true);
    try {
      await api.post('/cash-drawer/close', { countedCents: dollarsToCents(parseFloat(countRs || '0')), closedBy: emp?.name, terminalId: terminal?.id });
      const rep = await api.get<DayReportData>(`/cash-drawer/report${sessionId ? `?sessionId=${sessionId}` : ''}`);
      setDayEndOpen(false);
      setCountRs('');
      // Print the Z-report.
      setReceipt(null);
      setDayReport(rep);
      setTimeout(() => {
        document.body.classList.add('print-receipt');
        window.print();
        document.body.classList.remove('print-receipt');
        setTimeout(() => setDayReport(null), 300);
      }, 200);
      setDrawerOpen(false);
      resetTerminal();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  // Returning-customer lookup for the capture overlay (#123, #124).
  async function lookupCustomer(phone: string) {
    if (phone.replace(/\D/g, '').length < 7) return setCustInfo(null);
    try {
      const r = await api.get<{ found: boolean; name?: string; loyaltyPoints?: number; visitCount?: number; tier?: string }>(`/customers/lookup?phone=${encodeURIComponent(phone)}`);
      setCustInfo(r);
      if (r.found && r.name && !cust.name) setCust((c) => ({ ...c, name: r.name! }));
    } catch {
      setCustInfo(null);
    }
  }

  const vatRate = settings?.vatRate ?? 0.13;
  const serviceChargeRate = settings?.serviceChargeRate ?? 0;
  const pointsAvail = custInfo?.found ? custInfo.loyaltyPoints ?? 0 : 0;
  const totals = useMemo(() => {
    let subtotal = 0;
    let count = 0;
    for (const l of cart) {
      const mod = l.modifiers.reduce((s, m) => s + m.priceCents, 0);
      const gross = (l.unitPriceCents + mod) * l.quantity;
      subtotal += Math.max(0, gross - (l.discountCents || 0));
      count += l.quantity;
    }
    const discountRaw = parseFloat(discount) || 0;
    const discountCents = Math.min(
      subtotal,
      discountMode === 'pct' ? Math.round(subtotal * (discountRaw / 100)) : Math.round(discountRaw * 100),
    );
    // Loyalty redemption (1 point = Rs 1), capped by balance & remaining bill.
    const reqPts = Math.max(0, Math.min(parseInt(redeemPts) || 0, pointsAvail));
    const redeemCents = Math.min(reqPts * 100, subtotal - discountCents);
    const redeemPoints = Math.floor(redeemCents / 100);
    const taxable = subtotal - discountCents - redeemCents;
    const serviceCharge = Math.round(taxable * serviceChargeRate);
    const tax = Math.round((taxable + serviceCharge) * vatRate);
    return { count, subtotal, discountCents, redeemCents, redeemPoints, serviceCharge, tax, total: taxable + serviceCharge + tax };
  }, [cart, vatRate, serviceChargeRate, discount, discountMode, redeemPts, pointsAvail]);

  const orderType: OrderType = mode === 'DELIVERY' ? 'DELIVERY' : mode === 'DINE_IN' ? 'DINE_IN' : 'TAKEAWAY';

  const filteredItems = useMemo(() => {
    let list = items.filter((i) => i.isAvailable);
    if (activeCat !== 'all') list = list.filter((i) => i.categoryId === activeCat);
    if (search.trim()) list = list.filter((i) => matchesQuery(i.name, search));
    return list;
  }, [items, activeCat, search]);

  // ── Mode selection ─────────────────────────────────
  // Switching mode holds the current bill first, so staff can freely jump
  // between Dine-In / Takeaway / Home Delivery / Quick-Bill.
  async function selectMode(key: ModeKey) {
    if (busy) return;
    if (order) {
      setBusy(true);
      try {
        await holdCurrent();
      } catch {
        /* proceed */
      }
      clearContext();
      setBusy(false);
    }
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
        terminalId: terminal?.id,
      });
      setOrder(created);
      setTable(tbl);
      setIsQuick(quick);
      setCart([]);
      setDiscount('');
    setDiscountApproved(false);
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
    setDiscountMode('rs');
    setIsQuick(false);
    setCart(orderToCart(o));
  }

  // ── Table management (in-POS) ──────────────────────
  async function reloadAreas() {
    try {
      setAreas(await api.get<TableArea[]>('/tables?groupBy=area'));
    } catch {
      /* ignore */
    }
  }
  async function addTable(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/tables', {
        name: tableForm.name.trim(),
        seats: Number(tableForm.seats),
        area: tableForm.area.trim() || undefined,
        isVip: tableForm.isVip,
      });
      setTableForm({ name: '', seats: 4, area: '', isVip: false });
      setAddTableOpen(false);
      reloadAreas();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function tablePatch(id: string, data: Record<string, unknown>) {
    try {
      await api.patch(`/tables/${id}`, data);
      reloadAreas();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function doTransfer(tableId: string) {
    if (!order) return;
    try {
      const updated = await api.post<Order>(`/orders/${order.id}/transfer`, { tableId });
      setOrder(updated);
      setTable(updated.table ? ({ id: updated.table.id, name: updated.table.name } as RestaurantTable) : null);
      setTransferOpen(false);
      flash('Order transferred');
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function openMoveItems() {
    if (!order) return;
    setBusy(true);
    try {
      await persistCart(); // ensure every line has an id before moving
      await reloadAreas();
      setMoveSel({});
      setMoveOpen(true);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function doMoveItems(targetTableId: string) {
    if (!order) return;
    const itemIds = Object.keys(moveSel).filter((k) => moveSel[k]);
    if (!itemIds.length) return flash('Select at least one item to move');
    try {
      const res = await api.post<{ source: Order; target: Order }>(`/orders/${order.id}/transfer-items`, { itemIds, targetTableId });
      setOrder(res.source);
      setCart(orderToCart(res.source));
      setMoveOpen(false);
      reloadAreas();
      flash(`${itemIds.length} item(s) moved`);
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function doMerge(fromOrderId: string) {
    if (!order) return;
    try {
      const updated = await api.post<Order>(`/orders/${order.id}/merge`, { fromOrderId });
      resume(updated);
      setMergeOpen(false);
      flash('Tables merged');
    } catch (e) {
      alert((e as Error).message);
    }
  }
  const flatTables = areas.flatMap((a) => a.tables);

  // Open an occupied table's existing bill (only one billing at a time).
  async function resumeTable(t: RestaurantTable) {
    if (!t.activeOrder) return;
    setBusy(true);
    try {
      const full = await api.get<Order>(`/orders/${t.activeOrder.id}`);
      resume(full);
      setTable(t);
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
      const modSig = mods.map((m) => m.name).sort().join(',');
      // Merge only into an UNFIRED line with same item + modifiers + no note.
      const existing = prev.find(
        (l) => !isFired(l) && l.menuItemId === item.id && !l.notes &&
          l.modifiers.map((m) => m.name).sort().join(',') === modSig,
      );
      if (existing) return prev.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { key: lineKey(item.id, mods), menuItemId: item.id, name: item.name, unitPriceCents: priceForType(item, orderType), modifiers: mods, quantity: 1, station: item.station }];
    });
  }

  function addOpenItem() {
    if (!openItem) return;
    const priceCents = Math.round((parseFloat(openItem.price) || 0) * 100);
    if (!openItem.name.trim() || priceCents <= 0) return flash('Enter a name and price above zero');
    setCart((prev) => [...prev, { key: `open::${openItem.name}::${Date.now()}`, name: openItem.name.trim(), unitPriceCents: priceCents, modifiers: [], quantity: 1, station: 'BILLING' }]);
    setOpenItem(null);
  }

  function setLineNote(key: string, note: string) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, notes: note } : l)));
  }
  function setLineDiscount(key: string, rs: string) {
    const cents = Math.max(0, Math.round((parseFloat(rs) || 0) * 100));
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, discountCents: cents } : l)));
  }

  // Discounts require the discount permission — or a one-off manager override.
  const canDiscountNow = !!emp?.canDiscount || discountApproved;
  async function requestDiscountApproval() {
    const pin = prompt('Manager PIN to authorise a discount:');
    if (!pin) return;
    try {
      const m = await api.post<{ canDiscount?: boolean; name?: string }>('/employees/login', { pin });
      if (!m.canDiscount) return alert('That user cannot authorise discounts.');
      setDiscountApproved(true);
      flash(`Discount authorised by ${m.name}`);
    } catch {
      alert('Invalid PIN');
    }
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
    // Fired lines are locked — must be cancelled, not edited.
    setCart((prev) => prev.map((l) => (l.key === key && !isFired(l) ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0));
  }

  // ── Persist + actions ──────────────────────────────
  async function persistCart(): Promise<Order> {
    if (!order) throw new Error('No active order');
    const saved = await api.put<Order>(`/orders/${order.id}/cart`, {
      items: cart.map((l) => ({
        id: l.id, // preserve fired items & reconcile
        ...(l.menuItemId ? { menuItemId: l.menuItemId } : { name: l.name, unitPriceCents: l.unitPriceCents }),
        quantity: l.quantity,
        discountCents: l.discountCents || 0,
        modifiers: l.modifiers,
        notes: l.notes,
      })),
      discountCents: totals.discountCents + totals.redeemCents,
      waiterId: waiterId || undefined,
      guestCount,
    });
    setOrder(saved);
    setCart(orderToCart(saved)); // re-sync so new lines pick up their ids
    return saved;
  }

  // Print one ticket (blocks until the print dialog returns).
  function printTicket(o: Order, m: ReceiptMode, tItems?: OrderItem[]) {
    return new Promise<void>((resolve) => {
      setReceipt({ order: o, mode: m, items: tItems });
      setTimeout(() => {
        document.body.classList.add('print-receipt');
        window.print();
        document.body.classList.remove('print-receipt');
        setTimeout(resolve, 200);
      }, 150);
    });
  }

  // Fire incremental KOT — the API returns only the just-fired items; print a
  // KOT (kitchen) and/or BOT (bar) ticket for them (billing items don't print).
  async function fireKot(id: string, print: boolean): Promise<Order> {
    const res = await api.post<{ order: Order; fired: OrderItem[] }>(`/orders/${id}/kot`, {});
    setOrder(res.order);
    setCart(orderToCart(res.order));
    if (print) {
      const kitchen = res.fired.filter((i) => i.station === 'KITCHEN');
      const bar = res.fired.filter((i) => i.station === 'BAR');
      if (kitchen.length) await printTicket(res.order, 'KOT', kitchen);
      if (bar.length) await printTicket(res.order, 'BOT', bar);
    }
    return res.order;
  }

  async function runAction(kind: 'draft' | 'kot' | 'kot_print' | 'bill' | 'bill_print' | 'pay') {
    if (cart.length === 0) return flash('Add at least one item first');
    setBusy(true);
    try {
      let current = await persistCart();
      const id = current.id;
      const bill = async () => (current = await api.post<Order>(`/orders/${id}/bill`, {}));
      switch (kind) {
        case 'draft': flash(`Order #${current.number} held`); break;
        case 'kot': await fireKot(id, false); flash(`KOT fired for #${current.number}`); break;
        case 'kot_print': await fireKot(id, true); flash('KOT/BOT fired & printed'); break;
        case 'bill': await bill(); flash(`Bill generated #${current.number}`); break;
        case 'bill_print': await bill(); await printTicket(current, 'BILL'); break;
        case 'pay': await bill(); setOrder(current); setPayOpen(true); break;
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Cancel a single (possibly fired) line — prints a cancellation KOT/BOT.
  async function cancelLine(l: CartLine) {
    if (!order) return;
    if (!l.id) {
      // Unsaved line — just drop it locally.
      setCart((prev) => prev.filter((x) => x.key !== l.key));
      return;
    }
    const reason = prompt(`Cancel "${l.name}"? Reason:`);
    if (reason === null) return;
    if (!reason.trim()) return flash('A reason is required to cancel an item');
    setBusy(true);
    try {
      const res = await api.post<{ order: Order; cancelledItem: OrderItem; wasFired: boolean }>(
        `/orders/${order.id}/items/${l.id}/cancel`,
        { reason: reason.trim() },
      );
      setOrder(res.order);
      setCart(orderToCart(res.order));
      // If it had already been fired, tell the station via a cancellation ticket.
      if (res.wasFired && l.station && l.station !== 'BILLING') {
        await printTicket(res.order, 'CANCEL', [{ ...res.cancelledItem }]);
      }
      flash('Item cancelled');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Attach / look up a customer while billing (also enables credit + points).
  async function attachCustomer(name: string, phone: string) {
    if (!order) return;
    try {
      const updated = await api.post<Order>(`/orders/${order.id}/customer`, { name: name || undefined, phone });
      setOrder(updated);
      lookupCustomer(phone);
      flash(`Customer ${updated.customerName} attached`);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function confirmPayment(payments: { method: PaymentMethod; amountCents: number }[]) {
    if (!order) return;
    setBusy(true);
    try {
      await api.post(`/orders/${order.id}/pay`, {
        payments,
        redeemPoints: totals.redeemPoints || undefined,
        customerPhone: order.customerPhone ?? undefined,
      });
      setPayOpen(false);
      flash(totals.redeemPoints ? `Settled ✓ · ${totals.redeemPoints} pts redeemed` : `Order #${order.number} settled ✓`);
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
    setDiscountApproved(false);
    setRedeemPts('');
    setCustInfo(null);
    setIsQuick(false);
    setActiveCat('all');
    setSearch('');
  }

  // Preserve work when leaving a bill: hold it if it has items, or discard an
  // empty draft (freeing its table).
  async function holdCurrent() {
    if (order && cart.length > 0) await persistCart();
    else if (order && cart.length === 0) await api.delete(`/orders/${order.id}`);
  }

  function clearContext() {
    setOrder(null);
    setTable(null);
    setCart([]);
    setDiscount('');
    setDiscountApproved(false);
    setRedeemPts('');
    setCustInfo(null);
    setIsQuick(false);
    setActiveCat('all');
    setSearch('');
  }

  // Leave the terminal for another app page (holds work first).
  async function exitTo(path: string) {
    if (busy) return;
    setBusy(true);
    try {
      await holdCurrent();
    } catch {
      /* navigate anyway */
    } finally {
      setBusy(false);
    }
    router.push(path);
  }

  // In-terminal Back: from an open dine-in bill → the table floor; from a
  // takeaway/delivery bill or the floor → the mode selection.
  async function goBack() {
    if (busy) return;
    if (!order) {
      setMode(null);
      return;
    }
    setBusy(true);
    try {
      await holdCurrent();
      const backToFloor = !!table;
      clearContext();
      if (backToFloor) {
        setMode('DINE_IN');
        setAreas(await api.get<TableArea[]>('/tables?groupBy=area'));
      } else {
        setMode(null);
      }
    } catch {
      resetTerminal();
    } finally {
      setBusy(false);
    }
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

  // ── PIN login gate (spec §2.1 Step 1) ──────────────
  if (!emp) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#1A1A1A] text-white">
        <div className="w-72 rounded-2xl border border-white/10 bg-[#202020] p-6 text-center">
          <div className="mb-1 text-3xl">🍰</div>
          <div className="mb-1 font-bold tracking-wide">POS TERMINAL</div>
          <p className="mb-4 text-xs text-white/40">Enter your PIN to sign in</p>
          <div className="mb-4 flex justify-center gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`h-3 w-3 rounded-full ${i < pin.length ? 'bg-[#2ECC71]' : 'bg-white/15'}`} />
            ))}
          </div>
          {pinErr && <p className="mb-3 text-xs text-[#E74C3C]">{pinErr}</p>}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
              <button key={n} onClick={() => setPin((p) => (p.length < 6 ? p + n : p))} className="rounded-lg bg-white/5 py-3 text-lg font-semibold hover:bg-white/10">{n}</button>
            ))}
            <button onClick={() => setPin((p) => p.slice(0, -1))} className="rounded-lg bg-white/5 py-3 text-sm hover:bg-white/10">⌫</button>
            <button onClick={() => setPin((p) => (p.length < 6 ? p + '0' : p))} className="rounded-lg bg-white/5 py-3 text-lg font-semibold hover:bg-white/10">0</button>
            <button onClick={login} className="rounded-lg bg-[#2ECC71] py-3 text-sm font-bold text-black hover:bg-[#28b463]">Enter</button>
          </div>
          <p className="mt-4 text-[10px] text-white/25">Dev PINs — Admin 1111 · Manager 2222 · Cashier 3333</p>
        </div>
      </div>
    );
  }

  // ── Terminal selection (which physical till is this device?) ──
  if (!terminal) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#1A1A1A] text-white">
        <div className="w-80 rounded-2xl border border-white/10 bg-[#202020] p-6 text-center">
          <div className="mb-1 text-3xl">🖥️</div>
          <div className="mb-1 font-bold tracking-wide">SELECT TERMINAL</div>
          <p className="mb-4 text-xs text-white/40">Which till is this device? Each terminal runs its own cash drawer &amp; business day.</p>
          {terminals.length > 0 && (
            <div className="mb-4 space-y-2">
              {terminals.map((t) => (
                <button key={t.id} onClick={() => pickTerminal(t)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm font-medium hover:border-[#2ECC71]/50">🖥️ {t.name}</button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input value={newTermName} onChange={(e) => setNewTermName(e.target.value)} placeholder="New terminal name" className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/25" />
            <button onClick={createTerminal} className="rounded-lg bg-[#2ECC71] px-3 py-2 text-sm font-bold text-black">Add</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Open-drawer gate (cash drawer at first login) ──
  if (drawerOpen === false) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#1A1A1A] text-white">
        <div className="w-80 rounded-2xl border border-white/10 bg-[#202020] p-6 text-center">
          <div className="mb-1 text-3xl">💵</div>
          <div className="mb-1 font-bold tracking-wide">OPEN CASH DRAWER</div>
          <p className="mb-4 text-xs text-white/40">Enter the opening cash balance to start the day. The business day runs until you close it (Day End).</p>
          <label className="mb-1 block text-left text-xs uppercase tracking-wider text-white/40">Opening balance (Rs)</label>
          <input
            type="number" min="0" step="0.01" value={openFloat} onChange={(e) => setOpenFloat(e.target.value)}
            className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-right text-lg text-white" placeholder="0.00" autoFocus
          />
          <button onClick={openDrawer} className="w-full rounded-lg bg-[#2ECC71] py-3 font-bold text-black hover:bg-[#28b463]">Open drawer &amp; start day</button>
          <button onClick={lock} className="mt-2 text-xs text-white/40 hover:text-white">Sign out</button>
        </div>
        <DayReport report={dayReport} settings={settings} />
      </div>
    );
  }

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
          <button
            onClick={goBack}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-40"
            title={table ? 'Back to table floor (holds this bill)' : 'Back to order modes'}
          >
            ‹ Back
          </button>
          <span className="text-lg">🍰</span>
          <span className="font-bold tracking-wide">POS · {terminal.name}</span>
          <span className="text-white/40">·</span>
          <span className="text-white/60">{emp.name} ({emp.role})</span>
          <button onClick={() => { checkDrawer(); setCountRs(''); setDayEndOpen(true); }} className="rounded-md bg-[#E74C3C]/15 px-2 py-1 text-[11px] font-semibold text-[#E74C3C] hover:bg-[#E74C3C]/25" title="Close the business day">🌙 Day End</button>
          <button onClick={lock} className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/60 hover:bg-white/10" title="Lock terminal">🔒 Lock</button>
        </div>
        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-1 text-xs">
            {[
              { label: 'Dashboard', path: '/' },
              { label: 'Reservations', path: '/reservations' },
              { label: 'Orders', path: '/orders' },
              { label: 'Menu', path: '/menu' },
            ].map((l) => (
              <button key={l.path} onClick={() => exitTo(l.path)} className="rounded-md px-2 py-1 text-white/50 hover:bg-white/10 hover:text-white">
                {l.label}
              </button>
            ))}
          </nav>
          <span className="flex items-center gap-1.5 text-[#2ECC71]">
            <span className="h-2 w-2 rounded-full bg-[#2ECC71]" /> ONLINE
          </span>
          <span className="text-white/60 tabular-nums">
            {now.toLocaleDateString()} {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button onClick={() => exitTo('/settings')} className="text-white/60 hover:text-white">⚙ Settings</button>
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
              disabled={busy}
              onClick={() => selectMode(m.key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${
                active ? 'bg-[#2ECC71] text-black' : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              {m.icon} {m.label}
            </button>
          );
        })}
        {order && emp.canVoid && (
          <button onClick={voidBasket} className="ml-auto rounded-lg bg-[#E74C3C]/15 px-4 py-2 text-sm font-semibold text-[#E74C3C] hover:bg-[#E74C3C]/25">
            ✕ Void Basket
          </button>
        )}
      </div>

      {/* Body */}
      {!order && mode === 'DINE_IN' ? (
        // Inline table floor for Dine-In (rendered in the terminal itself).
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <h2 className="text-lg font-bold">{manage ? 'Manage tables' : 'Select a table'}</h2>
            {!manage && (
              <>
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
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setAddTableOpen(true)} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10">+ Add Table</button>
              <button onClick={() => setManage((v) => !v)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${manage ? 'bg-[#2ECC71] text-black' : 'bg-white/5 text-white/80 hover:bg-white/10'}`}>
                {manage ? '✓ Done' : '✎ Manage'}
              </button>
              <button onClick={resetTerminal} className="text-sm text-white/50 hover:text-white">← Modes</button>
            </div>
          </div>
          {areas.map((a) => (
            <div key={a.area} className="mb-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">{a.area}</div>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
                {a.tables.map((t) => {
                  const free = t.status === 'AVAILABLE';
                  const occupied = t.status === 'OCCUPIED' && !!t.activeOrder;
                  const clickable = free || occupied;
                  const cls = free
                    ? 'border-[#2ECC71]/40 bg-[#2ECC71]/10'
                    : occupied
                      ? 'border-[#F39C12]/50 bg-[#F39C12]/15'
                      : t.status === 'RESERVED'
                        ? 'border-indigo-400/40 bg-indigo-400/10'
                        : 'border-white/10 bg-white/5';
                  if (manage) {
                    return (
                      <div key={t.id} className={`relative flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-2 ${cls}`}>
                        <span className="text-sm font-bold">{t.name} {t.isVip && '⭐'}</span>
                        <span className="text-[9px] uppercase text-white/40">{t.status}</span>
                        <div className="mt-1 flex flex-wrap justify-center gap-1">
                          <button onClick={() => tablePatch(t.id, { isVip: !t.isVip })} className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] hover:bg-black/50">VIP</button>
                          {t.status !== 'AVAILABLE' && <button onClick={() => tablePatch(t.id, { status: 'AVAILABLE' })} className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] hover:bg-black/50">Free</button>}
                          {t.status !== 'CLEANING' && <button onClick={() => tablePatch(t.id, { status: 'CLEANING' })} className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] hover:bg-black/50">Clean</button>}
                          {t.status !== 'RESERVED' && <button onClick={() => tablePatch(t.id, { status: 'RESERVED' })} className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] hover:bg-black/50">Reserve</button>}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={t.id}
                      disabled={!clickable || busy}
                      onClick={() => (occupied ? resumeTable(t) : startOrder('DINE_IN', t))}
                      className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border-2 ${cls} ${clickable ? 'hover:brightness-125' : 'cursor-not-allowed opacity-70'}`}
                    >
                      {t.isVip && <span className="absolute right-1 top-1 text-[10px]">⭐</span>}
                      <span className="text-base font-bold">{t.name}</span>
                      {occupied ? (
                        <span className="text-[10px] font-semibold text-[#F39C12]">{formatMoney(t.activeOrder!.totalCents)}</span>
                      ) : (
                        <span className="text-[10px] text-white/50">{t.seats} seats</span>
                      )}
                      <span className="mt-1 text-[9px] uppercase tracking-wide text-white/40">
                        {occupied ? `Open #${t.activeOrder!.number}` : t.status}
                      </span>
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
              {table && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button onClick={() => { reloadAreas(); setTransferOpen(true); }} className="rounded-md bg-white/5 py-1.5 text-[11px] text-white/70 hover:bg-white/10">⇄ Transfer</button>
                  <button onClick={() => { reloadAreas(); setMergeOpen(true); }} className="rounded-md bg-white/5 py-1.5 text-[11px] text-white/70 hover:bg-white/10">⧉ Merge</button>
                  <button onClick={openMoveItems} disabled={busy || cart.length === 0} className="rounded-md bg-white/5 py-1.5 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-40">↦ Move items</button>
                </div>
              )}
              {/* Customer (attach at billing; enables loyalty + credit) */}
              <div className="mt-2 flex items-center gap-2">
                {order?.customerName ? (
                  <span className="flex-1 truncate rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/70">👤 {order.customerName}{order.customerPhone ? ` · ${order.customerPhone}` : ''}</span>
                ) : (
                  <span className="flex-1 text-[11px] text-white/30">No customer attached</span>
                )}
                <button onClick={() => { setBillCust({ name: order?.customerName ?? '', phone: order?.customerPhone ?? '' }); setCustModal(true); }} className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10">{order?.customerName ? 'Change' : '+ Customer'}</button>
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
                  const fired = isFired(l);
                  return (
                    <div key={l.key} className="border-b border-white/5 px-4 py-2.5">
                      <div className="grid grid-cols-[1fr_auto_auto] items-start gap-2 text-sm">
                        <span className="font-medium">
                          {l.name}
                          {l.station && l.station !== 'BILLING' && <span className="ml-1 text-[9px] text-white/30">{l.station === 'KITCHEN' ? 'KOT' : 'BOT'}</span>}
                          {fired && <span className="ml-1 rounded bg-[#F39C12]/20 px-1 text-[9px] text-[#F39C12]">fired</span>}
                        </span>
                        <span className="text-right text-white/60">{formatMoney(l.unitPriceCents + mod)}</span>
                        <span className="text-right font-semibold">{formatMoney((l.unitPriceCents + mod) * l.quantity)}</span>
                      </div>
                      {l.modifiers.length > 0 && (
                        <div className="mt-0.5 text-[11px] text-white/40">— {l.modifiers.map((m) => m.name).join(', ')}</div>
                      )}
                      {/* Per-item note (e.g. "only 2 ice cubes") */}
                      {fired ? (
                        l.notes && <div className="mt-0.5 text-[11px] italic text-amber-300/80">» {l.notes}</div>
                      ) : (
                        <div className="mt-1 flex gap-1">
                          <input
                            value={l.notes ?? ''}
                            onChange={(e) => setLineNote(l.key, e.target.value)}
                            placeholder="+ note (e.g. no ice)"
                            className="min-w-0 flex-1 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white placeholder-white/25"
                          />
                          <input
                            type="number"
                            min={0}
                            value={l.discountCents ? (l.discountCents / 100).toString() : ''}
                            disabled={!canDiscountNow}
                            onChange={(e) => setLineDiscount(l.key, e.target.value)}
                            placeholder="disc Rs"
                            title={canDiscountNow ? 'Item discount (Rs)' : 'Needs manager approval'}
                            className="w-16 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-right text-[11px] text-amber-300 placeholder-white/25 disabled:opacity-40"
                          />
                        </div>
                      )}
                      {(l.discountCents ?? 0) > 0 && (
                        <div className="text-[10px] text-amber-300/70">item −{formatMoney(l.discountCents!)}</div>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        {fired ? (
                          <span className="text-sm font-semibold">Qty {l.quantity}</span>
                        ) : (
                          <>
                            <button onClick={() => changeQty(l.key, -1)} className="h-6 w-6 rounded bg-white/10 text-white/80 hover:bg-white/20">−</button>
                            <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
                            <button onClick={() => changeQty(l.key, 1)} className="h-6 w-6 rounded bg-white/10 text-white/80 hover:bg-white/20">+</button>
                          </>
                        )}
                        <button onClick={() => cancelLine(l)} className="ml-auto rounded bg-[#E74C3C]/15 px-2 py-0.5 text-[10px] text-[#E74C3C] hover:bg-[#E74C3C]/25">Cancel</button>
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
                  <span className="flex items-center gap-1">
                    Discount
                    <button
                      disabled={!canDiscountNow}
                      onClick={() => setDiscountMode((m) => (m === 'rs' ? 'pct' : 'rs'))}
                      className="rounded bg-white/10 px-1.5 text-[10px] text-white/70 disabled:opacity-40"
                    >
                      {discountMode === 'rs' ? 'Rs' : '%'}
                    </button>
                    {!canDiscountNow && (
                      <button onClick={requestDiscountApproval} className="rounded bg-[#F39C12]/20 px-1.5 text-[10px] text-[#F39C12]">🔒 Approve</button>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} value={discount} disabled={!canDiscountNow} onChange={(e) => setDiscount(e.target.value)} placeholder="0" title={canDiscountNow ? '' : 'Needs manager approval'} className="w-16 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-right text-sm text-white disabled:opacity-40" />
                    {discountMode === 'pct' && totals.discountCents > 0 && <span className="text-[10px] text-white/40">−{formatMoney(totals.discountCents)}</span>}
                  </div>
                </div>
                {pointsAvail > 0 && (
                  <div className="flex items-center justify-between text-amber-300/80">
                    <span>⭐ Redeem pts <span className="text-white/30">(of {pointsAvail})</span></span>
                    <input type="number" min={0} max={pointsAvail} value={redeemPts} onChange={(e) => setRedeemPts(e.target.value)} placeholder="0" className="w-20 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-right text-sm text-white" />
                  </div>
                )}
                {totals.redeemCents > 0 && (
                  <div className="flex justify-between text-amber-300"><span>Points redeemed</span><span>−{formatMoney(totals.redeemCents)}</span></div>
                )}
                {serviceChargeRate > 0 && <div className="flex justify-between text-white/50"><span>Service ({Math.round(serviceChargeRate * 100)}%)</span><span>{formatMoney(totals.serviceCharge)}</span></div>}
                <div className="flex justify-between text-white/50"><span>VAT ({Math.round(vatRate * 100)}%)</span><span>{formatMoney(totals.tax)}</span></div>
                <div className="flex justify-between border-t border-white/10 pt-1.5 text-lg font-bold text-[#2ECC71]"><span>TOTAL DUE</span><span>{formatMoney(totals.total)}</span></div>
              </div>

              {/* actions */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button className="rounded-lg bg-white/10 py-2 text-xs font-semibold text-white/80 hover:bg-white/20 disabled:opacity-40" disabled={busy || !emp.canVoid} title={emp.canVoid ? '' : 'No void permission'} onClick={voidBasket}>Void Basket</button>
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
            <input className="input" value={cust.phone} onChange={(e) => { setCust({ ...cust, phone: e.target.value }); lookupCustomer(e.target.value); }} placeholder="98XXXXXXXX" />
          </div>
          {custInfo && (
            custInfo.found ? (
              <div className="rounded-lg bg-green-50 p-2.5 text-sm text-green-700">
                ⭐ Returning · <strong>{custInfo.name}</strong> · {custInfo.tier} · {custInfo.loyaltyPoints} pts · {custInfo.visitCount} visits
              </div>
            ) : cust.phone.replace(/\D/g, '').length >= 7 ? (
              <div className="rounded-lg bg-indigo-50 p-2.5 text-sm text-indigo-700">🆕 First-time customer</div>
            ) : null
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setOverlay(null); setMode(null); setCustInfo(null); }}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Starting…' : 'Start order'}</button>
          </div>
        </form>
      </Modal>

      {/* Add table */}
      <Modal open={addTableOpen} title="Add table" onClose={() => setAddTableOpen(false)}>
        <form onSubmit={addTable} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={tableForm.name} onChange={(e) => setTableForm({ ...tableForm, name: e.target.value })} placeholder="e.g. T7" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Seats</label>
              <input className="input" type="number" min={1} value={tableForm.seats} onChange={(e) => setTableForm({ ...tableForm, seats: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Area</label>
              <input className="input" value={tableForm.area} onChange={(e) => setTableForm({ ...tableForm, area: e.target.value })} placeholder="e.g. Patio" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={tableForm.isVip} onChange={(e) => setTableForm({ ...tableForm, isVip: e.target.checked })} /> VIP table
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setAddTableOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Add</button>
          </div>
        </form>
      </Modal>

      {/* Transfer table */}
      <Modal open={transferOpen} title={`Transfer ${table?.name ?? ''} to…`} onClose={() => setTransferOpen(false)}>
        <div className="grid grid-cols-4 gap-2">
          {flatTables.filter((t) => t.status === 'AVAILABLE').map((t) => (
            <button key={t.id} onClick={() => doTransfer(t.id)} className="rounded-lg border-2 border-slate-200 p-3 text-center hover:border-brand-400 hover:bg-brand-50">
              <div className="font-bold text-slate-800">{t.name}</div>
              <div className="text-[10px] text-slate-400">{t.seats} seats</div>
            </button>
          ))}
          {flatTables.filter((t) => t.status === 'AVAILABLE').length === 0 && <p className="col-span-4 text-sm text-slate-400">No free tables.</p>}
        </div>
      </Modal>

      {/* Merge table */}
      <Modal open={mergeOpen} title={`Merge another table into ${table?.name ?? ''}`} onClose={() => setMergeOpen(false)}>
        <div className="grid grid-cols-4 gap-2">
          {flatTables.filter((t) => t.status === 'OCCUPIED' && t.activeOrder && t.id !== table?.id).map((t) => (
            <button key={t.id} onClick={() => doMerge(t.activeOrder!.id)} className="rounded-lg border-2 border-slate-200 p-3 text-center hover:border-brand-400 hover:bg-brand-50">
              <div className="font-bold text-slate-800">{t.name}</div>
              <div className="text-[10px] text-slate-400">{formatMoney(t.activeOrder!.totalCents)}</div>
            </button>
          ))}
          {flatTables.filter((t) => t.status === 'OCCUPIED' && t.activeOrder && t.id !== table?.id).length === 0 && <p className="col-span-4 text-sm text-slate-400">No other occupied tables.</p>}
        </div>
      </Modal>

      {/* Move selected items to another table */}
      <Modal open={moveOpen} title="Move items to another table" onClose={() => setMoveOpen(false)}>
        <p className="mb-2 text-sm text-slate-500">1. Select items to move:</p>
        <div className="mb-4 max-h-48 space-y-1 overflow-y-auto">
          {cart.map((l) => (
            <label key={l.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <input type="checkbox" checked={!!moveSel[l.id ?? '']} disabled={!l.id} onChange={(e) => setMoveSel((s) => ({ ...s, [l.id!]: e.target.checked }))} />
              <span className="flex-1">{l.quantity}× {l.name}{l.notes ? ` (${l.notes})` : ''}</span>
              <span className="text-slate-400">{formatMoney((l.unitPriceCents + l.modifiers.reduce((s, m) => s + m.priceCents, 0)) * l.quantity)}</span>
            </label>
          ))}
        </div>
        <p className="mb-2 text-sm text-slate-500">2. Choose the destination table:</p>
        <div className="grid grid-cols-4 gap-2">
          {flatTables.filter((t) => t.id !== table?.id && (t.status === 'AVAILABLE' || (t.status === 'OCCUPIED' && t.activeOrder))).map((t) => (
            <button key={t.id} onClick={() => doMoveItems(t.id)} className="rounded-lg border-2 border-slate-200 p-3 text-center hover:border-brand-400 hover:bg-brand-50">
              <div className="font-bold text-slate-800">{t.name}</div>
              <div className="text-[10px] text-slate-400">{t.status === 'OCCUPIED' ? formatMoney(t.activeOrder!.totalCents) : `${t.seats} seats`}</div>
            </button>
          ))}
        </div>
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

      {/* attach customer at billing */}
      <Modal open={custModal} title="Add / find customer" onClose={() => setCustModal(false)}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (!billCust.phone.trim()) return; attachCustomer(billCust.name.trim(), billCust.phone.trim()); setCustModal(false); }}
          className="space-y-4"
        >
          <div>
            <label className="label">Phone</label>
            <input className="input" value={billCust.phone} onChange={(e) => setBillCust({ ...billCust, phone: e.target.value })} placeholder="98XXXXXXXX" required autoFocus />
          </div>
          <div>
            <label className="label">Name (optional)</label>
            <input className="input" value={billCust.name} onChange={(e) => setBillCust({ ...billCust, name: e.target.value })} placeholder="Customer name" />
          </div>
          <p className="text-xs text-slate-400">Attaching a customer enables loyalty points, redemption, and credit (pay-later).</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setCustModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Attach</button>
          </div>
        </form>
      </Modal>

      {/* payment */}
      <Modal open={payOpen} title="Settle payment" onClose={() => setPayOpen(false)}>
        {order && <PaymentPanel totalCents={order.totalCents} busy={busy} onCancel={() => setPayOpen(false)} onConfirm={confirmPayment} />}
      </Modal>

      {/* Day-end: count cash → close → print Z-report */}
      <Modal open={dayEndOpen} title="Day End — close cash drawer" onClose={() => setDayEndOpen(false)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">Opening float</div><div className="font-bold">{formatMoney(drawerInfo?.session?.openingFloatCents ?? 0)}</div></div>
            <div className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">Cash sales</div><div className="font-bold">{formatMoney(drawerInfo?.cashSalesCents ?? 0)}</div></div>
            <div className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">Pay-ins</div><div className="font-bold">{formatMoney(drawerInfo?.payIn ?? 0)}</div></div>
            <div className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">Pay-outs</div><div className="font-bold">{formatMoney(drawerInfo?.payOut ?? 0)}</div></div>
          </div>
          <div className="rounded-lg bg-slate-900 p-3 text-center text-white">
            <div className="text-xs uppercase tracking-wide text-slate-400">Expected in drawer</div>
            <div className="text-2xl font-bold">{formatMoney(drawerInfo?.expectedCents ?? 0)}</div>
          </div>
          <div>
            <label className="label">Counted cash (Rs)</label>
            <input className="input" type="number" min="0" step="0.01" value={countRs} onChange={(e) => setCountRs(e.target.value)} autoFocus />
            {countRs !== '' && drawerInfo?.expectedCents != null && (
              (() => { const v = dollarsToCents(parseFloat(countRs)) - drawerInfo.expectedCents; return (
                <p className={`mt-1 text-sm font-semibold ${v === 0 ? 'text-emerald-600' : v > 0 ? 'text-blue-600' : 'text-red-600'}`}>Variance: {v > 0 ? '+' : ''}{formatMoney(v)} {v < 0 ? '(short)' : v > 0 ? '(over)' : '(balanced)'}</p>
              ); })()
            )}
          </div>
          <p className="text-xs text-slate-400">Closing the day prints a detailed Z-report and ends this business day. The next login starts a new day.</p>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setDayEndOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy || countRs === ''} onClick={endDay}>{busy ? 'Closing…' : 'Close day & print report'}</button>
          </div>
        </div>
      </Modal>

      <Receipt order={receipt?.order ?? null} settings={settings} mode={receipt?.mode ?? 'BILL'} items={receipt?.items} />
      <DayReport report={dayReport} settings={settings} />
    </div>
  );
}

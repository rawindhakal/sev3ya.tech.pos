'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatMoney, dollarsToCents } from '@/lib/api';
import type {
  Category,
  Employee,
  MenuItem,
  MenuItemVariant,
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
import ConnBadge from '@/components/ConnBadge';
import ThemeToggleMini from '@/components/ThemeToggleMini';
import AutoPrintAgent from '@/components/AutoPrintAgent';
import ManagerAuth, { type ManagerCred } from '@/components/ManagerAuth';
import { formatBsLong } from '@/lib/bs-date';
import { getStatus } from '@/lib/offline';

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
  variantId?: string; // chosen portion (only sent for new lines)
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

// "17m" / "1h 23m" — how long guests have been seated (table timer).
function elapsedLabel(since: string | Date, now: Date): string {
  const mins = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60000));
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// Lightweight running-order card (GET /orders/active).
interface ActiveOrderCard {
  id: string;
  number: number;
  type: OrderType;
  status: string;
  customerName?: string | null;
  totalCents: number;
  createdAt: string;
  table?: { id: string; name: string } | null;
  _count?: { items: number };
}

const ACTIVE_STATUS_LABEL: Record<string, string> = {
  OPEN: 'NEW', SENT_TO_KITCHEN: 'KOT SENT', BILLED: 'BILLED',
};

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

  // Terminal session (username + password login)
  const [emp, setEmp] = useState<Employee | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pinErr, setPinErr] = useState('');


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
  // Running (unsettled) orders — takeaway/delivery shown as temporary tables
  // in the POS until payment is settled.
  const [activeOrders, setActiveOrders] = useState<ActiveOrderCard[]>([]);
  // Manager username+password approval dialog (replaces the PIN system).
  const [mgrAuth, setMgrAuth] = useState<{
    title: string;
    hint?: string;
    permission?: 'canVoid' | 'canDiscount' | 'canManageStaff';
    onApproved: (cred: ManagerCred) => void;
  } | null>(null);
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

  // portion picker / open item / held / payment
  const [picker, setPicker] = useState<{ item: MenuItem; variants: MenuItemVariant[] } | null>(null);
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
    // Restore a previous terminal session.
    try {
      const saved = localStorage.getItem('cakezake-emp');
      if (saved) setEmp(JSON.parse(saved));
    } catch {
      /* ignore */
    }
    return () => clearInterval(clock);
  }, []);

  async function login() {
    if (!username.trim() || !password) return setPinErr('Enter your username and password');
    try {
      const e = await api.post<Employee & { token?: string }>('/employees/login', { username: username.trim(), password });
      if (e.role === 'WAITER') {
        setPassword('');
        return setPinErr('Waiters use the Waiter Panel — the POS terminal is for cashiers and managers.');
      }
      setEmp(e);
      localStorage.setItem('cakezake-emp', JSON.stringify(e));
      if (e.token) localStorage.setItem('cakezake-token', e.token);
      setUsername('');
      setPassword('');
      setPinErr('');
    } catch {
      setPinErr('Invalid username or password');
      setPassword('');
    }
  }
  function lock() {
    setEmp(null);
    localStorage.removeItem('cakezake-emp');
    localStorage.removeItem('cakezake-token');
    resetTerminal();
  }

  // ── Cash drawer / business day ─────────────────────
  async function checkDrawer() {
    try {
      const r = await api.get<{ open: boolean; session?: { id: string; openingFloatCents: number }; expectedCents?: number; cashSalesCents?: number; payIn?: number; payOut?: number }>('/cash-drawer/current');
      setDrawerOpen(r.open);
      setDrawerInfo(r);
    } catch {
      setDrawerOpen(true); // don't block the terminal on a fetch error
    }
  }
  // At first login, require the drawer to be open to start the day.
  useEffect(() => {
    if (emp) checkDrawer();
  }, [emp]);

  async function openDrawer() {
    try {
      await api.post('/cash-drawer/open', { openingFloatCents: dollarsToCents(parseFloat(openFloat || '0')), openedBy: emp?.name });
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
      await api.post('/cash-drawer/close', { countedCents: dollarsToCents(parseFloat(countRs || '0')), closedBy: emp?.name });
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

  // ── Running takeaway/delivery orders (temporary tables) ──
  async function loadActiveOrders() {
    try { setActiveOrders(await api.get<ActiveOrderCard[]>('/orders/active')); } catch { /* offline */ }
  }
  useEffect(() => {
    if (!emp) return;
    loadActiveOrders();
    const iv = setInterval(loadActiveOrders, 12000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emp]);
  useEffect(() => { if (!order && emp) loadActiveOrders(); /* refresh after settle/void */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  async function resumeActive(id: string) {
    setBusy(true);
    try {
      resume(await api.get<Order>(`/orders/${id}`));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Takeaway/delivery orders still running — rendered like tables until settled.
  const runningPickups = activeOrders.filter((o) => o.type !== 'DINE_IN');
  const renderPickupRail = (compact = false) =>
    runningPickups.length > 0 && (
      <div className={compact ? '' : 'px-4 pb-4'}>
        <div className="mb-2 text-xs uppercase tracking-wider text-[var(--pos-text-40)]">
          🛍 Running Takeaway &amp; Delivery ({runningPickups.length})
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {runningPickups.map((o, i) => (
            <button
              key={o.id}
              disabled={busy}
              onClick={() => resumeActive(o.id)}
              className="relative flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-[#9B59B6]/50 bg-[#9B59B6]/10 p-2.5 hover:brightness-125"
            >
              <span className="absolute left-1 top-1 rounded bg-black/25 px-1 py-0.5 text-[9px] font-semibold tabular-nums text-[#F39C12]">
                ⏱ {elapsedLabel(o.createdAt, now)}
              </span>
              <span className="absolute right-1 top-1 text-[10px]">{o.type === 'DELIVERY' ? '🛵' : '🛍'}</span>
              <span className="mt-3 max-w-full truncate text-sm font-bold">
                {(o.customerName?.trim() || (o.type === 'DELIVERY' ? 'Delivery' : 'TakeAway'))}-{i + 1}
              </span>
              <span className="text-[10px] font-semibold text-[#F39C12]">{formatMoney(o.totalCents)}</span>
              <span className="text-[9px] uppercase tracking-wide text-[var(--pos-text-40)]">
                #{o.number} · {ACTIVE_STATUS_LABEL[o.status] ?? o.status}
              </span>
            </button>
          ))}
        </div>
      </div>
    );

  // ── Cart ───────────────────────────────────────────
  async function clickItem(item: MenuItem) {
    if (item.variants?.length) {
      const detail = await api.get<{ variants: MenuItemVariant[] }>(`/menu-items/${item.id}`);
      setPickSel({});
      setPicker({ item, variants: detail.variants ?? [] });
    } else {
      addLine(item, []);
    }
  }

  function addLine(item: MenuItem, mods: { name: string; priceCents: number }[], variant?: MenuItemVariant) {
    setCart((prev) => {
      const modSig = mods.map((m) => m.name).sort().join(',');
      // Merge only into an UNFIRED line with same item + variant + modifiers + no note.
      const existing = prev.find(
        (l) => !isFired(l) && l.menuItemId === item.id && !l.notes && l.variantId === variant?.id &&
          l.modifiers.map((m) => m.name).sort().join(',') === modSig,
      );
      if (existing) return prev.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, {
        key: lineKey(item.id + (variant?.id ?? ''), mods),
        menuItemId: item.id,
        variantId: variant?.id,
        name: variant ? `${item.name} (${variant.name})` : item.name,
        unitPriceCents: variant ? variant.priceCents : priceForType(item, orderType),
        modifiers: mods,
        quantity: 1,
        station: item.station,
      }];
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

  // Discounts require the discount permission — or a one-off manager approval
  // (username + password; the PIN system is retired).
  const canDiscountNow = !!emp?.canDiscount || discountApproved;
  function requestDiscountApproval() {
    setMgrAuth({
      title: 'Authorise discount',
      hint: 'A manager or admin must sign in to allow discounts on this order.',
      permission: 'canDiscount',
      onApproved: ({ emp: m }) => {
        setDiscountApproved(true);
        flash(`Discount authorised by ${m.name}`);
      },
    });
  }

  function confirmPicker() {
    if (!picker) return;
    // A portion is required when the item has variants.
    let variant: MenuItemVariant | undefined;
    if (picker.variants.length) {
      const vid = pickSel['__variant']?.[0];
      variant = picker.variants.find((v) => v.id === vid);
      if (!variant) return flash('Choose a portion');
    }
    addLine(picker.item, [], variant);
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
        ...(l.menuItemId ? { menuItemId: l.menuItemId, ...(l.variantId ? { variantId: l.variantId } : {}) } : { name: l.name, unitPriceCents: l.unitPriceCents }),
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
      // Acknowledge before the dialog so the desktop auto-printer never doubles.
      const ids = [...kitchen, ...bar].map((i) => i.id);
      if (ids.length) api.post('/orders/kot-queue/printed', { itemIds: ids }).catch(() => {});
      if (kitchen.length) await printTicket(res.order, 'KOT', kitchen);
      if (bar.length) await printTicket(res.order, 'BOT', bar);
    }
    return res.order;
  }

  // Offline KOT — fire the kitchen/bar ticket without the server. Prints the
  // pending lines locally (station looked up from the cached menu for new lines),
  // marks them fired, and queues the cart-save + KOT-fire to replay on reconnect.
  // Only for an order that already exists on the server (created while online).
  async function offlineKot(print: boolean) {
    if (!order?.id) return flash('Cannot start a new order while offline');
    const toFire = cart.filter((l) => !isFired(l));
    if (!toFire.length) return flash('Nothing new to fire');
    const stationFor = (l: CartLine) => l.station || items.find((m) => m.id === l.menuItemId)?.station || 'BILLING';

    // Queue the persist + fire (FIFO: cart save first, then KOT), idempotent.
    const cartBody = {
      items: cart.map((l) => ({
        id: l.id,
        ...(l.menuItemId ? { menuItemId: l.menuItemId, ...(l.variantId ? { variantId: l.variantId } : {}) } : { name: l.name, unitPriceCents: l.unitPriceCents }),
        quantity: l.quantity,
        discountCents: l.discountCents || 0,
        modifiers: l.modifiers,
        notes: l.notes,
      })),
      discountCents: totals.discountCents + totals.redeemCents,
      waiterId: waiterId || undefined,
      guestCount,
    };
    try { await api.putQueued(`/orders/${order.id}/cart`, cartBody); } catch { /* queued */ }
    try { await api.postQueued(`/orders/${order.id}/kot`, {}); } catch { /* queued */ }

    // Print locally, split by station.
    if (print) {
      const mk = (l: CartLine): OrderItem => ({ id: l.id ?? l.key, nameSnapshot: l.name, quantity: l.quantity, station: stationFor(l), modifiers: l.modifiers, notes: l.notes } as unknown as OrderItem);
      const kitchen = toFire.filter((l) => stationFor(l) === 'KITCHEN').map(mk);
      const bar = toFire.filter((l) => stationFor(l) === 'BAR').map(mk);
      if (kitchen.length) await printTicket(order, 'KOT', kitchen);
      if (bar.length) await printTicket(order, 'BOT', bar);
    }
    // Optimistically lock the fired lines.
    setCart((prev) => prev.map((l) => (isFired(l) ? l : { ...l, kotStatus: 'FIRED', station: stationFor(l) })));
    flash('KOT printed offline — will sync when back online');
  }

  async function runAction(kind: 'draft' | 'kot' | 'kot_print' | 'bill' | 'bill_print' | 'pay') {
    if (cart.length === 0) return flash('Add at least one item first');
    // Offline: KOT still works locally; billing/payment need the server.
    if (getStatus() === 'offline') {
      if (kind === 'kot' || kind === 'kot_print') { setBusy(true); try { await offlineKot(kind === 'kot_print'); } finally { setBusy(false); } return; }
      return flash('Offline — KOT works, but billing & payment need the connection');
    }
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
      // A drop mid-action: fall back to offline KOT rather than losing the ticket.
      if ((kind === 'kot' || kind === 'kot_print') && getStatus() === 'offline') {
        await offlineKot(kind === 'kot_print');
      } else {
        alert((e as Error).message);
      }
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

    const run = async (overrideToken?: string) => {
      setBusy(true);
      try {
        const path = `/orders/${order.id}/items/${l.id}/cancel`;
        const body = { reason: reason.trim() };
        const res = overrideToken
          ? await api.postAs<{ order: Order; cancelledItem: OrderItem; wasFired: boolean }>(overrideToken, path, body)
          : await api.post<{ order: Order; cancelledItem: OrderItem; wasFired: boolean }>(path, body);
        setOrder(res.order);
        setCart(orderToCart(res.order));
        // If it had already been fired, tell the station via a cancellation ticket.
        if (res.wasFired && l.station && l.station !== 'BILLING') {
          await printTicket(res.order, 'CANCEL', [{ ...res.cancelledItem }]);
        }
        flash('Item cancelled');
      } catch (e) {
        const msg = (e as Error).message;
        // Lacking the void permission → ask a manager to approve with their login.
        if (!overrideToken && /permission|Requires|sign-in/i.test(msg)) {
          setMgrAuth({
            title: 'Approve cancellation',
            hint: `Cancelling "${l.name}" (already sent to the kitchen) needs a manager.`,
            permission: 'canVoid',
            onApproved: ({ token }) => void run(token),
          });
        } else {
          alert(msg);
        }
      } finally {
        setBusy(false);
      }
    };
    await run();
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

  // ── Username + password login gate ──────────────
  if (!emp) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--pos-bg)] text-[var(--pos-text)]">
        <div className="w-80 rounded-2xl border border-[var(--pos-line)] bg-[var(--pos-card)] p-6 text-center">
          <div className="mb-1 text-3xl">🍰</div>
          <div className="mb-1 font-bold tracking-wide">POS TERMINAL</div>
          <p className="mb-4 text-xs text-[var(--pos-text-40)]">Sign in with your username &amp; password</p>
          {pinErr && <p className="mb-3 text-xs text-[#E74C3C]">{pinErr}</p>}
          <div className="space-y-2 text-left">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              autoFocus
              autoComplete="username"
              placeholder="Username"
              className="w-full rounded-lg border border-[var(--pos-line)] bg-[var(--pos-surface)] px-3 py-2.5 text-sm text-[var(--pos-text)] placeholder-[var(--pos-placeholder)] outline-none focus:border-[#2ECC71]/60"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              className="w-full rounded-lg border border-[var(--pos-line)] bg-[var(--pos-surface)] px-3 py-2.5 text-sm text-[var(--pos-text)] placeholder-[var(--pos-placeholder)] outline-none focus:border-[#2ECC71]/60"
            />
          </div>
          <button onClick={login} className="mt-3 w-full rounded-lg bg-[#2ECC71] py-2.5 text-sm font-bold text-black hover:bg-[#28b463]">Sign in</button>
        </div>
      </div>
    );
  }

  // ── Open-drawer gate (cash drawer at first login) ──
  if (drawerOpen === false) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--pos-bg)] text-[var(--pos-text)]">
        <div className="w-80 rounded-2xl border border-[var(--pos-line)] bg-[var(--pos-card)] p-6 text-center">
          <div className="mb-1 text-3xl">💵</div>
          <div className="mb-1 font-bold tracking-wide">OPEN CASH DRAWER</div>
          <p className="mb-4 text-xs text-[var(--pos-text-40)]">Enter the opening cash balance to start the day. The business day runs until you close it (Day End).</p>
          <label className="mb-1 block text-left text-xs uppercase tracking-wider text-[var(--pos-text-40)]">Opening balance (Rs)</label>
          <input
            type="number" min="0" step="0.01" value={openFloat} onChange={(e) => setOpenFloat(e.target.value)}
            className="mb-4 w-full rounded-lg border border-[var(--pos-line)] bg-[var(--pos-surface)] px-3 py-2 text-right text-lg text-[var(--pos-text)]" placeholder="0.00" autoFocus
          />
          <button onClick={openDrawer} className="w-full rounded-lg bg-[#2ECC71] py-3 font-bold text-black hover:bg-[#28b463]">Open drawer &amp; start day</button>
          <button onClick={lock} className="mt-2 text-xs text-[var(--pos-text-40)] hover:text-[var(--pos-text)]">Sign out</button>
        </div>
        <DayReport report={dayReport} settings={settings} />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────
  return (
    <div className="flex h-full flex-col bg-[var(--pos-bg)] text-[var(--pos-text)]">
      <AutoPrintAgent />
      <ManagerAuth
        open={!!mgrAuth}
        title={mgrAuth?.title}
        hint={mgrAuth?.hint}
        permission={mgrAuth?.permission}
        onApproved={(cred) => mgrAuth?.onApproved(cred)}
        onClose={() => setMgrAuth(null)}
      />
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#2ECC71] px-4 py-2 text-sm font-medium text-black shadow-lg">
          {toast}
        </div>
      )}

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-1.5 border-b border-[var(--pos-line)] bg-[var(--pos-inset)] px-3 py-2 text-sm sm:px-5 sm:py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--pos-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--pos-text-80)] hover:bg-[var(--pos-surface-hover)] disabled:opacity-40"
            title={table ? 'Back to table floor (holds this bill)' : 'Back to order modes'}
          >
            ‹ Back
          </button>
          <span className="text-lg">🍰</span>
          <span className="font-bold tracking-wide">POS TERMINAL</span>
          <span className="text-[var(--pos-text-40)]">·</span>
          <span className="text-[var(--pos-text-60)]">{emp.name} ({emp.role})</span>
          <button onClick={() => { checkDrawer(); setCountRs(''); setDayEndOpen(true); }} className="rounded-md bg-[#E74C3C]/15 px-2 py-1 text-[11px] font-semibold text-[#E74C3C] hover:bg-[#E74C3C]/25" title="Close the business day">🌙 Day End</button>
          <ThemeToggleMini />
          <button onClick={lock} className="rounded-md bg-[var(--pos-surface)] px-2 py-1 text-[11px] text-[var(--pos-text-60)] hover:bg-[var(--pos-surface-hover)]" title="Lock terminal">🔒 Lock</button>
        </div>
        <div className="flex items-center gap-4">
          <nav className="hidden items-center gap-1 text-xs lg:flex">
            {[
              { label: 'Dashboard', path: '/' },
              { label: 'Reservations', path: '/reservations' },
              { label: 'Orders', path: '/orders' },
              { label: 'Menu', path: '/menu' },
            ].map((l) => (
              <button key={l.path} onClick={() => exitTo(l.path)} className="rounded-md px-2 py-1 text-[var(--pos-text-50)] hover:bg-[var(--pos-surface-hover)] hover:text-[var(--pos-text)]">
                {l.label}
              </button>
            ))}
          </nav>
          <ConnBadge />
          <span className="text-[var(--pos-text-60)] tabular-nums" title={now.toLocaleDateString()}>
            {formatBsLong(now)} · {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button onClick={() => exitTo('/settings')} className="text-[var(--pos-text-60)] hover:text-[var(--pos-text)]">⚙ Settings</button>
        </div>
      </div>

      {/* Order modes */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--pos-line)] bg-[var(--pos-bg)] px-3 py-2 sm:px-4 sm:py-2.5">
        <span className="mr-1 hidden text-xs font-semibold uppercase tracking-wider text-[var(--pos-text-40)] sm:inline">Order Mode</span>
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              disabled={busy}
              onClick={() => selectMode(m.key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${
                active ? 'bg-[#2ECC71] text-black' : 'bg-[var(--pos-surface)] text-[var(--pos-text-70)] hover:bg-[var(--pos-surface-hover)]'
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
                  <span className="text-xs uppercase tracking-wider text-[var(--pos-text-40)]">Waiter</span>
                  <select className="rounded-md border border-[var(--pos-line)] bg-[var(--pos-surface)] px-2 py-1 text-sm" value={waiterId} onChange={(e) => setWaiterId(e.target.value)}>
                    <option value="" className="text-black">Unassigned</option>
                    {waiters.map((w) => <option key={w.id} value={w.id} className="text-black">{w.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-[var(--pos-text-40)]">Guests</span>
                  <input type="number" min={1} className="w-16 rounded-md border border-[var(--pos-line)] bg-[var(--pos-surface)] px-2 py-1 text-sm" value={guestCount} onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value)))} />
                </div>
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setAddTableOpen(true)} className="rounded-lg bg-[var(--pos-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--pos-text-80)] hover:bg-[var(--pos-surface-hover)]">+ Add Table</button>
              <button onClick={() => setManage((v) => !v)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${manage ? 'bg-[#2ECC71] text-black' : 'bg-[var(--pos-surface)] text-[var(--pos-text-80)] hover:bg-[var(--pos-surface-hover)]'}`}>
                {manage ? '✓ Done' : '✎ Manage'}
              </button>
              <button onClick={resetTerminal} className="text-sm text-[var(--pos-text-50)] hover:text-[var(--pos-text)]">← Modes</button>
            </div>
          </div>
          {areas.map((a) => (
            <div key={a.area} className="mb-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--pos-text-40)]">{a.area}</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 sm:gap-3">
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
                        : 'border-[var(--pos-line)] bg-[var(--pos-surface)]';
                  if (manage) {
                    return (
                      <div key={t.id} className={`relative flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-2 ${cls}`}>
                        <span className="text-sm font-bold">{t.name} {t.isVip && '⭐'}</span>
                        <span className="text-[9px] uppercase text-[var(--pos-text-40)]">{t.status}</span>
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
                      {occupied && t.activeOrder!.seatedAt && (
                        <span className="absolute left-1 top-1 rounded bg-black/25 px-1 py-0.5 text-[9px] font-semibold tabular-nums text-[#F39C12]" title="Guest seated for">
                          ⏱ {elapsedLabel(t.activeOrder!.seatedAt, now)}
                        </span>
                      )}
                      <span className="text-base font-bold">{t.name}</span>
                      {occupied ? (
                        <span className="text-[10px] font-semibold text-[#F39C12]">{formatMoney(t.activeOrder!.totalCents)}</span>
                      ) : (
                        <span className="text-[10px] text-[var(--pos-text-50)]">{t.seats} seats</span>
                      )}
                      <span className="mt-1 text-[9px] uppercase tracking-wide text-[var(--pos-text-40)]">
                        {occupied ? `Open #${t.activeOrder!.number}` : t.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {renderPickupRail()}
        </div>
      ) : !order ? (
        <div className="flex flex-1 flex-col overflow-y-auto">
          {runningPickups.length > 0 && <div className="p-4">{renderPickupRail(true)}</div>}
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="text-[var(--pos-text-40)]">
              <div className="mb-2 text-5xl">🧾</div>
              <p className="text-lg font-medium">Select an order mode to begin</p>
              <p className="text-sm text-[var(--pos-text-30)]">Dine-In · Takeaway · Home Delivery · Quick-Bill</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Menu / grid area */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="border-b border-[var(--pos-line)] p-3">
              <div className="mb-2 flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-[var(--pos-line)] bg-[var(--pos-surface)] px-3 py-2 text-sm text-[var(--pos-text)] placeholder-[var(--pos-placeholder)] outline-none focus:border-[#2ECC71]"
                  placeholder="🔍 Search item by initials (e.g. CB → Chicken Burger)…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                <button className="rounded-lg border border-[var(--pos-line)] bg-[var(--pos-surface)] px-3 py-2 text-xs text-[var(--pos-text-70)] hover:bg-[var(--pos-surface-hover)]" onClick={() => setOpenItem({ name: '', price: '' })}>
                  + Custom
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setActiveCat('all')} className={`rounded-md px-3 py-1 text-xs font-medium ${activeCat === 'all' ? 'bg-[#2ECC71] text-black' : 'bg-[var(--pos-surface)] text-[var(--pos-text-60)]'}`}>All</button>
                {categories.map((c) => (
                  <button key={c.id} onClick={() => setActiveCat(c.id)} className={`rounded-md px-3 py-1 text-xs font-medium ${activeCat === c.id ? 'bg-[#2ECC71] text-black' : 'bg-[var(--pos-surface)] text-[var(--pos-text-60)]'}`}>{c.name}</button>
                ))}
              </div>
            </div>
            <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2.5 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredItems.map((item) => (
                <button key={item.id} onClick={() => clickItem(item)} className="flex flex-col items-start rounded-xl border border-[var(--pos-line)] bg-[var(--pos-surface)] p-3 text-left transition-colors hover:border-[#2ECC71]/50 hover:bg-[var(--pos-surface-hover)]">
                  <span className="font-semibold leading-tight">{item.name}</span>
                  <span className="mt-2 font-bold text-[#2ECC71]">
                    {item.variants && item.variants.length > 0
                      ? `from ${formatMoney(Math.min(...item.variants.map((v) => v.priceCents)))}`
                      : formatMoney(priceForType(item, orderType))}
                  </span>
                  {item.variants && item.variants.length > 0 && <span className="mt-1 text-[10px] text-[var(--pos-text-30)]">portions</span>}
                </button>
              ))}
              {filteredItems.length === 0 && <p className="col-span-full py-10 text-center text-sm text-[var(--pos-text-30)]">No items found</p>}
            </div>
          </div>

          {/* Cart summary */}
          <aside className="flex max-h-[55%] w-full shrink-0 flex-col border-t border-[var(--pos-line)] bg-[var(--pos-card)] lg:max-h-none lg:w-[400px] lg:border-l lg:border-t-0">
            <div className="border-b border-[var(--pos-line)] px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-[var(--pos-text-40)]">Active Cart {order && `· #${order.number}`}</div>
                  <div className="font-bold">
                    {table ? `Table ${table.name}` : isQuick ? 'Quick Bill' : mode === 'DELIVERY' ? 'Home Delivery' : 'Takeaway'}
                  </div>
                </div>
                {orderType === 'DINE_IN' && (
                  <select className="rounded-md border border-[var(--pos-line)] bg-[var(--pos-surface)] px-2 py-1 text-xs" value={waiterId} onChange={(e) => setWaiterId(e.target.value)}>
                    <option value="">No waiter</option>
                    {waiters.map((w) => <option key={w.id} value={w.id} className="text-black">{w.name}</option>)}
                  </select>
                )}
              </div>
              {table && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button onClick={() => { reloadAreas(); setTransferOpen(true); }} className="rounded-md bg-[var(--pos-surface)] py-1.5 text-[11px] text-[var(--pos-text-70)] hover:bg-[var(--pos-surface-hover)]">⇄ Transfer</button>
                  <button onClick={() => { reloadAreas(); setMergeOpen(true); }} className="rounded-md bg-[var(--pos-surface)] py-1.5 text-[11px] text-[var(--pos-text-70)] hover:bg-[var(--pos-surface-hover)]">⧉ Merge</button>
                  <button onClick={openMoveItems} disabled={busy || cart.length === 0} className="rounded-md bg-[var(--pos-surface)] py-1.5 text-[11px] text-[var(--pos-text-70)] hover:bg-[var(--pos-surface-hover)] disabled:opacity-40">↦ Move items</button>
                </div>
              )}
              {/* Customer (attach at billing; enables loyalty + credit) */}
              <div className="mt-2 flex items-center gap-2">
                {order?.customerName ? (
                  <span className="flex-1 truncate rounded-md bg-[var(--pos-surface)] px-2 py-1 text-[11px] text-[var(--pos-text-70)]">👤 {order.customerName}{order.customerPhone ? ` · ${order.customerPhone}` : ''}</span>
                ) : (
                  <span className="flex-1 text-[11px] text-[var(--pos-text-30)]">No customer attached</span>
                )}
                <button onClick={() => { setBillCust({ name: order?.customerName ?? '', phone: order?.customerPhone ?? '' }); setCustModal(true); }} className="rounded-md bg-[var(--pos-surface)] px-2 py-1 text-[11px] text-[var(--pos-text-70)] hover:bg-[var(--pos-surface-hover)]">{order?.customerName ? 'Change' : '+ Customer'}</button>
              </div>
            </div>

            {/* item table */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-[var(--pos-line)] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--pos-text-30)]">
                <span>Item</span><span className="text-right">Unit</span><span className="text-right">Total</span>
              </div>
              {cart.length === 0 ? (
                <p className="py-12 text-center text-sm text-[var(--pos-text-30)]">Tap items to add them</p>
              ) : (
                cart.map((l) => {
                  const mod = l.modifiers.reduce((s, m) => s + m.priceCents, 0);
                  const fired = isFired(l);
                  return (
                    <div key={l.key} className="border-b border-[var(--pos-line)] px-4 py-2.5">
                      <div className="grid grid-cols-[1fr_auto_auto] items-start gap-2 text-sm">
                        <span className="font-medium">
                          {l.name}
                          {l.station && l.station !== 'BILLING' && <span className="ml-1 text-[9px] text-[var(--pos-text-30)]">{l.station === 'KITCHEN' ? 'KOT' : 'BOT'}</span>}
                          {fired && <span className="ml-1 rounded bg-[#F39C12]/20 px-1 text-[9px] text-[#F39C12]">fired</span>}
                        </span>
                        <span className="text-right text-[var(--pos-text-60)]">{formatMoney(l.unitPriceCents + mod)}</span>
                        <span className="text-right font-semibold">{formatMoney((l.unitPriceCents + mod) * l.quantity)}</span>
                      </div>
                      {l.modifiers.length > 0 && (
                        <div className="mt-0.5 text-[11px] text-[var(--pos-text-40)]">— {l.modifiers.map((m) => m.name).join(', ')}</div>
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
                            className="min-w-0 flex-1 rounded border border-[var(--pos-line)] bg-[var(--pos-surface)] px-2 py-0.5 text-[11px] text-[var(--pos-text)] placeholder-[var(--pos-placeholder)]"
                          />
                          <input
                            type="number"
                            min={0}
                            value={l.discountCents ? (l.discountCents / 100).toString() : ''}
                            disabled={!canDiscountNow}
                            onChange={(e) => setLineDiscount(l.key, e.target.value)}
                            placeholder="disc Rs"
                            title={canDiscountNow ? 'Item discount (Rs)' : 'Needs manager approval'}
                            className="w-16 rounded border border-[var(--pos-line)] bg-[var(--pos-surface)] px-2 py-0.5 text-right text-[11px] text-amber-300 placeholder-[var(--pos-placeholder)] disabled:opacity-40"
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
                            <button onClick={() => changeQty(l.key, -1)} className="h-6 w-6 rounded bg-[var(--pos-surface-strong)] text-[var(--pos-text-80)] hover:bg-[var(--pos-surface-hover)]">−</button>
                            <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
                            <button onClick={() => changeQty(l.key, 1)} className="h-6 w-6 rounded bg-[var(--pos-surface-strong)] text-[var(--pos-text-80)] hover:bg-[var(--pos-surface-hover)]">+</button>
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
            <div className="border-t border-[var(--pos-line)] px-4 py-3">
              {custLabel && <div className="mb-2 rounded-lg bg-[var(--pos-surface)] px-3 py-1.5 text-xs text-[var(--pos-text-60)]">👤 {custLabel}</div>}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-[var(--pos-text-50)]"><span>Sub-Total ({totals.count} items)</span><span>{formatMoney(totals.subtotal)}</span></div>
                <div className="flex items-center justify-between text-[var(--pos-text-50)]">
                  <span className="flex items-center gap-1">
                    Discount
                    <button
                      disabled={!canDiscountNow}
                      onClick={() => setDiscountMode((m) => (m === 'rs' ? 'pct' : 'rs'))}
                      className="rounded bg-[var(--pos-surface-strong)] px-1.5 text-[10px] text-[var(--pos-text-70)] disabled:opacity-40"
                    >
                      {discountMode === 'rs' ? 'Rs' : '%'}
                    </button>
                    {!canDiscountNow && (
                      <button onClick={requestDiscountApproval} className="rounded bg-[#F39C12]/20 px-1.5 text-[10px] text-[#F39C12]">🔒 Approve</button>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} value={discount} disabled={!canDiscountNow} onChange={(e) => setDiscount(e.target.value)} placeholder="0" title={canDiscountNow ? '' : 'Needs manager approval'} className="w-16 rounded border border-[var(--pos-line)] bg-[var(--pos-surface)] px-2 py-0.5 text-right text-sm text-[var(--pos-text)] disabled:opacity-40" />
                    {discountMode === 'pct' && totals.discountCents > 0 && <span className="text-[10px] text-[var(--pos-text-40)]">−{formatMoney(totals.discountCents)}</span>}
                  </div>
                </div>
                {pointsAvail > 0 && (
                  <div className="flex items-center justify-between text-amber-300/80">
                    <span>⭐ Redeem pts <span className="text-[var(--pos-text-30)]">(of {pointsAvail})</span></span>
                    <input type="number" min={0} max={pointsAvail} value={redeemPts} onChange={(e) => setRedeemPts(e.target.value)} placeholder="0" className="w-20 rounded border border-[var(--pos-line)] bg-[var(--pos-surface)] px-2 py-0.5 text-right text-sm text-[var(--pos-text)]" />
                  </div>
                )}
                {totals.redeemCents > 0 && (
                  <div className="flex justify-between text-amber-300"><span>Points redeemed</span><span>−{formatMoney(totals.redeemCents)}</span></div>
                )}
                {serviceChargeRate > 0 && <div className="flex justify-between text-[var(--pos-text-50)]"><span>Service ({Math.round(serviceChargeRate * 100)}%)</span><span>{formatMoney(totals.serviceCharge)}</span></div>}
                <div className="flex justify-between text-[var(--pos-text-50)]"><span>VAT ({Math.round(vatRate * 100)}%)</span><span>{formatMoney(totals.tax)}</span></div>
                <div className="flex justify-between border-t border-[var(--pos-line)] pt-1.5 text-lg font-bold text-[#2ECC71]"><span>TOTAL DUE</span><span>{formatMoney(totals.total)}</span></div>
              </div>

              {/* actions */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button className="rounded-lg bg-[var(--pos-surface-strong)] py-2 text-xs font-semibold text-[var(--pos-text-80)] hover:bg-[var(--pos-surface-hover)] disabled:opacity-40" disabled={busy || !emp.canVoid} title={emp.canVoid ? '' : 'No void permission'} onClick={voidBasket}>Void Basket</button>
                <button className="rounded-lg bg-[var(--pos-surface-strong)] py-2 text-xs font-semibold text-[var(--pos-text-80)] hover:bg-[var(--pos-surface-hover)] disabled:opacity-40" disabled={busy || isQuick} onClick={() => runAction('kot_print')}>Print KOT</button>
                <button className="rounded-lg bg-[#2ECC71] py-2 text-xs font-bold text-black hover:bg-[#28b463] disabled:opacity-40" disabled={busy} onClick={() => runAction('pay')}>Proceed to Pay</button>
              </div>
              {!isQuick && (
                <div className="mt-2 grid grid-cols-4 gap-2">
                  <button className="rounded-lg bg-[var(--pos-surface)] py-1.5 text-[11px] text-[var(--pos-text-60)] hover:bg-[var(--pos-surface-hover)]" disabled={busy} onClick={() => runAction('draft')}>Hold</button>
                  <button className="rounded-lg bg-[var(--pos-surface)] py-1.5 text-[11px] text-[var(--pos-text-60)] hover:bg-[var(--pos-surface-hover)]" disabled={busy} onClick={() => runAction('kot')}>KOT</button>
                  <button className="rounded-lg bg-[var(--pos-surface)] py-1.5 text-[11px] text-[var(--pos-text-60)] hover:bg-[var(--pos-surface-hover)]" disabled={busy} onClick={() => runAction('bill')}>Bill</button>
                  <button className="rounded-lg bg-[var(--pos-surface)] py-1.5 text-[11px] text-[var(--pos-text-60)] hover:bg-[var(--pos-surface-hover)]" disabled={busy} onClick={() => runAction('bill_print')}>Bill+Print</button>
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

      {/* portion picker */}
      <Modal open={!!picker} title={picker ? `Portion · ${picker.item.name}` : ''} onClose={() => setPicker(null)}>
        {picker && (
          <div className="space-y-4">
            {picker.variants.length > 0 && (
              <div>
                <div className="label">Portion <span className="text-slate-400">(required)</span></div>
                <div className="space-y-1.5">
                  {picker.variants.map((v) => (
                    <label key={v.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <input type="radio" name="__variant" checked={pickSel['__variant']?.[0] === v.id} onChange={() => setPickSel((p) => ({ ...p, __variant: [v.id] }))} />
                      <span className="flex-1">{v.name}</span>
                      <span className="font-semibold text-brand-600">{formatMoney(v.priceCents)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
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
          <div className="rounded-lg bg-slate-900 p-3 text-center text-[var(--pos-text)]">
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

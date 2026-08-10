'use client';

// Public QR table-ordering page (matrix gap #1) — a guest scans the table's
// QR code and lands here with no login. Same route works as a fixed kiosk
// screen at the counter (just point a tablet's browser at the table's link).
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, formatMoney, setTenantSlug } from '@/lib/api';
import type { Category, MenuItem, MenuItemVariant, Order } from '@/lib/types';
import Modal from '@/components/Modal';
import { notify } from '@/lib/dialog';

interface CartLine {
  key: string;
  menuItemId: string;
  variantId?: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
}

interface MenuPayload {
  table: { id: string; name: string; area?: string | null };
  categories: Category[];
  items: MenuItem[];
  order: Order | null;
  restaurantName: string;
  currencySymbol: string;
}

const STARS = [1, 2, 3, 4, 5];

export default function SelfOrderPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  // "Open order for this table" (from the API) is null the instant an order
  // is paid — that's correct for figuring out whether to start a new order,
  // but wrong for tracking THIS device's order through to a thank-you/
  // feedback screen. So once this device places an order, remember its id
  // (survives a reload) and poll that order directly by id from then on,
  // which has no such status filter.
  const storageKey = `s3vya-self-order-${token}`;

  const [data, setData] = useState<MenuPayload | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [knownOrderId, setKnownOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [picker, setPicker] = useState<MenuItem | null>(null);
  const [sending, setSending] = useState(false);
  const [callSent, setCallSent] = useState(false);
  const [contact, setContact] = useState<{ name: string; phone: string } | null>(null);
  const [askContact, setAskContact] = useState(false);
  const [feedback, setFeedback] = useState<{ rating: number; comment: string } | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);

  // Pick up ?tenant= once so every api.* call carries the right X-Tenant
  // header even when this link isn't opened on the tenant's own subdomain.
  // Read directly from window.location (not useSearchParams) so this page
  // stays a plain client component with no prerender/Suspense requirement.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tenant');
    if (t) setTenantSlug(t);
    const remembered = sessionStorage.getItem(storageKey);
    if (remembered) setKnownOrderId(remembered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function rememberOrder(id: string | null) {
    setKnownOrderId(id);
    if (id) sessionStorage.setItem(storageKey, id);
    else sessionStorage.removeItem(storageKey);
  }

  async function load() {
    try {
      const d = await api.get<MenuPayload>(`/self-order/table/${token}`);
      setData(d);
      // Only adopt the table's currently-open order if this device isn't
      // already tracking a specific order of its own.
      if (!knownOrderId && d.order) setOrder(d.order);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Poll the specific order (by id) once known — this is what lets the
  // customer actually see PAID status land, since the table's "open order"
  // endpoint stops returning it the moment it's paid.
  useEffect(() => {
    if (!knownOrderId) return;
    async function poll() {
      try {
        setOrder(await api.get<Order>(`/orders/${knownOrderId}`, { silent: true }));
      } catch { /* offline */ }
    }
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [knownOrderId]);

  // Once settled, stop remembering this order — a later fresh visit to the
  // same table (new sessionStorage lookup) should start clean rather than
  // resurrecting a long-past thank-you screen. The in-memory `order` is left
  // alone so the current tab keeps showing it.
  useEffect(() => {
    if (order && ['PAID', 'CANCELLED', 'REFUNDED'].includes(order.status)) rememberOrder(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status]);

  const categories = data?.categories ?? [];
  const items = useMemo(
    () => (data?.items ?? []).filter((i) => activeCat === 'all' || i.categoryId === activeCat),
    [data, activeCat],
  );

  function addToCart(item: MenuItem, variant?: MenuItemVariant) {
    const key = variant ? `${item.id}:${variant.id}` : item.id;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, {
        key,
        menuItemId: item.id,
        variantId: variant?.id,
        name: variant ? `${item.name} (${variant.name})` : item.name,
        unitPriceCents: variant ? variant.priceCents : item.priceCents,
        quantity: 1,
      }];
    });
    setPicker(null);
  }

  function tapItem(item: MenuItem) {
    if (item.variants?.length) setPicker(item);
    else addToCart(item);
  }

  function changeQty(key: string, delta: number) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0));
  }

  const cartTotal = cart.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);

  async function sendOrder(name?: string, phone?: string) {
    if (cart.length === 0) return;
    setSending(true);
    try {
      const fired = await api.post<Order>(`/self-order/table/${token}/items`, {
        items: cart.map((l) => ({ menuItemId: l.menuItemId, variantId: l.variantId, quantity: l.quantity })),
        customerName: name,
        customerPhone: phone,
      });
      setOrder(fired);
      rememberOrder(fired.id);
      setCart([]);
      setCartOpen(false);
      setAskContact(false);
      if (name || phone) setContact({ name: name ?? '', phone: phone ?? '' });
      notify('Order sent! 🍳', 'success');
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }

  function startSend() {
    // Only ask for contact details once — before the very first order on
    // this visit (enables the "order ready" SMS); after that, just send.
    if (!order && !contact) setAskContact(true);
    else sendOrder(contact?.name, contact?.phone);
  }

  async function callWaiter() {
    try {
      await api.post(`/self-order/table/${token}/call-waiter`, {});
      setCallSent(true);
      setTimeout(() => setCallSent(false), 4000);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function submitFeedback() {
    if (!order || !feedback?.rating) return;
    try {
      await api.post(`/orders/${order.id}/feedback`, { rating: feedback.rating, comment: feedback.comment || undefined });
      setFeedbackSent(true);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-slate-50 p-8 text-center">
        <div className="text-4xl">🍽️</div>
        <p className="text-slate-500">{error}</p>
      </div>
    );
  }
  if (!data) {
    return <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400">Loading menu…</div>;
  }

  const paid = order?.status === 'PAID';

  // ── Paid: thank-you + feedback ──
  if (paid) {
    return (
      <div className="mx-auto flex h-screen max-w-md flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
        <div className="text-5xl">🙏</div>
        <h1 className="text-xl font-bold text-slate-900">Thank you for visiting {data.restaurantName}!</h1>
        {feedbackSent ? (
          <p className="text-slate-500">Your feedback helps us improve. See you again soon!</p>
        ) : (
          <div className="card w-full space-y-3 p-5">
            <p className="text-sm font-medium text-slate-600">How was your experience?</p>
            <div className="flex justify-center gap-1 text-3xl">
              {STARS.map((s) => (
                <button key={s} onClick={() => setFeedback({ rating: s, comment: feedback?.comment ?? '' })} className={s <= (feedback?.rating ?? 0) ? 'text-amber-400' : 'text-slate-200'}>★</button>
              ))}
            </div>
            <textarea
              className="input"
              rows={2}
              placeholder="Anything you'd like to tell us? (optional)"
              value={feedback?.comment ?? ''}
              onChange={(e) => setFeedback({ rating: feedback?.rating ?? 0, comment: e.target.value })}
            />
            <button className="btn-primary w-full" disabled={!feedback?.rating} onClick={submitFeedback}>Submit feedback</button>
          </div>
        )}
      </div>
    );
  }

  // ── Order placed: live status view ──
  if (order && (order.status === 'SENT_TO_KITCHEN' || order.status === 'READY' || order.status === 'SERVED' || order.status === 'BILLED')) {
    const statusLabel = { SENT_TO_KITCHEN: 'Preparing', READY: 'Ready!', SERVED: 'Served', BILLED: 'Bill ready' }[order.status] ?? order.status;
    return (
      <div className="mx-auto flex h-screen max-w-md flex-col bg-slate-50">
        <header className="border-b border-slate-200 bg-white px-5 py-4">
          <h1 className="text-lg font-bold text-slate-900">{data.restaurantName}</h1>
          <p className="text-sm text-slate-500">Table {data.table.name} · Order #{order.number}</p>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <div className={`mb-4 rounded-xl p-4 text-center font-semibold ${order.status === 'READY' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {statusLabel}
          </div>
          <div className="card divide-y divide-slate-50">
            {order.items.filter((i) => !i.cancelledAt).map((i) => (
              <div key={i.id} className="flex items-center justify-between p-3 text-sm">
                <span className={i.kotStatus === 'READY' || i.kotStatus === 'SERVED' ? 'text-slate-400 line-through' : 'text-slate-700'}>{i.quantity}× {i.nameSnapshot}</span>
                <span className="text-xs uppercase text-slate-400">{i.kotStatus}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-between text-lg font-bold text-slate-900">
            <span>Total</span><span>{formatMoney(order.totalCents)}</span>
          </div>
          <p className="mt-2 text-center text-xs text-slate-400">Pay at the counter when you're ready, or ask staff to bring the bill.</p>
        </div>
        <div className="border-t border-slate-200 bg-white p-4">
          <button onClick={callWaiter} disabled={callSent} className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {callSent ? '🔔 Waiter notified' : '🔔 Call waiter'}
          </button>
          <button onClick={() => { setOrder(null); rememberOrder(null); }} className="mt-2 w-full text-xs text-slate-400 underline">Order more items</button>
        </div>
      </div>
    );
  }

  // ── Browsing menu ──
  return (
    <div className="mx-auto flex h-screen max-w-md flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-5 py-4">
        <h1 className="text-lg font-bold text-slate-900">{data.restaurantName}</h1>
        <p className="text-sm text-slate-500">Table {data.table.name}{data.table.area ? ` · ${data.table.area}` : ''}</p>
      </header>

      <div className="flex gap-2 overflow-x-auto border-b border-slate-100 bg-white px-4 py-2">
        <button onClick={() => setActiveCat('all')} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${activeCat === 'all' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>All</button>
        {categories.map((c) => (
          <button key={c.id} onClick={() => setActiveCat(c.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${activeCat === c.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{c.name}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <button key={item.id} onClick={() => tapItem(item)} className="card flex flex-col items-start p-3 text-left hover:border-brand-300">
              <span className="font-semibold text-slate-800">{item.name}</span>
              {item.description && <span className="mt-0.5 line-clamp-2 text-xs text-slate-400">{item.description}</span>}
              <span className="mt-2 font-bold text-brand-700">
                {item.variants?.length ? `From ${formatMoney(Math.min(...item.variants.map((v) => v.priceCents)))}` : formatMoney(item.priceCents)}
              </span>
            </button>
          ))}
          {items.length === 0 && <p className="col-span-2 py-10 text-center text-sm text-slate-400">Nothing here yet.</p>}
        </div>
      </div>

      <div className="flex gap-2 border-t border-slate-200 bg-white p-4">
        <button onClick={callWaiter} disabled={callSent} className="rounded-lg border border-slate-200 px-3 py-2.5 text-lg disabled:opacity-50" title="Call waiter">
          {callSent ? '🔔' : '🛎️'}
        </button>
        <button onClick={() => setCartOpen(true)} disabled={cartCount === 0} className="btn-primary flex-1 disabled:opacity-40">
          {cartCount > 0 ? `View cart (${cartCount}) · ${formatMoney(cartTotal)}` : 'Cart is empty'}
        </button>
      </div>

      {/* Portion picker */}
      <Modal open={!!picker} title={picker?.name ?? ''} onClose={() => setPicker(null)}>
        {picker && (
          <div className="space-y-2">
            {picker.variants!.map((v) => (
              <button key={v.id} onClick={() => addToCart(picker, v)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:border-brand-400">
                <span>{v.name}</span>
                <span className="font-semibold text-brand-700">{formatMoney(v.priceCents)}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Cart */}
      <Modal open={cartOpen} title="Your order" onClose={() => setCartOpen(false)}>
        <div className="space-y-3">
          {cart.map((l) => (
            <div key={l.key} className="flex items-center justify-between gap-2">
              <span className="flex-1 text-sm text-slate-700">{l.name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => changeQty(l.key, -1)} className="h-7 w-7 rounded bg-slate-100 text-slate-600">−</button>
                <span className="w-5 text-center text-sm font-semibold">{l.quantity}</span>
                <button onClick={() => changeQty(l.key, 1)} className="h-7 w-7 rounded bg-slate-100 text-slate-600">+</button>
              </div>
              <span className="w-16 text-right text-sm font-semibold text-slate-700">{formatMoney(l.unitPriceCents * l.quantity)}</span>
            </div>
          ))}
          {cart.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Cart is empty.</p>}
          <div className="flex justify-between border-t border-slate-100 pt-3 text-base font-bold text-slate-900">
            <span>Total</span><span>{formatMoney(cartTotal)}</span>
          </div>
          <button className="btn-primary w-full" disabled={cart.length === 0 || sending} onClick={startSend}>
            {sending ? 'Sending…' : 'Send Order'}
          </button>
        </div>
      </Modal>

      {/* Optional contact capture — once, before the first order */}
      <Modal open={askContact} title="Almost there!" onClose={() => setAskContact(false)}>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Leave your phone number to get a text when your order is ready (optional).</p>
          <input className="input" placeholder="Your name (optional)" value={contact?.name ?? ''} onChange={(e) => setContact({ name: e.target.value, phone: contact?.phone ?? '' })} />
          <input className="input" placeholder="Phone number (optional)" value={contact?.phone ?? ''} onChange={(e) => setContact({ name: contact?.name ?? '', phone: e.target.value })} />
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => sendOrder()}>Skip</button>
            <button className="btn-primary flex-1" onClick={() => sendOrder(contact?.name, contact?.phone)}>Send order</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

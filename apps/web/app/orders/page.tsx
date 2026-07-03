'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, formatMoney } from '@/lib/api';
import type { Order, PaymentMethod } from '@/lib/types';
import Modal from '@/components/Modal';
import PaymentPanel from '@/components/PaymentPanel';

const STATUS_BADGE: Record<string, string> = {
  OPEN: 'bg-slate-100 text-slate-600',
  SENT_TO_KITCHEN: 'bg-blue-100 text-blue-700',
  READY: 'bg-teal-100 text-teal-700',
  SERVED: 'bg-teal-100 text-teal-700',
  BILLED: 'bg-amber-100 text-amber-700',
  PAID: 'bg-green-100 text-green-700',
  REFUNDED: 'bg-orange-100 text-orange-700',
  CANCELLED: 'bg-red-100 text-red-600',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [scope, setScope] = useState<'today' | 'open'>('today');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [payFor, setPayFor] = useState<Order | null>(null);

  async function load() {
    try {
      const q = scope === 'today' ? '?today=1' : '';
      let data = await api.get<Order[]>(`/orders${q}`);
      if (scope === 'open') data = data.filter((o) => !['PAID', 'CANCELLED'].includes(o.status));
      setOrders(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  async function act(id: string, action: 'kot' | 'bill') {
    setBusy(id);
    try {
      await api.post(`/orders/${id}/${action}`, {});
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function pay(payments: { method: PaymentMethod; amountCents: number }[]) {
    if (!payFor) return;
    setBusy(payFor.id);
    try {
      await api.post(`/orders/${payFor.id}/pay`, { payments });
      setPayFor(null);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Void an open order with a mandatory audited reason (matrix #10).
  async function voidOrder(o: Order) {
    const reason = prompt(`Void order #${o.number}? Enter a reason:`);
    if (reason === null) return;
    if (!reason.trim()) return alert('A reason is required to void.');
    setBusy(o.id);
    try {
      await api.delete(`/orders/${o.id}`, { reason: reason.trim() });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Refund a paid order with a mandatory reason (matrix #10).
  async function refundOrder(o: Order) {
    const reason = prompt(`Refund order #${o.number}? Enter a reason:`);
    if (reason === null) return;
    if (!reason.trim()) return alert('A reason is required to refund.');
    setBusy(o.id);
    try {
      await api.post(`/orders/${o.id}/refund`, { reason: reason.trim() });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Orders / KOT</h1>
          <p className="text-sm text-slate-500">Track and progress live orders</p>
        </div>
        <Link href="/pos" className="btn-primary">+ New Order</Link>
      </header>

      <div className="mb-4 flex gap-2">
        {(['today', 'open'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`badge px-3 py-1.5 ${scope === s ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            {s === 'today' ? "Today's orders" : 'Open orders'}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error} — is the API running on port 4000?
        </div>
      )}

      {orders.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">No orders here.</div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const open = !['PAID', 'CANCELLED'].includes(o.status);
            return (
              <div key={o.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-800">#{o.number}</span>
                    <span className="badge bg-slate-100 text-slate-500">{o.type.replace('_', ' ')}</span>
                    {o.table && <span className="badge bg-brand-50 text-brand-700">{o.table.name}</span>}
                    <span className={`badge ${STATUS_BADGE[o.status]}`}>{o.status.replace('_', ' ')}</span>
                  </div>
                  <span className="font-bold text-slate-900">{formatMoney(o.totalCents)}</span>
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  {o.items.map((it) => `${it.quantity}× ${it.nameSnapshot}`).join(', ') || 'No items'}
                </div>
                {(o.voidReason || o.refundReason) && (
                  <div className="mt-2 text-xs text-slate-400">
                    {o.status === 'REFUNDED'
                      ? `Refunded ${formatMoney(o.refundCents)} — ${o.refundReason}`
                      : `Voided — ${o.voidReason}`}
                  </div>
                )}
                {open && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy === o.id} onClick={() => act(o.id, 'kot')}>Send KOT</button>
                    <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy === o.id} onClick={() => act(o.id, 'bill')}>Bill</button>
                    <button className="btn-primary px-3 py-1.5 text-xs" disabled={busy === o.id} onClick={() => setPayFor(o)}>Pay</button>
                    <button className="btn-danger px-3 py-1.5 text-xs" disabled={busy === o.id} onClick={() => voidOrder(o)}>Void</button>
                  </div>
                )}
                {o.status === 'PAID' && (
                  <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                    <button className="btn-danger px-3 py-1.5 text-xs" disabled={busy === o.id} onClick={() => refundOrder(o)}>Refund</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!payFor} title={`Pay order #${payFor?.number ?? ''}`} onClose={() => setPayFor(null)}>
        {payFor && (
          <PaymentPanel
            totalCents={payFor.totalCents}
            busy={busy === payFor.id}
            onCancel={() => setPayFor(null)}
            onConfirm={pay}
          />
        )}
      </Modal>
    </div>
  );
}

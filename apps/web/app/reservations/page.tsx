'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Reservation, RestaurantTable } from '@/lib/types';
import Modal from '@/components/Modal';

const STATUS_BADGE: Record<string, string> = {
  BOOKED: 'bg-indigo-100 text-indigo-700',
  SEATED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
  NO_SHOW: 'bg-amber-100 text-amber-700',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ReservationsPage() {
  const [date, setDate] = useState(todayISO());
  const [bookings, setBookings] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [modal, setModal] = useState<null | 'booking' | 'waitlist'>(null);
  const [form, setForm] = useState({ customerName: '', phone: '', partySize: 2, time: '19:00', tableId: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, w, t] = await Promise.all([
        api.get<Reservation[]>(`/reservations?date=${date}`),
        api.get<Reservation[]>('/reservations/waitlist'),
        api.get<RestaurantTable[]>('/tables'),
      ]);
      setBookings(b);
      setWaitlist(w);
      setTables(t);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [date]);

  useEffect(() => {
    load();
    const i = setInterval(load, 12000);
    return () => clearInterval(i);
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const isWaitlist = modal === 'waitlist';
      const payload: Record<string, unknown> = {
        customerName: form.customerName.trim(),
        phone: form.phone.trim() || undefined,
        partySize: Number(form.partySize),
        notes: form.notes.trim() || undefined,
        isWaitlist,
      };
      if (!isWaitlist) {
        payload.reservedAt = new Date(`${date}T${form.time}:00`).toISOString();
        if (form.tableId) payload.tableId = form.tableId;
      }
      await api.post('/reservations', payload);
      setForm({ customerName: '', phone: '', partySize: 2, time: '19:00', tableId: '', notes: '' });
      setModal(null);
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function action(id: string, path: string) {
    try {
      await api.post(`/reservations/${id}/${path}`, {});
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function Row({ r, showTime }: { r: Reservation; showTime?: boolean }) {
    return (
      <div className="card flex items-center justify-between p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">{r.customerName}</span>
            <span className="badge bg-slate-100 text-slate-500">{r.partySize} pax</span>
            {r.table && <span className="badge bg-brand-50 text-brand-700">{r.table.name}</span>}
            <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status.replace('_', ' ')}</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {showTime && new Date(r.reservedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {r.phone ? ` · ${r.phone}` : ''}
            {r.notes ? ` · ${r.notes}` : ''}
          </div>
        </div>
        {r.status === 'BOOKED' && (
          <div className="flex gap-1">
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => action(r.id, 'seat')}>Seat</button>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => action(r.id, 'no-show')}>No-show</button>
            <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => action(r.id, 'cancel')}>Cancel</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reservations &amp; Waitlist</h1>
          <p className="text-sm text-slate-500">Advance bookings and the live walk-in queue</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setModal('waitlist')}>+ Waitlist</button>
          <button className="btn-primary" onClick={() => setModal('booking')}>+ Reservation</button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error} — is the API running on port 4000?
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Bookings</h2>
            <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {bookings.length === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-400">No reservations for this date.</div>
          ) : (
            <div className="space-y-3">
              {bookings.map((r) => <Row key={r.id} r={r} showTime />)}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-semibold text-slate-800">Waitlist ({waitlist.length})</h2>
          {waitlist.length === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-400">Queue is empty.</div>
          ) : (
            <div className="space-y-3">
              {waitlist.map((r) => <Row key={r.id} r={r} />)}
            </div>
          )}
        </div>
      </div>

      <Modal open={!!modal} title={modal === 'waitlist' ? 'Add to waitlist' : 'New reservation'} onClose={() => setModal(null)}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Customer name</label>
              <input className="input" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} required autoFocus />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98XXXXXXXX" />
            </div>
            <div>
              <label className="label">Party size</label>
              <input className="input" type="number" min={1} value={form.partySize} onChange={(e) => setForm({ ...form, partySize: Number(e.target.value) })} />
            </div>
            {modal === 'booking' && (
              <>
                <div>
                  <label className="label">Time</label>
                  <input className="input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                </div>
                <div>
                  <label className="label">Table (optional)</label>
                  <select className="input" value={form.tableId} onChange={(e) => setForm({ ...form, tableId: e.target.value })}>
                    <option value="">Unassigned</option>
                    {tables.filter((t) => t.status === 'AVAILABLE').map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.seats})</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div className="col-span-2">
              <label className="label">Notes</label>
              <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. window seat, birthday" />
            </div>
          </div>
          {modal === 'booking' && <p className="text-xs text-slate-400">Booking date: {date}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

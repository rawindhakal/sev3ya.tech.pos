'use client';

import { useEffect, useState } from 'react';
import { api, formatMoney, dollarsToCents } from '@/lib/api';
import type { GiftCard, GiftCardTransaction } from '@/lib/types';
import Modal from '@/components/Modal';
import { notify } from '@/lib/dialog';
import FeatureGate from '@/components/FeatureGate';

function GiftCardsPage() {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ valueRs: '', issuedToName: '', issuedToPhone: '' });
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<GiftCard | null>(null);

  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupCode, setLookupCode] = useState<string | null>(null);
  const [txns, setTxns] = useState<GiftCardTransaction[]>([]);

  async function load() {
    try {
      setCards(await api.get<GiftCard[]>('/giftcards'));
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    const rs = parseFloat(form.valueRs);
    if (!rs || rs <= 0) return;
    setSaving(true);
    try {
      const card = await api.post<GiftCard>('/giftcards', {
        valueCents: dollarsToCents(rs),
        issuedToName: form.issuedToName.trim() || undefined,
        issuedToPhone: form.issuedToPhone.trim() || undefined,
      });
      setIssued(card);
      setForm({ valueRs: '', issuedToName: '', issuedToPhone: '' });
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: GiftCard) {
    setCards((prev) => prev.map((x) => (x.code === c.code ? { ...x, isActive: !x.isActive } : x)));
    try {
      await api.patch(`/giftcards/${c.code}/active`, { isActive: !c.isActive });
    } catch (e) {
      notify((e as Error).message, 'error');
      load();
    }
  }

  async function openLookup(code: string) {
    setLookupCode(code);
    setLookupOpen(true);
    try {
      setTxns(await api.get<GiftCardTransaction[]>(`/giftcards/${code}/transactions`));
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Gift Cards</h1>
        <p className="text-sm text-slate-500">Issue store-credit cards; redeem them as a payment method at checkout</p>
      </header>

      <div className="card mb-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="p-3 font-semibold">Code</th>
              <th className="p-3 font-semibold">Issued to</th>
              <th className="p-3 font-semibold">Balance</th>
              <th className="p-3 font-semibold">Initial value</th>
              <th className="p-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {cards.map((c) => (
              <tr key={c.id} className={!c.isActive ? 'opacity-50' : ''}>
                <td className="p-3 font-mono font-semibold text-slate-800">{c.code}</td>
                <td className="p-3 text-slate-600">{c.issuedToName || c.issuedToPhone || '—'}</td>
                <td className="p-3 font-semibold text-brand-700">{formatMoney(c.balanceCents)}</td>
                <td className="p-3 text-slate-500">{formatMoney(c.initialValueCents)}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <button className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100" onClick={() => openLookup(c.code)}>History</button>
                    <button className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100" onClick={() => toggleActive(c)}>
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && cards.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">No gift cards issued yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Issue a gift card</h2>
        <form onSubmit={issue} className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Value (Rs)</label>
            <input className="input" type="number" min={1} value={form.valueRs} onChange={(e) => setForm({ ...form, valueRs: e.target.value })} required />
          </div>
          <div>
            <label className="label">Issued to (name, optional)</label>
            <input className="input" value={form.issuedToName} onChange={(e) => setForm({ ...form, issuedToName: e.target.value })} />
          </div>
          <div>
            <label className="label">Phone (optional)</label>
            <input className="input" value={form.issuedToPhone} onChange={(e) => setForm({ ...form, issuedToPhone: e.target.value })} />
          </div>
          <div className="flex items-end sm:col-span-3">
            <button className="btn-primary" disabled={saving}>{saving ? 'Issuing…' : '+ Issue gift card'}</button>
          </div>
        </form>
      </div>

      <Modal open={!!issued} title="Gift card issued" onClose={() => setIssued(null)}>
        {issued && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-slate-500">Give this code to the customer:</p>
            <div className="rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 py-6 font-mono text-3xl font-bold tracking-widest text-brand-700">{issued.code}</div>
            <p className="text-sm text-slate-600">Balance: <strong>{formatMoney(issued.balanceCents)}</strong></p>
            <button className="btn-primary" onClick={() => setIssued(null)}>Done</button>
          </div>
        )}
      </Modal>

      <Modal open={lookupOpen} title={`History — ${lookupCode}`} onClose={() => setLookupOpen(false)}>
        <div className="space-y-2">
          {txns.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <span className="text-slate-500">{new Date(t.createdAt).toLocaleString()} — {t.note}</span>
              <span className={`font-semibold ${t.amountCents >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{t.amountCents >= 0 ? '+' : ''}{formatMoney(t.amountCents)}</span>
            </div>
          ))}
          {txns.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No transactions yet.</p>}
        </div>
      </Modal>
    </div>
  );
}


export default function GiftCardsPageGated() {
  return (
    <FeatureGate feature="marketing">
      <GiftCardsPage />
    </FeatureGate>
  );
}

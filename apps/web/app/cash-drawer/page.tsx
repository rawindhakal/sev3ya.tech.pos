'use client';

import { useEffect, useState } from 'react';
import { api, formatMoney, dollarsToCents } from '@/lib/api';
import type { CashDrawerState, CashDrawerSession } from '@/lib/types';

export default function CashDrawerPage() {
  const [state, setState] = useState<CashDrawerState | null>(null);
  const [history, setHistory] = useState<CashDrawerSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [floatRs, setFloatRs] = useState('');
  const [moveRs, setMoveRs] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [countRs, setCountRs] = useState('');

  async function load() {
    try {
      const [s, h] = await Promise.all([
        api.get<CashDrawerState>('/cash-drawer/current'),
        api.get<CashDrawerSession[]>('/cash-drawer/sessions'),
      ]);
      setState(s);
      setHistory(h);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  async function openDrawer() {
    setBusy(true);
    try {
      await api.post('/cash-drawer/open', { openingFloatCents: dollarsToCents(parseFloat(floatRs || '0')) });
      setFloatRs('');
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function move(type: 'PAY_IN' | 'PAY_OUT') {
    const amt = dollarsToCents(parseFloat(moveRs || '0'));
    if (amt <= 0) return alert('Enter an amount');
    setBusy(true);
    try {
      await api.post('/cash-drawer/movement', { type, amountCents: amt, reason: moveReason || undefined });
      setMoveRs('');
      setMoveReason('');
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function closeDrawer() {
    if (countRs === '') return alert('Enter the counted cash amount');
    setBusy(true);
    try {
      await api.post('/cash-drawer/close', { countedCents: dollarsToCents(parseFloat(countRs)) });
      setCountRs('');
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const s = state?.session;
  const counted = countRs !== '' ? dollarsToCents(parseFloat(countRs)) : null;
  const liveVariance = counted != null && state?.expectedCents != null ? counted - state.expectedCents : null;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Cash Drawer</h1>
        <p className="text-sm text-slate-500">Open/close balances and petty-cash pay-ins &amp; pay-outs</p>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error} — is the API running on port 4000?
        </div>
      )}

      {!state?.open ? (
        <div className="card max-w-md p-6">
          <h2 className="mb-1 font-semibold text-slate-800">Open drawer</h2>
          <p className="mb-4 text-sm text-slate-500">Enter the opening cash float to start a shift.</p>
          <label className="label">Opening float (Rs)</label>
          <input className="input mb-4" type="number" min="0" step="0.01" value={floatRs} onChange={(e) => setFloatRs(e.target.value)} placeholder="0.00" />
          <button className="btn-primary w-full" disabled={busy} onClick={openDrawer}>
            {busy ? 'Opening…' : 'Open drawer'}
          </button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* live summary */}
          <div className="card p-6 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Current session</h2>
              <span className="badge bg-green-100 text-green-700">OPEN</span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Opening float" value={formatMoney(s!.openingFloatCents)} />
              <Stat label="Cash sales" value={formatMoney(state.cashSalesCents ?? 0)} />
              <Stat label="Pay-ins" value={formatMoney(state.payIn ?? 0)} />
              <Stat label="Pay-outs" value={formatMoney(state.payOut ?? 0)} />
            </div>
            <div className="mt-4 rounded-lg bg-slate-900 p-4 text-white">
              <div className="text-xs uppercase tracking-wide text-slate-400">Expected in drawer</div>
              <div className="text-3xl font-bold">{formatMoney(state.expectedCents ?? 0)}</div>
            </div>

            {/* movements */}
            <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-600">Movements</h3>
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {(s!.movements ?? []).map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span>
                    <span className={`badge mr-2 ${m.type === 'PAY_OUT' ? 'bg-red-100 text-red-600' : m.type === 'PAY_IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {m.type.replace('_', ' ')}
                    </span>
                    <span className="text-slate-500">{m.reason ?? '—'}</span>
                  </span>
                  <span className="font-semibold text-slate-800">{formatMoney(m.amountCents)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* actions */}
          <div className="space-y-6">
            <div className="card p-5">
              <h3 className="mb-3 font-semibold text-slate-800">Petty cash</h3>
              <label className="label">Amount (Rs)</label>
              <input className="input mb-2" type="number" min="0" step="0.01" value={moveRs} onChange={(e) => setMoveRs(e.target.value)} />
              <label className="label">Reason</label>
              <input className="input mb-3" value={moveReason} onChange={(e) => setMoveReason(e.target.value)} placeholder="e.g. milk purchase" />
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-ghost text-xs" disabled={busy} onClick={() => move('PAY_IN')}>+ Pay-in</button>
                <button className="btn-ghost text-xs" disabled={busy} onClick={() => move('PAY_OUT')}>− Pay-out</button>
              </div>
            </div>

            <div className="card p-5">
              <h3 className="mb-3 font-semibold text-slate-800">Close drawer</h3>
              <label className="label">Counted cash (Rs)</label>
              <input className="input mb-2" type="number" min="0" step="0.01" value={countRs} onChange={(e) => setCountRs(e.target.value)} />
              {liveVariance != null && (
                <p className={`mb-3 text-sm font-semibold ${liveVariance === 0 ? 'text-emerald-600' : liveVariance > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  Variance: {liveVariance > 0 ? '+' : ''}{formatMoney(liveVariance)} {liveVariance < 0 ? '(short)' : liveVariance > 0 ? '(over)' : '(balanced)'}
                </p>
              )}
              <button className="btn-primary w-full text-sm" disabled={busy} onClick={closeDrawer}>
                {busy ? 'Closing…' : 'Close & reconcile'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* history */}
      {history.length > 0 && (
        <div className="card mt-6 p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Recent shifts</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-4 font-semibold">Opened</th>
                  <th className="pb-2 pr-4 font-semibold">Float</th>
                  <th className="pb-2 pr-4 font-semibold">Expected</th>
                  <th className="pb-2 pr-4 font-semibold">Counted</th>
                  <th className="pb-2 text-right font-semibold">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2 pr-4 text-slate-500">{new Date(h.openedAt).toLocaleString()}</td>
                    <td className="py-2 pr-4">{formatMoney(h.openingFloatCents)}</td>
                    <td className="py-2 pr-4">{formatMoney(h.expectedCents ?? 0)}</td>
                    <td className="py-2 pr-4">{formatMoney(h.countedCents ?? 0)}</td>
                    <td className={`py-2 text-right font-semibold ${(h.varianceCents ?? 0) === 0 ? 'text-slate-500' : (h.varianceCents ?? 0) > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {(h.varianceCents ?? 0) > 0 ? '+' : ''}{formatMoney(h.varianceCents ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

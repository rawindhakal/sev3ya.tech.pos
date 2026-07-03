'use client';

// Split-tender settlement (matrix #5): allocate one bill across multiple
// payment methods (Cash + FonePay + eSewa …). Confirm is enabled once the
// allocated amount covers the total; cash overpayment shows change.
import { useState } from 'react';
import { formatMoney } from '@/lib/api';
import { PAYMENT_METHODS } from '@/lib/constants';
import type { PaymentMethod } from '@/lib/types';

interface TenderLine {
  method: PaymentMethod;
  amount: string; // rupees, as typed
}

export default function PaymentPanel({
  totalCents,
  busy,
  onCancel,
  onConfirm,
}: {
  totalCents: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (payments: { method: PaymentMethod; amountCents: number }[]) => void;
}) {
  const [lines, setLines] = useState<TenderLine[]>([
    { method: 'CASH', amount: (totalCents / 100).toFixed(2) },
  ]);
  const [ways, setWays] = useState('2');

  // Split the bill into N equal parts (matrix #3), remainder on the last part.
  function splitEqually() {
    const n = Math.max(2, Math.min(20, parseInt(ways) || 2));
    const base = Math.floor(totalCents / n);
    const parts = Array.from({ length: n }, (_, i) =>
      i === n - 1 ? totalCents - base * (n - 1) : base,
    );
    setLines(parts.map((c) => ({ method: 'CASH', amount: (c / 100).toFixed(2) })));
  }

  const toCents = (s: string) => Math.round((parseFloat(s) || 0) * 100);
  const allocated = lines.reduce((s, l) => s + toCents(l.amount), 0);
  const remaining = totalCents - allocated;
  const change = Math.max(0, allocated - totalCents);
  const covered = allocated >= totalCents;
  const split = lines.length > 1;

  function update(i: number, patch: Partial<TenderLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addTender() {
    const fill = remaining > 0 ? (remaining / 100).toFixed(2) : '';
    setLines((prev) => [...prev, { method: 'FONEPAY', amount: fill }]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function confirm() {
    // Cap cash overpayment to the exact due (change is returned physically).
    let left = totalCents;
    const payments = lines
      .map((l) => {
        const c = Math.min(toCents(l.amount), Math.max(0, left));
        left -= c;
        return { method: l.method, amountCents: c };
      })
      .filter((p) => p.amountCents > 0);
    // Ensure rounding never leaves the bill short.
    const sum = payments.reduce((s, p) => s + p.amountCents, 0);
    if (sum < totalCents && payments.length)
      payments[payments.length - 1].amountCents += totalCents - sum;
    onConfirm(payments);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-50 p-4 text-center">
        <div className="text-sm text-slate-500">Amount due</div>
        <div className="text-3xl font-bold text-slate-900">{formatMoney(totalCents)}</div>
      </div>

      <div className="space-y-3">
        {lines.map((line, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Tender {i + 1}
              </span>
              {split && (
                <button
                  onClick={() => removeLine(i)}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => update(i, { method: m.value })}
                  className={`rounded-md border px-1.5 py-2 text-[11px] font-semibold ${
                    line.method === m.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={line.amount}
              onChange={(e) => update(i, { amount: e.target.value })}
              className="input mt-2 text-right"
              placeholder="0.00"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={addTender} className="flex-1 rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-500 hover:bg-slate-50">
          + Add tender
        </button>
        <div className="flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2 py-1.5">
          <span className="text-xs text-slate-500">Split equally</span>
          <input
            type="number"
            min={2}
            max={20}
            value={ways}
            onChange={(e) => setWays(e.target.value)}
            className="w-12 rounded-md border border-slate-200 px-1.5 py-1 text-center text-sm"
          />
          <button onClick={splitEqually} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">
            ways
          </button>
        </div>
      </div>

      <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
        <div className="flex justify-between text-slate-500">
          <span>Allocated</span>
          <span>{formatMoney(allocated)}</span>
        </div>
        {remaining > 0 ? (
          <div className="flex justify-between font-semibold text-amber-600">
            <span>Remaining</span>
            <span>{formatMoney(remaining)}</span>
          </div>
        ) : (
          <div className="flex justify-between font-semibold text-emerald-600">
            <span>Change</span>
            <span>{formatMoney(change)}</span>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn-primary" onClick={confirm} disabled={busy || !covered}>
          {busy ? 'Processing…' : covered ? `Settle ${formatMoney(totalCents)}` : 'Amount short'}
        </button>
      </div>
    </div>
  );
}

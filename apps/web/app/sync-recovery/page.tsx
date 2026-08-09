'use client';

// Sync Recovery — writes the offline outbox delivered to the server but which
// were genuinely rejected (not a connectivity blip): e.g. an invalid gift-card
// code discovered only at sync time, or a client-id collision on order create.
// These were NOT applied — a manager has to manually reconcile (re-enter the
// order/payment, contact the customer, etc.) then acknowledge.

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { downloadCsv, toCsv } from '@/lib/csv';
import { notify } from '@/lib/dialog';

interface FailedItem {
  id: string;
  orderId: string | null;
  method: string;
  path: string;
  body: unknown;
  idempotencyKey: string;
  errorMessage: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  createdAt: string;
}

export default function SyncRecoveryPage() {
  const [items, setItems] = useState<FailedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.get<FailedItem[]>('/sync-failures'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function acknowledge(id: string) {
    try {
      await api.patch(`/sync-failures/${id}/ack`, {});
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  function exportCsv() {
    const csv = toCsv(
      ['When', 'Order', 'Operation', 'Error', 'Payload', 'Acknowledged'],
      items.map((i) => [
        new Date(i.createdAt).toLocaleString(),
        i.orderId ?? '',
        `${i.method} ${i.path}`,
        i.errorMessage ?? '',
        JSON.stringify(i.body ?? {}),
        i.acknowledgedAt ? `${i.acknowledgedBy ?? ''} @ ${new Date(i.acknowledgedAt).toLocaleString()}` : '',
      ]),
    );
    downloadCsv('sync-failures.csv', csv);
  }

  const outstanding = items.filter((i) => !i.acknowledgedAt).length;

  // Group by order so a cascade (create + cart + KOT + bill + pay all
  // failing for the same offline order) reads as one incident, not five.
  const groups = new Map<string, FailedItem[]>();
  for (const i of items) {
    const key = i.orderId ?? '(no order)';
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Sync Recovery</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Offline writes the server rejected on sync — not a connectivity blip. These were NOT applied;
            reconcile manually (re-enter the order/payment, contact the customer, etc.) then acknowledge.
          </p>
        </div>
        <button onClick={exportCsv} className="btn-ghost shrink-0" disabled={!items.length}>Export CSV</button>
      </div>

      {outstanding > 0 && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {outstanding} unacknowledged sync failure{outstanding === 1 ? '' : 's'}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-400">No sync failures — every offline write has synced cleanly.</div>
      ) : (
        [...groups.entries()].map(([orderId, group]) => (
          <div key={orderId} className="card mb-4 p-4">
            <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Order {orderId === '(no order)' ? '(no order)' : orderId} — {group.length} failed write{group.length === 1 ? '' : 's'}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-1 pr-3 font-medium">When</th>
                    <th className="py-1 pr-3 font-medium">Operation</th>
                    <th className="py-1 pr-3 font-medium">Error</th>
                    <th className="py-1 pr-3 font-medium">Payload</th>
                    <th className="py-1 pr-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((i) => (
                    <tr key={i.id} className={`border-t border-slate-100 dark:border-slate-700 ${i.acknowledgedAt ? 'opacity-50' : ''}`}>
                      <td className="whitespace-nowrap py-2 pr-3 align-top text-slate-500">{new Date(i.createdAt).toLocaleString()}</td>
                      <td className="whitespace-nowrap py-2 pr-3 align-top font-mono">{i.method} {i.path}</td>
                      <td className="py-2 pr-3 align-top text-red-600 dark:text-red-400">{i.errorMessage ?? '—'}</td>
                      <td className="py-2 pr-3 align-top">
                        <pre className="max-w-md whitespace-pre-wrap break-all text-[11px] text-slate-500">{JSON.stringify(i.body, null, 0)}</pre>
                      </td>
                      <td className="whitespace-nowrap py-2 align-top">
                        {i.acknowledgedAt ? (
                          <span className="text-slate-400">Ack&apos;d by {i.acknowledgedBy}</span>
                        ) : (
                          <button onClick={() => acknowledge(i.id)} className="btn-ghost px-2 py-1 text-xs">Acknowledge</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

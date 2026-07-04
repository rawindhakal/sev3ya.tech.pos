'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney, dollarsToCents } from '@/lib/api';
import Modal from '@/components/Modal';

interface Green { id: string; name: string; origin?: string | null; estate?: string | null; process?: string | null; moisturePct?: number | null; weightKg: number; remainingKg: number; costPerKgCents: number; ageDays: number; _count: { roasts: number; cuppings: number } }
interface Roast { id: string; number: number; greenInputKg: number; roastedOutputKg: number; shrinkagePct: number; chargeTempC?: number | null; dropTempC?: number | null; devTimeSec?: number | null; agtron?: number | null; roastedAt: string; greenBatch: { name: string } }
interface Cup { id: string; aroma: number; flavor: number; acidity: number; body: number; balance: number; total: number; notes?: string | null; createdAt: string; greenBatch: { name: string } }

export default function RoasteryPage() {
  const [tab, setTab] = useState<'green' | 'roasts' | 'cupping'>('green');
  const [green, setGreen] = useState<Green[]>([]);
  const [roasts, setRoasts] = useState<Roast[]>([]);
  const [cuppings, setCuppings] = useState<Cup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'green' | 'roast' | 'cup'>(null);

  const [gForm, setGForm] = useState({ name: '', origin: '', estate: '', process: 'Washed', moisturePct: '', weightKg: '', costRs: '' });
  const [rForm, setRForm] = useState({ greenBatchId: '', greenInputKg: '', roastedOutputKg: '', chargeTempC: '', dropTempC: '', devTimeSec: '', agtron: '' });
  const [cForm, setCForm] = useState({ greenBatchId: '', aroma: '8', flavor: '8', acidity: '8', body: '8', balance: '8', notes: '' });

  const load = useCallback(async () => {
    try {
      const [g, r, c] = await Promise.all([
        api.get<Green[]>('/roastery/green'),
        api.get<Roast[]>('/roastery/roasts'),
        api.get<Cup[]>('/roastery/cuppings'),
      ]);
      setGreen(g); setRoasts(r); setCuppings(c); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveGreen(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/roastery/green', {
        name: gForm.name.trim(), origin: gForm.origin.trim() || undefined, estate: gForm.estate.trim() || undefined,
        process: gForm.process, moisturePct: gForm.moisturePct ? parseFloat(gForm.moisturePct) : undefined,
        weightKg: parseFloat(gForm.weightKg || '0'), costPerKgCents: gForm.costRs ? dollarsToCents(parseFloat(gForm.costRs)) : 0,
      });
      setGForm({ name: '', origin: '', estate: '', process: 'Washed', moisturePct: '', weightKg: '', costRs: '' });
      setModal(null); load();
    } catch (e) { alert((e as Error).message); }
  }
  async function saveRoast(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/roastery/roasts', {
        greenBatchId: rForm.greenBatchId, greenInputKg: parseFloat(rForm.greenInputKg || '0'), roastedOutputKg: parseFloat(rForm.roastedOutputKg || '0'),
        chargeTempC: rForm.chargeTempC ? parseFloat(rForm.chargeTempC) : undefined, dropTempC: rForm.dropTempC ? parseFloat(rForm.dropTempC) : undefined,
        devTimeSec: rForm.devTimeSec ? parseInt(rForm.devTimeSec) : undefined, agtron: rForm.agtron ? parseInt(rForm.agtron) : undefined,
      });
      setRForm({ greenBatchId: '', greenInputKg: '', roastedOutputKg: '', chargeTempC: '', dropTempC: '', devTimeSec: '', agtron: '' });
      setModal(null); load();
    } catch (e) { alert((e as Error).message); }
  }
  async function saveCup(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/roastery/cuppings', {
        greenBatchId: cForm.greenBatchId, aroma: +cForm.aroma, flavor: +cForm.flavor, acidity: +cForm.acidity, body: +cForm.body, balance: +cForm.balance, notes: cForm.notes.trim() || undefined,
      });
      setModal(null); load();
    } catch (e) { alert((e as Error).message); }
  }

  const tabBtn = (t: typeof tab, label: string) => (
    <button onClick={() => setTab(t)} className={`badge px-3 py-1.5 ${tab === t ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{label}</button>
  );

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roastery</h1>
          <p className="text-sm text-slate-500">Green beans, roast profiles &amp; cupping</p>
        </div>
        <button className="btn-primary" onClick={() => setModal(tab === 'green' ? 'green' : tab === 'roasts' ? 'roast' : 'cup')}>
          {tab === 'green' ? '+ Green Batch' : tab === 'roasts' ? '+ Roast' : '+ Cupping'}
        </button>
      </header>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error} — is the API running on port 4000?</div>}

      <div className="mb-4 flex gap-2">{tabBtn('green', 'Green Beans')}{tabBtn('roasts', 'Roast Log')}{tabBtn('cupping', 'Cupping')}</div>

      {tab === 'green' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {green.map((b) => (
            <div key={b.id} className="card p-4">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-slate-800">{b.name}</h3>
                {b.ageDays > 90 && <span className="badge bg-amber-100 text-amber-700">aging</span>}
              </div>
              <div className="mt-1 text-xs text-slate-400">{[b.origin, b.estate, b.process].filter(Boolean).join(' · ')}</div>
              <div className="mt-3 flex items-end justify-between">
                <div><div className="text-lg font-bold text-slate-900">{b.remainingKg}<span className="text-sm text-slate-400">/{b.weightKg} kg</span></div><div className="text-xs text-slate-500">remaining green</div></div>
                <div className="text-right text-xs text-slate-400">
                  {b.moisturePct != null && <div>moisture {b.moisturePct}%</div>}
                  <div>{formatMoney(b.costPerKgCents)}/kg</div>
                  <div>{b.ageDays}d old</div>
                </div>
              </div>
              <div className="mt-2 flex gap-2 text-[11px] text-slate-400"><span>{b._count.roasts} roasts</span><span>·</span><span>{b._count.cuppings} cuppings</span></div>
            </div>
          ))}
          {green.length === 0 && <div className="card col-span-full p-10 text-center text-slate-400">No green batches yet.</div>}
        </div>
      )}

      {tab === 'roasts' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400"><th className="p-3 font-semibold">#</th><th className="p-3 font-semibold">Origin</th><th className="p-3 font-semibold">Green→Roasted</th><th className="p-3 font-semibold">Shrinkage</th><th className="p-3 font-semibold">Charge/Drop</th><th className="p-3 font-semibold">Dev</th><th className="p-3 font-semibold">Agtron</th><th className="p-3 font-semibold">Date</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {roasts.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 font-semibold text-slate-700">#{r.number}</td>
                  <td className="p-3 text-slate-600">{r.greenBatch.name}</td>
                  <td className="p-3 text-slate-600">{r.greenInputKg} → {r.roastedOutputKg} kg</td>
                  <td className="p-3"><span className="badge bg-amber-100 text-amber-700">{r.shrinkagePct}%</span></td>
                  <td className="p-3 text-slate-500">{r.chargeTempC ?? '—'}° / {r.dropTempC ?? '—'}°</td>
                  <td className="p-3 text-slate-500">{r.devTimeSec ? `${Math.floor(r.devTimeSec / 60)}:${String(r.devTimeSec % 60).padStart(2, '0')}` : '—'}</td>
                  <td className="p-3 text-slate-500">{r.agtron ?? '—'}</td>
                  <td className="p-3 text-slate-400">{new Date(r.roastedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {roasts.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">No roasts logged.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'cupping' && (
        <div className="space-y-3">
          {cuppings.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">{c.greenBatch.name}</h3>
                <span className="text-lg font-bold text-brand-700">{c.total}/50</span>
              </div>
              <div className="mt-2 grid grid-cols-5 gap-2 text-center text-xs">
                {[['Aroma', c.aroma], ['Flavor', c.flavor], ['Acidity', c.acidity], ['Body', c.body], ['Balance', c.balance]].map(([l, v]) => (
                  <div key={l as string} className="rounded-lg bg-slate-50 p-2"><div className="font-bold text-slate-700">{v as number}</div><div className="text-slate-400">{l as string}</div></div>
                ))}
              </div>
              {c.notes && <p className="mt-2 text-xs text-slate-500">{c.notes}</p>}
            </div>
          ))}
          {cuppings.length === 0 && <div className="card p-10 text-center text-slate-400">No cupping scores yet.</div>}
        </div>
      )}

      {/* Green modal */}
      <Modal open={modal === 'green'} title="New green batch" onClose={() => setModal(null)}>
        <form onSubmit={saveGreen} className="space-y-4">
          <div><label className="label">Name</label><input className="input" value={gForm.name} onChange={(e) => setGForm({ ...gForm, name: e.target.value })} placeholder="e.g. Nepal Everest AA" required autoFocus /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Origin</label><input className="input" value={gForm.origin} onChange={(e) => setGForm({ ...gForm, origin: e.target.value })} /></div>
            <div><label className="label">Estate</label><input className="input" value={gForm.estate} onChange={(e) => setGForm({ ...gForm, estate: e.target.value })} /></div>
            <div><label className="label">Process</label><select className="input" value={gForm.process} onChange={(e) => setGForm({ ...gForm, process: e.target.value })}>{['Washed', 'Natural', 'Honey', 'Anaerobic'].map((p) => <option key={p}>{p}</option>)}</select></div>
            <div><label className="label">Moisture %</label><input className="input" type="number" step="0.1" value={gForm.moisturePct} onChange={(e) => setGForm({ ...gForm, moisturePct: e.target.value })} /></div>
            <div><label className="label">Weight (kg)</label><input className="input" type="number" step="0.1" value={gForm.weightKg} onChange={(e) => setGForm({ ...gForm, weightKg: e.target.value })} required /></div>
            <div><label className="label">Cost/kg (Rs)</label><input className="input" type="number" step="0.01" value={gForm.costRs} onChange={(e) => setGForm({ ...gForm, costRs: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="btn-primary">Save</button></div>
        </form>
      </Modal>

      {/* Roast modal */}
      <Modal open={modal === 'roast'} title="Log a roast" onClose={() => setModal(null)}>
        <form onSubmit={saveRoast} className="space-y-4">
          <div><label className="label">Green batch</label><select className="input" value={rForm.greenBatchId} onChange={(e) => setRForm({ ...rForm, greenBatchId: e.target.value })} required><option value="">Select…</option>{green.filter((b) => b.remainingKg > 0).map((b) => <option key={b.id} value={b.id}>{b.name} ({b.remainingKg}kg left)</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Green input (kg)</label><input className="input" type="number" step="0.1" value={rForm.greenInputKg} onChange={(e) => setRForm({ ...rForm, greenInputKg: e.target.value })} required /></div>
            <div><label className="label">Roasted output (kg)</label><input className="input" type="number" step="0.1" value={rForm.roastedOutputKg} onChange={(e) => setRForm({ ...rForm, roastedOutputKg: e.target.value })} required /></div>
            <div><label className="label">Charge temp °C</label><input className="input" type="number" value={rForm.chargeTempC} onChange={(e) => setRForm({ ...rForm, chargeTempC: e.target.value })} /></div>
            <div><label className="label">Drop temp °C</label><input className="input" type="number" value={rForm.dropTempC} onChange={(e) => setRForm({ ...rForm, dropTempC: e.target.value })} /></div>
            <div><label className="label">Dev time (sec)</label><input className="input" type="number" value={rForm.devTimeSec} onChange={(e) => setRForm({ ...rForm, devTimeSec: e.target.value })} /></div>
            <div><label className="label">Agtron</label><input className="input" type="number" value={rForm.agtron} onChange={(e) => setRForm({ ...rForm, agtron: e.target.value })} /></div>
          </div>
          <p className="text-xs text-slate-400">Shrinkage is auto-calculated; roasted output is added to Coffee Beans inventory.</p>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="btn-primary">Log roast</button></div>
        </form>
      </Modal>

      {/* Cupping modal */}
      <Modal open={modal === 'cup'} title="Cupping score card" onClose={() => setModal(null)}>
        <form onSubmit={saveCup} className="space-y-4">
          <div><label className="label">Green batch</label><select className="input" value={cForm.greenBatchId} onChange={(e) => setCForm({ ...cForm, greenBatchId: e.target.value })} required><option value="">Select…</option>{green.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div className="grid grid-cols-5 gap-2">
            {(['aroma', 'flavor', 'acidity', 'body', 'balance'] as const).map((k) => (
              <div key={k}><label className="label capitalize">{k}</label><input className="input" type="number" step="0.25" min="0" max="10" value={cForm[k]} onChange={(e) => setCForm({ ...cForm, [k]: e.target.value })} /></div>
            ))}
          </div>
          <div><label className="label">Notes</label><input className="input" value={cForm.notes} onChange={(e) => setCForm({ ...cForm, notes: e.target.value })} placeholder="tasting notes" /></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="btn-primary">Save score</button></div>
        </form>
      </Modal>
    </div>
  );
}

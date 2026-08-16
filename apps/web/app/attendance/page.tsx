'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { api, formatMoney, tenantSlug } from '@/lib/api';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatBsLong } from '@/lib/bs-date';
import { exportPdf } from '@/lib/pdf';
import { notify } from '@/lib/dialog';
import FeatureGate from '@/components/FeatureGate';

// ZKTeco fingerprint attendance + payroll — cloud push (ADMS) only. The
// scanner (e.g. K40/ID and any other ADMS-capable ZKTeco model) connects out
// to us over the internet; there is no LAN-pull path, since the API is
// hosted remotely and has no network route into a restaurant. See
// docs/attendance-cloud-setup.md for full device setup.

const TABS = ['Punch Log', 'Day Summary', 'Payroll', 'Device'] as const;
type Tab = (typeof TABS)[number];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const hm = (v: string | Date) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const POLL_MS = 8000; // how often "live" tabs re-fetch, so incoming cloud punches show up without a manual reload

function AttendancePage() {
  const [tab, setTab] = useState<Tab>('Punch Log');
  const [from, setFrom] = useState(iso(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [logs, setLogs] = useState<any[]>([]);
  const [punchCount, setPunchCount] = useState<number | null>(null); // set only when filtered to one employee
  const [summary, setSummary] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any>(null);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [adjForm, setAdjForm] = useState({ employeeId: '', type: 'BONUS', amount: '', note: '' });
  const [adjSaving, setAdjSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [openDay, setOpenDay] = useState<string | null>(null); // "employeeId:date" expanded in Day Summary

  useEffect(() => { api.get<{ id: string; name: string }[]>('/employees').then(setEmployees).catch(() => {}); }, []);

  const load = useCallback(async (silent = false) => {
    try {
      if (tab === 'Punch Log') {
        if (employeeFilter) {
          const detail = await api.get<any>(`/attendance/punches/${employeeFilter}?from=${from}&to=${to}`, { silent });
          setPunchCount(detail.count);
          setLogs(detail.punches.map((p: any) => ({ ...p, employee: detail.employee.name, deviceUserId: '—', source: p.source })));
        } else {
          setPunchCount(null);
          setLogs(await api.get(`/attendance/logs?from=${from}&to=${to}`, { silent }));
        }
      }
      if (tab === 'Day Summary') setSummary(await api.get(`/attendance/summary?from=${from}&to=${to}`, { silent }));
      if (tab === 'Payroll') {
        setPayroll(await api.get(`/attendance/payroll?month=${month}`, { silent }));
        setAdjustments(await api.get(`/hr/payroll-adjustments?month=${month}`, { silent }));
      }
      setErr(null);
    } catch (e) {
      // Don't clobber the page with an error banner on a background poll —
      // only surface it if we truly have nothing to show yet.
      const message = (e as Error).message || 'Could not reach the server';
      if (!silent) setErr(message);
      else setErr((prev) => prev ?? message);
    }
  }, [tab, from, to, month, employeeFilter]);

  useEffect(() => { load(); }, [load]);

  // Keep Punch Log "live" — cloud-pushed punches should appear without the
  // admin needing to refresh the page.
  useEffect(() => {
    if (tab !== 'Punch Log') return;
    const iv = window.setInterval(() => load(true), POLL_MS);
    return () => window.clearInterval(iv);
  }, [tab, load]);

  async function relink() {
    setBusy(true); setNotice(null); setErr(null);
    try {
      const r = await api.post<any>('/attendance/relink', {});
      setNotice(`✓ Re-linked ${r.relinked} punch(es) to employees`);
      load();
    } catch (e) {
      setErr(`Could not re-link punches — ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function addAdjustment(ev: React.FormEvent) {
    ev.preventDefault();
    const amountCents = Math.round(Number(adjForm.amount) * 100);
    if (!adjForm.employeeId || !amountCents || amountCents <= 0) return;
    setAdjSaving(true);
    try {
      await api.post('/hr/payroll-adjustments', { employeeId: adjForm.employeeId, month, type: adjForm.type, amountCents, note: adjForm.note || undefined });
      setAdjForm({ employeeId: '', type: 'BONUS', amount: '', note: '' });
      load();
    } catch (e) { notify((e as Error).message, 'error'); } finally { setAdjSaving(false); }
  }
  async function removeAdjustment(id: string) {
    try { await api.delete(`/hr/payroll-adjustments/${id}`); load(); } catch (e) { notify((e as Error).message, 'error'); }
  }
  function payslip(r: any) {
    exportPdf({
      title: `Payslip — ${r.name}`,
      subtitle: `${r.role} · ${payroll.month} (BS ${payroll.monthBs})`,
      columns: [{ key: 'item', label: 'Item', type: 'text' }, { key: 'amount', label: 'Amount', type: 'money' }],
      rows: [
        { item: `Present days (${r.presentDays})`, amount: null },
        { item: 'Gross pay', amount: r.grossCents },
        { item: 'Bonus', amount: r.bonusCents },
        { item: 'Deduction', amount: -r.deductionCents },
        { item: 'Advance', amount: -r.advanceCents },
        { item: 'Net pay', amount: r.netPayCents },
      ],
      totalsRow: false,
    });
  }

  const th = 'p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400';
  const td = 'p-2 text-slate-600';

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance &amp; Payroll</h1>
          <p className="text-sm text-slate-500">Cloud-connected ZKTeco fingerprint device · {formatBsLong(new Date())} BS</p>
        </div>
        {tab !== 'Device' && (
          <div className="flex flex-wrap items-end gap-2">
            {tab === 'Payroll' ? (
              <input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
            ) : (
              <>
                <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
                <span className="text-slate-400">→</span>
                <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
              </>
            )}
            {tab === 'Punch Log' && (
              <select className="input w-auto" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} aria-label="Employee">
                <option value="">All employees</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            )}
          </div>
        )}
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`badge px-3 py-1.5 ${tab === t ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{t}</button>
        ))}
      </div>

      {err && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>⚠ {err}</span>
          <button className="btn-ghost shrink-0 px-2 py-1 text-xs" onClick={() => load()}>Retry</button>
        </div>
      )}
      {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

      {tab === 'Punch Log' && (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between border-b border-slate-100 p-2 px-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              {punchCount != null ? `${punchCount} punch(es) in range` : 'Live — updates automatically as punches arrive'}
            </span>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => load()}>↻ Refresh now</button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100"><th className={th}>Date (BS)</th><th className={th}>Time</th><th className={th}>Employee</th><th className={th}>Direction</th><th className={th}>Verified via</th><th className={th}>Device ID</th><th className={th}>Source</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className={`${td} tabular-nums`}>{l.dateBs}</td>
                  <td className={`${td} tabular-nums`}>{hm(l.at)}</td>
                  <td className={`${td} font-medium ${l.employee.startsWith('(unmapped') ? 'text-amber-600' : 'text-slate-700'}`}>{l.employee}{l.role ? ` · ${l.role}` : ''}</td>
                  <td className={td}>{l.status ? <span className={`badge ${l.status === 'OUT' || l.status === 'BREAK_OUT' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{l.status.replace('_', ' ')}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className={`${td} text-xs`}>{l.verifyMethod ?? <span className="text-slate-300">—</span>}</td>
                  <td className={td}>{l.deviceUserId}</td>
                  <td className={td}><span className={`badge ${l.source === 'DEVICE' ? 'bg-slate-100 text-slate-500' : 'bg-indigo-50 text-indigo-600'}`}>{l.source}</span></td>
                </tr>
              ))}
              {logs.length === 0 && !err && <tr><td colSpan={7} className="p-8 text-center text-slate-400">No punches yet — approve your scanner under the <strong>Device</strong> tab, then have someone scan in.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Day Summary' && (
        <div className="space-y-4">
          {summary.map((s) => (
            <div key={s.employeeId} className="card p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">{s.name} <span className="badge ml-1 bg-slate-100 text-slate-500">{s.role}</span></span>
                <span className="text-sm text-slate-500">{s.presentDays} day(s) · {s.totalHours}h total · avg {s.avgHours}h/day</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100"><th className={th}>Date (BS)</th><th className={th}>First in</th><th className={th}>Last out</th><th className={th}>Hours</th><th className={th}>Punches</th></tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {s.days.map((d: any) => {
                      const key = `${s.employeeId}:${d.date}`;
                      const isOpen = openDay === key;
                      return (
                        <Fragment key={d.date}>
                          <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenDay(isOpen ? null : key)}>
                            <td className={`${td} tabular-nums`}>{d.dateBs}</td>
                            <td className={td}>{hm(d.firstIn)}</td>
                            <td className={td}>{hm(d.lastOut)}</td>
                            <td className={`${td} tabular-nums`}>{d.hours}h</td>
                            <td className={td}>{d.punches} {isOpen ? '▲' : '▼'}</td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={5} className="bg-slate-50 p-2 px-3 text-xs text-slate-500">
                                All punches: {d.punchTimes.map((t: string) => hm(t)).join(' · ')}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {summary.length === 0 && !err && <p className="p-8 text-center text-sm text-slate-400">No attendance in range.</p>}
        </div>
      )}

      {tab === 'Payroll' && payroll && (
        <div className="space-y-4">
          <form onSubmit={addAdjustment} className="card flex flex-wrap items-end gap-2 p-3">
            <div>
              <label className="label">Employee</label>
              <select className="input w-auto" value={adjForm.employeeId} onChange={(e) => setAdjForm({ ...adjForm, employeeId: e.target.value })} required>
                <option value="">— choose —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input w-auto" value={adjForm.type} onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value })}>
                <option value="BONUS">Bonus</option>
                <option value="DEDUCTION">Deduction</option>
                <option value="ADVANCE">Advance</option>
              </select>
            </div>
            <div>
              <label className="label">Amount</label>
              <input type="number" min={0} step={0.01} className="input w-28" value={adjForm.amount} onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })} required />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="label">Note (optional)</label>
              <input className="input" value={adjForm.note} onChange={(e) => setAdjForm({ ...adjForm, note: e.target.value })} />
            </div>
            <button type="submit" className="btn-primary" disabled={adjSaving}>{adjSaving ? 'Saving…' : '+ Add'}</button>
          </form>

          {adjustments.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100"><th className={th}>Employee</th><th className={th}>Type</th><th className={`${th} text-right`}>Amount</th><th className={th}>Note</th><th className={th} /></tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {adjustments.map((a: any) => (
                    <tr key={a.id}>
                      <td className={`${td} font-medium text-slate-700`}>{a.employee?.name}</td>
                      <td className={td}>{a.type}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatMoney(a.amountCents)}</td>
                      <td className={`${td} text-slate-400`}>{a.note ?? ''}</td>
                      <td className={`${td} text-right`}><button onClick={() => removeAdjustment(a.id)} className="text-slate-300 hover:text-red-600">🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3">
              <span className="text-sm font-semibold text-slate-700">Payroll — {payroll.month} (BS {payroll.monthBs})</span>
              <button className="btn-ghost" onClick={() => downloadCsv(`payroll-${payroll.month}.csv`, toCsv(
                ['Employee', 'Role', 'Monthly salary', 'Present days', 'Hours', 'OT hours', 'Per day', 'Gross pay', 'Bonus', 'Deduction', 'Advance', 'Net pay'],
                payroll.rows.map((r: any) => [r.name, r.role, (r.monthlySalaryCents / 100).toFixed(2), r.presentDays, r.totalHours, r.otHours, (r.perDayCents / 100).toFixed(2), (r.grossCents / 100).toFixed(2), (r.bonusCents / 100).toFixed(2), (r.deductionCents / 100).toFixed(2), (r.advanceCents / 100).toFixed(2), (r.netPayCents / 100).toFixed(2)]),
              ))}>⬇ CSV</button>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100"><th className={th}>Employee</th><th className={th}>Role</th><th className={`${th} text-right`}>Salary</th><th className={`${th} text-right`}>Days</th><th className={`${th} text-right`}>Hours</th><th className={`${th} text-right`}>OT</th><th className={`${th} text-right`}>Gross</th><th className={`${th} text-right`}>Net pay</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {payroll.rows.map((r: any) => (
                  <tr key={r.employeeId}>
                    <td className={`${td} font-medium text-slate-700`}>{r.name}</td>
                    <td className={td}>{r.role}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatMoney(r.monthlySalaryCents)}</td>
                    <td className={`${td} text-right`}>{r.presentDays}</td>
                    <td className={`${td} text-right`}>{r.totalHours}h</td>
                    <td className={`${td} text-right`}>{r.otHours}h</td>
                    <td className={`${td} text-right tabular-nums`}>{formatMoney(r.grossCents)}</td>
                    <td className={`${td} text-right font-semibold text-slate-800 tabular-nums`}>{formatMoney(r.netPayCents)}</td>
                    <td className={`${td} text-right`}><button onClick={() => payslip(r)} className="btn-ghost px-2 py-1 text-xs">Payslip</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t border-slate-200 font-semibold text-slate-800"><td className="p-2" colSpan={6}>Totals</td><td className="p-2 text-right tabular-nums">{formatMoney(payroll.totals.grossCents)}</td><td className="p-2 text-right tabular-nums">{formatMoney(payroll.totals.netPayCents)}</td><td /></tr></tfoot>
            </table>
            <p className="p-3 text-xs text-slate-400">{payroll.basis}</p>
          </div>
        </div>
      )}

      {tab === 'Device' && <CloudDevicesCard onRelink={relink} busy={busy} />}
    </div>
  );
}

// ── Device: cloud push (ADMS) only — the only supported connection method ──
type CloudDevice = {
  id: string; serial: string; name: string | null; isActive: boolean;
  lastSeenAt: string | null; lastPushAt: string | null; pushCount: number;
};

function CloudDevicesCard({ onRelink, busy }: { onRelink: () => void; busy: boolean }) {
  const [devices, setDevices] = useState<CloudDevice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const slug = typeof window !== 'undefined' ? tenantSlug() : '';
  const serverAddress = slug ? `${slug}.s3vya.tech` : null;
  const busyIds = useRef<Set<string>>(new Set());
  const [, forceRender] = useState(0);
  const [openUsers, setOpenUsers] = useState<string | null>(null);
  const [deviceUsers, setDeviceUsers] = useState<{ pin: string; name: string | null; card: string | null }[]>([]);

  const load = useCallback(async (silent = false) => {
    try {
      const d = await api.get<CloudDevice[]>('/attendance/devices', { silent });
      setDevices(d);
      setErr(null);
    } catch (e) {
      const message = `Could not load devices — ${(e as Error).message}`;
      if (!silent || !loaded) setErr(message);
    } finally {
      setLoaded(true);
    }
  }, [loaded]);

  // Poll continuously so newly-connecting devices and updated push counts
  // show up live, without the admin needing to reload the page.
  useEffect(() => {
    load();
    const iv = window.setInterval(() => load(true), POLL_MS);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function withBusy(id: string, fn: () => Promise<void>) {
    busyIds.current.add(id); forceRender((n) => n + 1);
    try { await fn(); } finally { busyIds.current.delete(id); forceRender((n) => n + 1); }
  }

  async function toggleActive(d: CloudDevice) {
    await withBusy(d.id, async () => {
      try { await api.patch(`/attendance/devices/${d.id}`, { isActive: !d.isActive }); setNote(null); await load(); }
      catch (e) { setNote(`Could not update "${d.name || d.serial}" — ${(e as Error).message}`); }
    });
  }
  async function rename(d: CloudDevice) {
    const name = window.prompt('Device name', d.name ?? '');
    if (name === null) return;
    await withBusy(d.id, async () => {
      try { await api.patch(`/attendance/devices/${d.id}`, { name }); setNote(null); await load(); }
      catch (e) { setNote(`Could not rename device — ${(e as Error).message}`); }
    });
  }
  async function remove(d: CloudDevice) {
    if (!window.confirm(`Remove device ${d.serial}? Its recorded punches stay in the Punch Log; re-connecting the scanner will register it again as a new pending device.`)) return;
    await withBusy(d.id, async () => {
      try { await api.delete(`/attendance/devices/${d.id}`); setNote(null); await load(); }
      catch (e) { setNote(`Could not remove device — ${(e as Error).message}`); }
    });
  }
  async function toggleUsers(d: CloudDevice) {
    if (openUsers === d.id) { setOpenUsers(null); return; }
    setOpenUsers(d.id);
    try { setDeviceUsers(await api.get(`/attendance/devices/${d.id}/users`)); }
    catch { setDeviceUsers([]); }
  }

  const seen = (v: string | null) => v ? new Date(v).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return (
    <div className="max-w-2xl space-y-4">
      <div className="card space-y-4 p-6">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">☁ Cloud-connected scanner</h2>
          <p className="text-xs text-slate-400">
            Compatible with any ADMS-capable ZKTeco terminal, including the <strong>K40/ID</strong> — the scanner
            pushes punches to us continuously over the internet, no LAN or port-forwarding required. On the device:
            <strong> Menu → Comm. → Cloud Server Setting</strong>, set <strong>Server Mode = ADMS</strong>, then enter:
          </p>
        </div>

        {!serverAddress ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            ⚠ Sign in with your restaurant's subdomain (e.g. <code>yourslug.s3vya.tech</code>) to see the exact
            Server Address to enter on the scanner.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div><span className="block text-xs uppercase tracking-wide text-slate-400">Server Address</span><span className="font-mono font-medium text-slate-700">{serverAddress}</span></div>
            <div><span className="block text-xs uppercase tracking-wide text-slate-400">Server Port</span><span className="font-mono font-medium text-slate-700">80</span></div>
          </div>
        )}

        <p className="text-xs text-slate-400">
          Save on the device, then it appears below (as <em>pending approval</em>) within about a minute — approve
          it once to start accepting its punches continuously. Full setup guide:{' '}
          <code>docs/attendance-cloud-setup.md</code>.
        </p>

        {note && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">⚠ {note}</div>}
        {err && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            <span>⚠ {err}</span>
            <button className="btn-ghost shrink-0 px-2 py-0.5 text-xs" onClick={() => load()}>Retry</button>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              <th className="p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Serial</th>
              <th className="p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Name</th>
              <th className="p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Last seen</th>
              <th className="p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Punches</th>
              <th className="p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Status</th>
              <th className="p-2" />
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {devices.map((d) => {
                const rowBusy = busyIds.current.has(d.id);
                const usersOpen = openUsers === d.id;
                return (
                  <Fragment key={d.id}>
                    <tr className={rowBusy ? 'opacity-50' : ''}>
                      <td className="p-2 font-mono text-xs text-slate-600">{d.serial}</td>
                      <td className="p-2 text-slate-700">{d.name || <span className="text-slate-300">unnamed</span>}</td>
                      <td className="p-2 text-xs text-slate-500">{seen(d.lastSeenAt)}</td>
                      <td className="p-2 text-xs text-slate-500">{d.pushCount}</td>
                      <td className="p-2">
                        <button disabled={rowBusy} onClick={() => toggleActive(d)} className={`badge ${d.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {d.isActive ? '✓ Active' : '⏳ Pending approval'}
                        </button>
                      </td>
                      <td className="p-2 whitespace-nowrap text-right">
                        <button disabled={rowBusy} className="btn-ghost mr-1 px-2 py-1 text-xs" onClick={() => toggleUsers(d)}>{usersOpen ? 'Hide users' : 'Users'}</button>
                        <button disabled={rowBusy} className="btn-ghost mr-1 px-2 py-1 text-xs" onClick={() => rename(d)}>Rename</button>
                        <button disabled={rowBusy} className="btn-ghost px-2 py-1 text-xs text-red-500" onClick={() => remove(d)}>Remove</button>
                      </td>
                    </tr>
                    {usersOpen && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50 p-3 text-xs text-slate-600">
                          <div className="mb-1 font-semibold text-slate-500">Enrolled on the device (synced from its own user table) — use this to match a PIN to the right employee:</div>
                          {deviceUsers.length === 0 ? (
                            <span className="text-slate-400">No enrollment data synced yet — it arrives the next time the device pushes its OPERLOG (usually shortly after a user is added/edited on the scanner itself).</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {deviceUsers.map((u) => (
                                <span key={u.pin} className="badge bg-white text-slate-600">PIN {u.pin} = {u.name || '(unnamed)'}{u.card ? ` · card ${u.card}` : ''}</span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {devices.length === 0 && loaded && !err && (
                <tr><td colSpan={6} className="p-6 text-center text-xs text-slate-400">No device has connected yet — configure the Cloud Server Setting above on the scanner, it should appear here within a minute.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-slate-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live — this list updates automatically.</p>
      </div>

      <div className="card space-y-2 p-6">
        <h2 className="text-sm font-semibold text-slate-700">Map employees to the scanner</h2>
        <p className="text-xs text-slate-400">
          Set each staff member's scanner ID via Employees → Edit → <strong>Fingerprint device ID</strong>, and their{' '}
          <strong>Monthly salary</strong> there for payroll. If punches arrived before an employee was mapped, use
          Re-link to attach them retroactively.
        </p>
        <button className="btn-ghost" onClick={onRelink} disabled={busy}>{busy ? 'Re-linking…' : '↻ Re-link punches'}</button>
      </div>
    </div>
  );
}


export default function AttendancePageGated() {
  return (
    <FeatureGate feature="hrm">
      <AttendancePage />
    </FeatureGate>
  );
}

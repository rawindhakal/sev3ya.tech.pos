'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, formatMoney } from '@/lib/api';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatBsLong } from '@/lib/bs-date';
import type { Settings } from '@/lib/types';

// ZKTeco fingerprint attendance + payroll. The scanner lives on the LAN
// (TCP 4370); "Sync now" pulls users + punches from it. Punches map to
// employees via the Fingerprint device ID on the Employees page.

const TABS = ['Punch Log', 'Day Summary', 'Payroll', 'Device'] as const;
type Tab = (typeof TABS)[number];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const hm = (v: string | Date) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function AttendancePage() {
  const [tab, setTab] = useState<Tab>('Punch Log');
  const [from, setFrom] = useState(iso(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [logs, setLogs] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      if (tab === 'Punch Log') setLogs(await api.get(`/attendance/logs?from=${from}&to=${to}`));
      if (tab === 'Day Summary') setSummary(await api.get(`/attendance/summary?from=${from}&to=${to}`));
      if (tab === 'Payroll') setPayroll(await api.get(`/attendance/payroll?month=${month}`));
    } catch (e) { setMsg((e as Error).message); }
  }, [tab, from, to, month]);
  useEffect(() => { load(); }, [load]);

  async function syncNow() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<any>('/attendance/sync', {});
      setMsg(`✓ Device ${r.device.ip}: ${r.newPunches} new punch(es) of ${r.totalOnDevice} on device · ${r.deviceUsers.length} device users · ${r.mappedEmployees} mapped employees`);
      load();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  async function relink() {
    setBusy(true);
    try { const r = await api.post<any>('/attendance/relink', {}); setMsg(`✓ Re-linked ${r.relinked} punch(es)`); load(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  const th = 'p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400';
  const td = 'p-2 text-slate-600';

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance &amp; Payroll</h1>
          <p className="text-sm text-slate-500">ZKTeco fingerprint device · {formatBsLong(new Date())} BS</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {tab === 'Payroll' ? (
            <input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
          ) : tab !== 'Device' && (
            <>
              <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-slate-400">→</span>
              <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
          <button className="btn-primary" onClick={syncNow} disabled={busy}>{busy ? 'Syncing…' : '⭮ Sync from device'}</button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`badge px-3 py-1.5 ${tab === t ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{t}</button>
        ))}
      </div>

      {msg && <div className={`mb-4 rounded-lg border p-3 text-sm ${msg.startsWith('✓') ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{msg}</div>}

      {tab === 'Punch Log' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100"><th className={th}>Date (BS)</th><th className={th}>Time</th><th className={th}>Employee</th><th className={th}>Device ID</th><th className={th}>Source</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className={`${td} tabular-nums`}>{l.dateBs}</td>
                  <td className={`${td} tabular-nums`}>{hm(l.at)}</td>
                  <td className={`${td} font-medium ${l.employee.startsWith('(unmapped') ? 'text-amber-600' : 'text-slate-700'}`}>{l.employee}{l.role ? ` · ${l.role}` : ''}</td>
                  <td className={td}>{l.deviceUserId}</td>
                  <td className={td}><span className={`badge ${l.source === 'DEVICE' ? 'bg-slate-100 text-slate-500' : 'bg-indigo-50 text-indigo-600'}`}>{l.source}</span></td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">No punches — press &quot;Sync from device&quot;.</td></tr>}
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
                    {s.days.map((d: any) => (
                      <tr key={d.date}><td className={`${td} tabular-nums`}>{d.dateBs}</td><td className={td}>{hm(d.firstIn)}</td><td className={td}>{hm(d.lastOut)}</td><td className={`${td} tabular-nums`}>{d.hours}h</td><td className={td}>{d.punches}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {summary.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No attendance in range.</p>}
        </div>
      )}

      {tab === 'Payroll' && payroll && (
        <div className="card overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3">
            <span className="text-sm font-semibold text-slate-700">Payroll — {payroll.month} (BS {payroll.monthBs})</span>
            <button className="btn-ghost" onClick={() => downloadCsv(`payroll-${payroll.month}.csv`, toCsv(
              ['Employee', 'Role', 'Monthly salary', 'Present days', 'Hours', 'OT hours', 'Per day', 'Gross pay'],
              payroll.rows.map((r: any) => [r.name, r.role, (r.monthlySalaryCents / 100).toFixed(2), r.presentDays, r.totalHours, r.otHours, (r.perDayCents / 100).toFixed(2), (r.grossCents / 100).toFixed(2)]),
            ))}>⬇ CSV</button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100"><th className={th}>Employee</th><th className={th}>Role</th><th className={`${th} text-right`}>Salary</th><th className={`${th} text-right`}>Days</th><th className={`${th} text-right`}>Hours</th><th className={`${th} text-right`}>OT</th><th className={`${th} text-right`}>Gross pay</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {payroll.rows.map((r: any) => (
                <tr key={r.employeeId}>
                  <td className={`${td} font-medium text-slate-700`}>{r.name}</td>
                  <td className={td}>{r.role}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatMoney(r.monthlySalaryCents)}</td>
                  <td className={`${td} text-right`}>{r.presentDays}</td>
                  <td className={`${td} text-right`}>{r.totalHours}h</td>
                  <td className={`${td} text-right`}>{r.otHours}h</td>
                  <td className={`${td} text-right font-semibold text-slate-800 tabular-nums`}>{formatMoney(r.grossCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-slate-200 font-semibold text-slate-800"><td className="p-2" colSpan={6}>Total gross</td><td className="p-2 text-right tabular-nums">{formatMoney(payroll.totals.grossCents)}</td></tr></tfoot>
          </table>
          <p className="p-3 text-xs text-slate-400">{payroll.basis}</p>
        </div>
      )}

      {tab === 'Device' && <DeviceTab onRelink={relink} busy={busy} />}
    </div>
  );
}

// ── Device configuration (LAN IP of the ZKTeco scanner) ──
function DeviceTab({ onRelink, busy }: { onRelink: () => void; busy: boolean }) {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('4370');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    api.get<Settings & { attendanceDevice?: { ip?: string | null; port?: number } }>('/settings').then((s) => {
      setIp(s.attendanceDevice?.ip ?? '');
      setPort(String(s.attendanceDevice?.port ?? 4370));
    }).catch(() => {});
  }, []);

  async function save() {
    try {
      await api.patch('/settings', { zkDeviceIp: ip.trim() || undefined, zkDevicePort: Number(port) || 4370 });
      setNote('Saved ✓');
    } catch (e) { setNote((e as Error).message); }
  }

  return (
    <div className="card max-w-xl space-y-4 p-6">
      <h2 className="text-sm font-semibold text-slate-700">ZKTeco device (local network)</h2>
      <p className="text-xs text-slate-400">
        The scanner speaks TCP on port 4370, so the server running this API must be on the
        same network as the device. Find the IP on the device: Menu → Comm. → Ethernet.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Device IP</label>
          <input className="input" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.201" /></div>
        <div><label className="label">Port</label>
          <input className="input" value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" /></div>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-primary" onClick={save}>Save device</button>
        <button className="btn-ghost" onClick={onRelink} disabled={busy} title="Attach unmapped punches to employees after setting their Fingerprint device IDs">↻ Re-link punches</button>
        {note && <span className="text-xs font-medium text-slate-500">{note}</span>}
      </div>
      <p className="text-xs text-slate-400">
        Map each staff member to their scanner ID via Employees → Edit → <strong>Fingerprint device ID</strong>,
        and set their <strong>Monthly salary</strong> there for payroll.
      </p>
    </div>
  );
}

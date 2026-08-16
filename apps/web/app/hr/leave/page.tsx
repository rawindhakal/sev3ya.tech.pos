'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Employee, LeaveRequest, LeaveType } from '@/lib/types';
import Modal from '@/components/Modal';
import { confirmDialog, promptDialog, notify } from '@/lib/dialog';
import FeatureGate from '@/components/FeatureGate';

const TABS = ['Requests', 'This Month', 'Leave Types'] as const;
type Tab = (typeof TABS)[number];

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-600',
  CANCELLED: 'bg-slate-100 text-slate-400',
};

const blankType = { id: '', name: '', isPaid: true, defaultDaysPerYear: 0, color: '#6366f1' };
const blankRequest = { employeeId: '', leaveTypeId: '', fromDate: '', toDate: '', days: '1', reason: '' };

function HrLeavePage() {
  const [tab, setTab] = useState<Tab>('Requests');
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const [reqModal, setReqModal] = useState(false);
  const [reqForm, setReqForm] = useState(blankRequest);
  const [typeModal, setTypeModal] = useState(false);
  const [typeForm, setTypeForm] = useState(blankType);

  useEffect(() => { api.get<Employee[]>('/employees').then(setEmployees).catch(() => {}); }, []);
  useEffect(() => { api.get<LeaveType[]>('/hr/leave-types').then(setTypes).catch(() => {}); }, []);

  const loadRequests = useCallback(() => {
    api.get<LeaveRequest[]>(`/hr/leave${statusFilter ? `?status=${statusFilter}` : ''}`).then(setRequests).catch((e) => setErr((e as Error).message));
  }, [statusFilter]);
  useEffect(loadRequests, [loadRequests]);

  async function submitRequest(ev: React.FormEvent) {
    ev.preventDefault();
    try {
      await api.post('/hr/leave', { ...reqForm, days: Number(reqForm.days) || 1 });
      setReqModal(false);
      setReqForm(blankRequest);
      loadRequests();
    } catch (e) { notify((e as Error).message, 'error'); }
  }
  async function approve(r: LeaveRequest) {
    try { await api.post(`/hr/leave/${r.id}/approve`, {}); loadRequests(); } catch (e) { notify((e as Error).message, 'error'); }
  }
  async function reject(r: LeaveRequest) {
    const reason = await promptDialog('Reason for rejecting this request:', '', { title: 'Reject leave request' });
    if (!reason?.trim()) return;
    try { await api.post(`/hr/leave/${r.id}/reject`, { reason: reason.trim() }); loadRequests(); } catch (e) { notify((e as Error).message, 'error'); }
  }

  function openTypeCreate() { setTypeForm(blankType); setTypeModal(true); }
  function openTypeEdit(t: LeaveType) { setTypeForm({ id: t.id, name: t.name, isPaid: t.isPaid, defaultDaysPerYear: t.defaultDaysPerYear, color: t.color ?? '#6366f1' }); setTypeModal(true); }
  async function saveType(ev: React.FormEvent) {
    ev.preventDefault();
    try {
      const payload = { name: typeForm.name, isPaid: typeForm.isPaid, defaultDaysPerYear: Number(typeForm.defaultDaysPerYear) || 0, color: typeForm.color };
      if (typeForm.id) await api.patch(`/hr/leave-types/${typeForm.id}`, payload);
      else await api.post('/hr/leave-types', payload);
      setTypeModal(false);
      api.get<LeaveType[]>('/hr/leave-types').then(setTypes);
    } catch (e) { notify((e as Error).message, 'error'); }
  }
  async function removeType(t: LeaveType) {
    if (!(await confirmDialog(`Delete leave type "${t.name}"?`, { danger: true, confirmLabel: 'Delete' }))) return;
    try { await api.delete(`/hr/leave-types/${t.id}`); api.get<LeaveType[]>('/hr/leave-types').then(setTypes); } catch (e) { notify((e as Error).message, 'error'); }
  }

  const thisMonthApproved = requests.filter((r) => r.status === 'APPROVED' && new Date(r.fromDate).getMonth() === new Date().getMonth());

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leave & Time-off</h1>
          <p className="text-sm text-slate-500">Requests, approvals and leave types</p>
        </div>
        <button className="btn-primary" onClick={() => setReqModal(true)}>+ Apply for leave</button>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`badge px-3 py-1.5 ${tab === t ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{t}</button>
        ))}
      </div>

      {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      {tab === 'Requests' && (
        <div className="space-y-3">
          <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="p-3">Employee</th><th className="p-3">Type</th><th className="p-3">Dates</th><th className="p-3 text-right">Days</th><th className="p-3">Status</th><th className="p-3" />
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 font-medium text-slate-700">{r.employee?.name}</td>
                    <td className="p-3"><span className="badge" style={{ backgroundColor: (r.leaveType?.color ?? '#6366f1') + '22', color: r.leaveType?.color ?? '#6366f1' }}>{r.leaveType?.name}</span></td>
                    <td className="p-3 text-xs text-slate-500">{new Date(r.fromDate).toLocaleDateString()} → {new Date(r.toDate).toLocaleDateString()}</td>
                    <td className="p-3 text-right tabular-nums">{r.days}</td>
                    <td className="p-3"><span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                    <td className="p-3 text-right">
                      {r.status === 'PENDING' && (
                        <>
                          <button onClick={() => approve(r)} className="px-1 text-emerald-500 hover:text-emerald-700">✓</button>
                          <button onClick={() => reject(r)} className="px-1 text-red-400 hover:text-red-600">✕</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">No leave requests.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'This Month' && (
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-slate-800">Approved leave this month</h2>
          {thisMonthApproved.length === 0 ? <p className="text-sm text-slate-400">Nobody on approved leave this month.</p> : (
            <div className="space-y-2">
              {thisMonthApproved.sort((a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime()).map((r) => (
                <div key={r.id} className="flex items-center justify-between border-b border-slate-50 py-1.5 text-sm">
                  <span><span className="font-medium text-slate-700">{r.employee?.name}</span> — {r.leaveType?.name}</span>
                  <span className="text-xs text-slate-500">{new Date(r.fromDate).toLocaleDateString()} → {new Date(r.toDate).toLocaleDateString()} ({r.days}d)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'Leave Types' && (
        <div className="space-y-3">
          <div className="flex justify-end"><button className="btn-primary" onClick={openTypeCreate}>+ Leave type</button></div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400"><th className="p-3">Name</th><th className="p-3">Paid</th><th className="p-3 text-right">Days/year</th><th className="p-3" /></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {types.map((t) => (
                  <tr key={t.id}>
                    <td className="p-3 font-medium text-slate-700"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color ?? '#6366f1' }} />{t.name}{!t.isActive && <span className="ml-2 badge bg-slate-100 text-slate-400">Inactive</span>}</td>
                    <td className="p-3">{t.isPaid ? 'Yes' : 'No'}</td>
                    <td className="p-3 text-right">{t.defaultDaysPerYear}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => openTypeEdit(t)} className="px-1 text-slate-400 hover:text-slate-600">✏️</button>
                      <button onClick={() => removeType(t)} className="px-1 text-slate-400 hover:text-red-600">🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={reqModal} title="Apply for leave" onClose={() => setReqModal(false)}>
        <form onSubmit={submitRequest} className="space-y-3">
          <div><label className="label">Employee</label>
            <select className="input" value={reqForm.employeeId} onChange={(e) => setReqForm({ ...reqForm, employeeId: e.target.value })} required>
              <option value="">— choose —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></div>
          <div><label className="label">Leave type</label>
            <select className="input" value={reqForm.leaveTypeId} onChange={(e) => setReqForm({ ...reqForm, leaveTypeId: e.target.value })} required>
              <option value="">— choose —</option>
              {types.filter((t) => t.isActive).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">From</label><input type="date" className="input" value={reqForm.fromDate} onChange={(e) => setReqForm({ ...reqForm, fromDate: e.target.value })} required /></div>
            <div><label className="label">To</label><input type="date" className="input" value={reqForm.toDate} onChange={(e) => setReqForm({ ...reqForm, toDate: e.target.value })} required /></div>
            <div><label className="label">Days</label><input type="number" min={0.5} step={0.5} className="input" value={reqForm.days} onChange={(e) => setReqForm({ ...reqForm, days: e.target.value })} /></div>
          </div>
          <div><label className="label">Reason (optional)</label><input className="input" value={reqForm.reason} onChange={(e) => setReqForm({ ...reqForm, reason: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setReqModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Submit</button>
          </div>
        </form>
      </Modal>

      <Modal open={typeModal} title={typeForm.id ? 'Edit leave type' : 'New leave type'} onClose={() => setTypeModal(false)}>
        <form onSubmit={saveType} className="space-y-3">
          <div><label className="label">Name</label><input className="input" value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} required autoFocus placeholder="e.g. Annual Leave" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Days/year</label><input type="number" min={0} className="input" value={typeForm.defaultDaysPerYear} onChange={(e) => setTypeForm({ ...typeForm, defaultDaysPerYear: Number(e.target.value) })} /></div>
            <div><label className="label">Color</label><input type="color" className="input h-10" value={typeForm.color} onChange={(e) => setTypeForm({ ...typeForm, color: e.target.value })} /></div>
            <label className="flex items-center gap-2 pt-6 text-sm text-slate-600"><input type="checkbox" checked={typeForm.isPaid} onChange={(e) => setTypeForm({ ...typeForm, isPaid: e.target.checked })} /> Paid</label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setTypeModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


export default function HrLeavePageGated() {
  return (
    <FeatureGate feature="hrm">
      <HrLeavePage />
    </FeatureGate>
  );
}

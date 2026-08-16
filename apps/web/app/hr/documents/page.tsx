'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Employee, EmployeeDocument } from '@/lib/types';
import Modal from '@/components/Modal';
import { confirmDialog, notify } from '@/lib/dialog';
import FeatureGate from '@/components/FeatureGate';

const DOC_TYPES = ['CITIZENSHIP', 'PASSPORT', 'PAN', 'CONTRACT', 'CERTIFICATE', 'OTHER'];
const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];

const blankDoc = { type: 'OTHER', title: '', documentNumber: '', issueDate: '', expiryDate: '', url: '', notes: '' };

function HrDocumentsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState('');
  const [docs, setDocs] = useState<EmployeeDocument[]>([]);
  const [profile, setProfile] = useState<Partial<Employee>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(blankDoc);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<Employee[]>('/employees').then((emps) => {
      setEmployees(emps);
      if (!selected && emps.length) setSelected(emps[0].id);
    }).catch((e) => setErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDocs = () => {
    if (!selected) return;
    api.get<EmployeeDocument[]>(`/hr/documents?employeeId=${selected}`).then(setDocs).catch(() => {});
  };
  useEffect(loadDocs, [selected]);
  useEffect(() => {
    const emp = employees.find((e) => e.id === selected);
    setProfile(emp ?? {});
  }, [selected, employees]);

  async function saveProfile() {
    if (!selected) return;
    setSaving(true);
    try {
      const dateOnly = (v?: string | null) => (v ? v.slice(0, 10) : '');
      await api.patch(`/hr/employees/${selected}/profile`, {
        dateOfBirth: dateOnly(profile.dateOfBirth), joinDate: dateOnly(profile.joinDate),
        phone: profile.phone ?? '', address: profile.address ?? '',
        emergencyContactName: profile.emergencyContactName ?? '', emergencyContactPhone: profile.emergencyContactPhone ?? '',
        bankName: profile.bankName ?? '', bankAccountNumber: profile.bankAccountNumber ?? '',
        panNumber: profile.panNumber ?? '', employmentType: profile.employmentType ?? '',
        designation: profile.designation ?? '',
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { notify((e as Error).message, 'error'); } finally { setSaving(false); }
  }

  async function addDoc(ev: React.FormEvent) {
    ev.preventDefault();
    try {
      await api.post('/hr/documents', { ...form, employeeId: selected });
      setModal(false);
      setForm(blankDoc);
      loadDocs();
    } catch (e) { notify((e as Error).message, 'error'); }
  }
  async function removeDoc(d: EmployeeDocument) {
    if (!(await confirmDialog(`Delete "${d.title}"?`, { danger: true, confirmLabel: 'Delete' }))) return;
    try { await api.delete(`/hr/documents/${d.id}`); loadDocs(); } catch (e) { notify((e as Error).message, 'error'); }
  }

  const isExpiring = (d: EmployeeDocument) => d.expiryDate && new Date(d.expiryDate).getTime() < Date.now() + 30 * 864e5;
  const isExpired = (d: EmployeeDocument) => d.expiryDate && new Date(d.expiryDate).getTime() < Date.now();

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Employee Documents</h1>
        <p className="text-sm text-slate-500">Personal profile, contacts, bank details and document expiry tracking</p>
      </header>

      {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="mb-5">
        <label className="label">Employee</label>
        <select className="input w-auto min-w-[240px]" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {selected && (
        <>
          <div className="card mb-6 p-5">
            <h2 className="mb-3 font-semibold text-slate-800">Profile</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className="label">Designation</label><input className="input" value={profile.designation ?? ''} onChange={(e) => setProfile({ ...profile, designation: e.target.value })} placeholder="e.g. Head Chef" /></div>
              <div><label className="label">Employment type</label>
                <select className="input" value={profile.employmentType ?? ''} onChange={(e) => setProfile({ ...profile, employmentType: e.target.value })}>
                  <option value="">—</option>
                  {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select></div>
              <div><label className="label">Date of birth</label><input type="date" className="input" value={profile.dateOfBirth?.slice(0, 10) ?? ''} onChange={(e) => setProfile({ ...profile, dateOfBirth: e.target.value })} /></div>
              <div><label className="label">Join date</label><input type="date" className="input" value={profile.joinDate?.slice(0, 10) ?? ''} onChange={(e) => setProfile({ ...profile, joinDate: e.target.value })} /></div>
              <div><label className="label">Phone</label><input className="input" value={profile.phone ?? ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
              <div><label className="label">Address</label><input className="input" value={profile.address ?? ''} onChange={(e) => setProfile({ ...profile, address: e.target.value })} /></div>
              <div><label className="label">Emergency contact name</label><input className="input" value={profile.emergencyContactName ?? ''} onChange={(e) => setProfile({ ...profile, emergencyContactName: e.target.value })} /></div>
              <div><label className="label">Emergency contact phone</label><input className="input" value={profile.emergencyContactPhone ?? ''} onChange={(e) => setProfile({ ...profile, emergencyContactPhone: e.target.value })} /></div>
              <div><label className="label">PAN number</label><input className="input" value={profile.panNumber ?? ''} onChange={(e) => setProfile({ ...profile, panNumber: e.target.value })} /></div>
              <div><label className="label">Bank name</label><input className="input" value={profile.bankName ?? ''} onChange={(e) => setProfile({ ...profile, bankName: e.target.value })} /></div>
              <div><label className="label">Bank account number</label><input className="input" value={profile.bankAccountNumber ?? ''} onChange={(e) => setProfile({ ...profile, bankAccountNumber: e.target.value })} /></div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button className="btn-primary" onClick={saveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
              {saved && <span className="text-sm font-medium text-emerald-600">Saved ✓</span>}
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Documents</h2>
              <button className="btn-primary" onClick={() => setModal(true)}>+ Document</button>
            </div>
            <div className="space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between border-b border-slate-50 py-2 text-sm">
                  <div>
                    <span className="font-medium text-slate-700">{d.title}</span>
                    <span className="ml-1 badge bg-slate-100 text-slate-500">{d.type}</span>
                    {d.documentNumber && <span className="ml-2 text-xs text-slate-400">#{d.documentNumber}</span>}
                    {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="ml-2 text-xs text-brand-600 underline">view</a>}
                  </div>
                  <div className="flex items-center gap-2">
                    {d.expiryDate && (
                      <span className={`badge ${isExpired(d) ? 'bg-red-100 text-red-600' : isExpiring(d) ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                        {isExpired(d) ? 'Expired' : 'Expires'} {new Date(d.expiryDate).toLocaleDateString()}
                      </span>
                    )}
                    <button onClick={() => removeDoc(d)} className="text-slate-300 hover:text-red-600">🗑</button>
                  </div>
                </div>
              ))}
              {docs.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No documents on file.</p>}
            </div>
          </div>
        </>
      )}

      <Modal open={modal} title="New document" onClose={() => setModal(false)}>
        <form onSubmit={addDoc} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Type</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="label">Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus placeholder="e.g. Citizenship certificate" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Document number</label><input className="input" value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} /></div>
            <div><label className="label">Link to scan (optional)</label><input className="input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Issue date</label><input type="date" className="input" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></div>
            <div><label className="label">Expiry date</label><input type="date" className="input" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></div>
          </div>
          <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


export default function HrDocumentsPageGated() {
  return (
    <FeatureGate feature="hrm">
      <HrDocumentsPage />
    </FeatureGate>
  );
}

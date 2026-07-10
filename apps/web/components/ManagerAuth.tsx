'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Employee } from '@/lib/types';
import Modal from '@/components/Modal';

export interface ManagerCred {
  emp: Employee;
  token: string;
}

// Manager/admin approval dialog — replaces the old PIN overrides. The
// authoriser signs in with their own username + password; their token is used
// for the single privileged action (discount, void, credit settlement, …).
export default function ManagerAuth({
  open,
  title = 'Manager approval required',
  hint,
  permission, // additionally require a specific permission flag
  onApproved,
  onClose,
}: {
  open: boolean;
  title?: string;
  hint?: string;
  permission?: 'canVoid' | 'canDiscount' | 'canManageStaff';
  onApproved: (cred: ManagerCred) => void;
  onClose: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setUsername(''); setPassword(''); setErr(''); }
  }, [open]);

  async function approve() {
    if (!username.trim() || !password) return setErr('Enter the manager username and password');
    setBusy(true);
    setErr('');
    try {
      const emp = await api.post<Employee & { token?: string }>('/employees/login', {
        username: username.trim(),
        password,
      });
      if (!['ADMIN', 'MANAGER'].includes(emp.role)) {
        setErr('Only an admin or manager can approve this');
      } else if (permission && !emp[permission]) {
        setErr(`${emp.name} does not have the required permission`);
      } else if (!emp.token) {
        setErr('Sign-in failed');
      } else {
        onApproved({ emp, token: emp.token });
        onClose();
      }
    } catch {
      setErr('Invalid username or password');
    } finally {
      setBusy(false);
      setPassword('');
    }
  }

  return (
    <Modal open={open} title={`🔐 ${title}`} onClose={onClose}>
      <div className="space-y-3">
        {hint && <p className="text-sm text-slate-500 dark:text-slate-300">{hint}</p>}
        {err && <p className="text-xs font-medium text-red-500">{err}</p>}
        <input
          className="input"
          placeholder="Manager / admin username"
          value={username}
          autoFocus
          autoComplete="off"
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && approve()}
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && approve()}
        />
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={approve}>
            {busy ? 'Checking…' : 'Approve'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

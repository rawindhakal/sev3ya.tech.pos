'use client';

import { useEffect, useState } from 'react';
import { getStatus, onStatusChange, startHeartbeat, setReconnectHandler, type ConnStatus } from '@/lib/offline';
import { syncOutbox } from '@/lib/api';
import { onPendingChange } from '@/lib/outbox';

// Online/offline pill for the POS top bar. Starts the connectivity heartbeat,
// drains the write outbox on reconnect, and shows how many writes are still
// pending sync.
export default function ConnBadge({ className = '' }: { className?: string }) {
  const [status, setStatus] = useState<ConnStatus>(getStatus());
  const [pending, setPending] = useState(0);

  useEffect(() => {
    startHeartbeat();
    setReconnectHandler(() => { void syncOutbox(); });
    const offStatus = onStatusChange(setStatus);
    const offPending = onPendingChange(setPending);
    return () => { offStatus(); offPending(); };
  }, []);

  const online = status === 'online';
  const label = online
    ? pending > 0 ? `SYNCING ${pending}` : 'ONLINE'
    : pending > 0 ? `OFFLINE · ${pending} queued` : 'OFFLINE';

  return (
    <span
      title={
        online
          ? pending > 0 ? `Reconnected — syncing ${pending} queued write(s)` : 'Connected to server'
          : `Offline — working from cache${pending ? `, ${pending} write(s) queued to sync` : ''}`
      }
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        online ? 'bg-[#2ECC71]/15 text-[#2ECC71]' : 'bg-[#E74C3C]/15 text-[#E74C3C]'
      } ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-[#2ECC71]' : 'bg-[#E74C3C] animate-pulse'}`} />
      {label}
    </span>
  );
}

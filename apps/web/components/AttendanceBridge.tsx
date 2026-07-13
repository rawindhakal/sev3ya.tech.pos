'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { isDesktopShell } from '@/lib/printing';
import type { Settings } from '@/lib/types';

// Desktop-only background agent (same pattern as the KOT auto-printer): the
// till is on the same LAN as the ZKTeco fingerprint scanner, so it pulls
// punches from the device every few minutes and pushes them to the cloud API.
// Ingest is idempotent server-side, so overlapping tills never duplicate.
// Renders nothing; does nothing outside the Electron shell.
const PULL_EVERY_MS = 5 * 60 * 1000; // 5 minutes

export default function AttendanceBridge() {
  useEffect(() => {
    if (!isDesktopShell() || !window.cakezakeDesktop?.pullAttendance) return;

    let stopped = false;
    let busy = false;

    async function tick() {
      if (stopped || busy) return;
      busy = true;
      try {
        const s = await api.get<Settings & { attendanceDevice?: { ip?: string | null; port?: number } }>('/settings');
        const ip = s.attendanceDevice?.ip;
        if (!ip) return; // no scanner configured
        const res = await window.cakezakeDesktop!.pullAttendance!({ ip, port: s.attendanceDevice?.port ?? 4370 });
        if (res?.error) {
          console.warn('[attendance-bridge]', res.error);
          return;
        }
        if (res?.punches?.length) {
          const r = await api.post<{ newPunches: number }>('/attendance/ingest', { punches: res.punches });
          if (r.newPunches > 0) console.info(`[attendance-bridge] synced ${r.newPunches} new punch(es)`);
        }
      } catch (err) {
        console.warn('[attendance-bridge]', (err as Error).message);
      } finally {
        busy = false;
      }
    }

    const first = window.setTimeout(tick, 20000); // settle after launch
    const iv = window.setInterval(tick, PULL_EVERY_MS);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(iv);
    };
  }, []);

  return null;
}

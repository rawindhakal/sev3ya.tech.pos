'use client';

import { useEffect, useState } from 'react';
import { onRequestActivity } from '@/lib/api';

// Thin animated bar pinned to the very top of the viewport — the "something
// is happening in the background" signal for every page load, save, and
// print. Indeterminate (no real percentage from most of our fetches), so
// it's a sliding gradient rather than a filling bar. Wired once in AppShell
// off the shared api.ts request counter, so any page gets this for free —
// no per-page busy-state plumbing needed. A short show-delay avoids flicker
// on requests that resolve near-instantly (cache hits, LAN round-trips).
export default function GlobalTopProgressBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = onRequestActivity((active) => {
      if (active) {
        showTimer = setTimeout(() => setVisible(true), 150);
      } else {
        if (showTimer) clearTimeout(showTimer);
        setVisible(false);
      }
    });
    return () => {
      if (showTimer) clearTimeout(showTimer);
      unsubscribe();
    };
  }, []);

  if (!visible) return null;
  return (
    <div className="fixed left-0 right-0 top-0 z-[100] h-1 overflow-hidden bg-transparent">
      <div className="h-full w-1/3 animate-[top-progress_1.1s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-brand-400 via-brand-600 to-brand-400" />
    </div>
  );
}

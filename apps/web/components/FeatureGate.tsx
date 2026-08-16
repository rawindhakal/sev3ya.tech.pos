'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Features } from '@/lib/types';

// Blocks a page's content when its module is toggled off in Settings — the
// backend already 403s the underlying API calls (see @RequireFeature on the
// matching controller), this just avoids a broken-looking page reaching that
// point. Fails open on a fetch error so a network hiccup doesn't lock staff
// out of a module that's actually enabled.
export default function FeatureGate({ feature, children }: { feature: keyof Features; children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'on' | 'off'>('loading');

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ features?: Features }>('/settings')
      .then((s) => {
        if (cancelled) return;
        setState(s.features && s.features[feature] === false ? 'off' : 'on');
      })
      .catch(() => {
        if (!cancelled) setState('on');
      });
    return () => {
      cancelled = true;
    };
  }, [feature]);

  if (state === 'loading') return null;

  if (state === 'off') {
    return (
      <div className="mx-auto max-w-xl p-10 text-center">
        <div className="mb-2 text-3xl">🚫</div>
        <h1 className="mb-1 text-lg font-bold text-slate-800 dark:text-white">This module is disabled</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ask an admin to enable it from Settings → General.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

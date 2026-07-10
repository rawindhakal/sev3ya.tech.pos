'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import type { Settings } from '@/lib/types';
import {
  getPrinterPrefs,
  isDesktopShell,
  kotTemplateOf,
  kotTicketHtml,
  type KotQueueItem,
} from '@/lib/printing';

// Desktop-only background agent: polls the server's KOT print queue and
// silently prints tickets for items fired elsewhere (e.g. by a waiter's
// handheld), then acknowledges them so nothing ever prints twice.
// Renders nothing; does nothing outside the Electron shell.
export default function AutoPrintAgent() {
  const settingsRef = useRef<Settings | null>(null);

  useEffect(() => {
    if (!isDesktopShell() || !window.cakezakeDesktop?.printHtml) return;

    let stopped = false;
    let busy = false;

    api.get<Settings>('/settings').then((s) => (settingsRef.current = s)).catch(() => {});

    async function tick() {
      if (stopped || busy) return;
      busy = true;
      try {
        const prefs = getPrinterPrefs();
        if (!prefs.autoPrintKot) return;
        const queue = await api.get<KotQueueItem[]>('/orders/kot-queue');
        const printable = queue.filter((q) => q.station === 'KITCHEN' || q.station === 'BAR');
        if (!printable.length) return;

        const template = kotTemplateOf(settingsRef.current);
        // One ticket per order + station (a KOT and a BOT can both fire).
        const groups = new Map<string, KotQueueItem[]>();
        for (const item of printable) {
          const key = `${item.orderId}:${item.station}`;
          groups.set(key, [...(groups.get(key) ?? []), item]);
        }

        const printedIds: string[] = [];
        for (const items of groups.values()) {
          const first = items[0];
          const station = first.station as 'KITCHEN' | 'BAR';
          const printer = station === 'BAR' ? prefs.bot || prefs.kot : prefs.kot;
          const html = kotTicketHtml({
            template,
            station,
            orderNumber: first.orderNumber,
            orderType: first.orderType,
            table: first.table,
            waiter: first.waiter,
            items,
          });
          const res = await window.cakezakeDesktop!.printHtml!({
            html,
            printerName: printer,
            widthMm: template.paperWidthMm,
          });
          if (res?.ok) printedIds.push(...items.map((i) => i.id));
        }
        if (printedIds.length) await api.post('/orders/kot-queue/printed', { itemIds: printedIds });
      } catch {
        /* offline or transient — retry next tick */
      } finally {
        busy = false;
      }
    }

    const iv = window.setInterval(tick, 6000);
    tick();
    return () => {
      stopped = true;
      window.clearInterval(iv);
    };
  }, []);

  return null;
}

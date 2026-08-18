'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import type { Settings } from '@/lib/types';
import { notify } from '@/lib/dialog';
import {
  getPrinterPrefs,
  isDesktopShell,
  kotTemplateOf,
  kotTicketHtml,
  resolveTargetPrinter,
  type KotQueueItem,
} from '@/lib/printing';

// Desktop-only background agent: polls the server's KOT print queue and
// silently prints tickets for items fired elsewhere (e.g. by a waiter's
// handheld), then acknowledges them so nothing ever prints twice.
// Renders nothing; does nothing outside the Electron shell.
export default function AutoPrintAgent() {
  const settingsRef = useRef<Settings | null>(null);
  // Throttle failure notifications — without this, a KOT stuck behind a
  // broken printer would silently retry forever every 6s with the cashier
  // never finding out the kitchen isn't getting tickets.
  const lastWarnedRef = useRef<{ message: string; at: number } | null>(null);

  useEffect(() => {
    if (!isDesktopShell() || !window.cakezakeDesktop?.printHtml) return;

    let stopped = false;
    let busy = false;

    // Refetched periodically, not just once at mount — this agent can run
    // for a whole shift (or longer) inside the desktop shell, so a template
    // edit saved under Settings → Printing needs to reach it without
    // requiring an app restart. Every tick would be wasteful; once a minute
    // is frequent enough for a settings change to take effect promptly.
    function refreshSettings() {
      api.get<Settings>('/settings', { silent: true }).then((s) => (settingsRef.current = s)).catch(() => {});
    }
    refreshSettings();
    const settingsIv = window.setInterval(refreshSettings, 60000);

    function warnOnce(message: string) {
      const last = lastWarnedRef.current;
      if (last && last.message === message && Date.now() - last.at < 120000) return; // same failure, keep quiet for 2min
      lastWarnedRef.current = { message, at: Date.now() };
      notify(message, 'error');
    }

    async function tick() {
      if (stopped || busy) return;
      busy = true;
      try {
        const prefs = getPrinterPrefs();
        if (!prefs.autoPrintKot) return;
        const queue = await api.get<KotQueueItem[]>('/orders/kot-queue', { silent: true });
        const printable = queue.filter((q) => q.station === 'KITCHEN' || q.station === 'BAR');
        if (!printable.length) return;

        const template = kotTemplateOf(settingsRef.current);
        // One ticket per order + station + resolved printer — items on the
        // same station but routed to different physical printers (e.g. two
        // kitchen printers, K1/K2) must fire as separate tickets, not get
        // merged onto whichever printer happened to be first.
        const groups = new Map<string, KotQueueItem[]>();
        for (const item of printable) {
          const key = `${item.orderId}:${item.station}:${item.printerName ?? 'default'}`;
          groups.set(key, [...(groups.get(key) ?? []), item]);
        }

        const printedIds: string[] = [];
        for (const items of groups.values()) {
          const first = items[0];
          const station = first.station as 'KITCHEN' | 'BAR';
          const printer = resolveTargetPrinter(station, first.printerName, prefs);
          const html = kotTicketHtml({
            template,
            station,
            orderNumber: first.orderNumber,
            ticketNo: first.ticketNo,
            orderType: first.orderType,
            table: first.table,
            tableNo: first.tableNo,
            area: first.area,
            terminal: first.terminal,
            waiter: first.waiter,
            guestCount: first.guestCount,
            items,
          });
          const res = await window.cakezakeDesktop!.printHtml!({
            html,
            printerName: printer,
            widthMm: template.paperWidthMm,
          });
          if (res?.ok) {
            printedIds.push(...items.map((i) => i.id));
            if (res.warning) warnOnce(res.warning);
          } else {
            warnOnce(`Auto-print failed for order #${first.orderNumber} (${station.toLowerCase()}): ${res?.error || 'unknown error'}. It will keep retrying — check the printer under Settings → Printing.`);
          }
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
      window.clearInterval(settingsIv);
    };
  }, []);

  return null;
}

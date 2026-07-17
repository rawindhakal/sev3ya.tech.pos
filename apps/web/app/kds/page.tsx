'use client';

// Kitchen Display System (matrix #41–55, design spec §4). Dark screen with
// color-coded urgency timers (charcoal → amber @3m → crimson @5m), per-item
// ready taps, ticket bump, and a Processing/Ready token rail.
import { useEffect, useRef, useState } from 'react';
import { playDing } from '@/lib/sound';
import { api } from '@/lib/api';

interface KdsItem {
  id: string;
  name: string;
  quantity: number;
  modifiers?: { name: string; priceCents: number }[] | null;
  kotStatus: string;
  notes?: string | null;
}
interface KdsTicket {
  id: string;
  number: number;
  type: string;
  status: string;
  table: string | null;
  firedAt: string | null;
  items: KdsItem[];
}

function urgency(firedAt: string | null, nowMs: number) {
  const mins = firedAt ? (nowMs - new Date(firedAt).getTime()) / 60000 : 0;
  const secs = Math.max(0, Math.floor((firedAt ? nowMs - new Date(firedAt).getTime() : 0) / 1000));
  const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  if (mins > 5) return { label, ring: 'border-[#C0392B] bg-[#C0392B]/15', head: 'bg-[#C0392B]', flash: 'animate-pulse' };
  if (mins > 3) return { label, ring: 'border-[#F39C12] bg-[#F39C12]/10', head: 'bg-[#F39C12]', flash: '' };
  return { label, ring: 'border-[#2C3E50] bg-white/5', head: 'bg-[#2C3E50]', flash: '' };
}

export default function KdsPage() {
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  const prevCount = useRef<number | null>(null);
  async function load() {
    try {
      const rows = await api.get<KdsTicket[]>('/kds/tickets');
      if (prevCount.current !== null && rows.length > prevCount.current) playDing();
      prevCount.current = rows.length;
      setTickets(rows);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    const poll = setInterval(load, 5000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  async function itemReady(id: string) {
    try {
      setTickets(await api.post<KdsTicket[]>(`/kds/items/${id}/ready`, {}));
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function bump(id: string) {
    try {
      setTickets(await api.post<KdsTicket[]>(`/kds/orders/${id}/bump`, {}));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const processing = tickets.filter((t) => t.status === 'SENT_TO_KITCHEN');
  const ready = tickets.filter((t) => t.status === 'READY');

  return (
    <div className="flex h-full flex-col bg-[#1A1A1A] text-white">
      {/* header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#111] px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">👨‍🍳</span>
          <span className="font-bold tracking-wide">KITCHEN DISPLAY</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-white/50">{tickets.length} active tickets</span>
          <span className="flex items-center gap-1.5 text-[#2ECC71]"><span className="h-2 w-2 rounded-full bg-[#2ECC71]" /> LIVE</span>
        </div>
      </div>

      {/* token rail */}
      <div className="flex gap-6 border-b border-white/10 bg-[#161616] px-5 py-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-white/40">Processing</span>
          {processing.map((t) => <span key={t.id} className="rounded bg-[#F39C12]/20 px-2 py-0.5 font-bold text-[#F39C12]">#{t.number}</span>)}
          {processing.length === 0 && <span className="text-white/20">—</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-white/40">Ready</span>
          {ready.map((t) => <span key={t.id} className="rounded bg-[#2ECC71]/20 px-2 py-0.5 font-bold text-[#2ECC71]">#{t.number}</span>)}
          {ready.length === 0 && <span className="text-white/20">—</span>}
        </div>
      </div>

      {error && <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error} — is the API running?</div>}

      {/* tickets */}
      {tickets.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-white/30">
          <div className="text-center">
            <div className="mb-2 text-5xl">🍳</div>
            <p>No active kitchen tickets. Fire a KOT from the POS.</p>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tickets.map((t) => {
            const u = urgency(t.firedAt, now);
            return (
              <div key={t.id} className={`flex flex-col overflow-hidden rounded-xl border-2 ${u.ring} ${u.flash}`}>
                <div className={`flex items-center justify-between px-3 py-2 text-black ${u.head}`}>
                  <span className="font-bold">#{t.number} · {t.table ?? t.type.replace('_', ' ')}</span>
                  <span className="font-mono font-bold tabular-nums">{u.label}</span>
                </div>
                <div className="flex-1 space-y-1.5 p-3">
                  {t.items.map((it) => {
                    const mods = Array.isArray(it.modifiers) ? it.modifiers : [];
                    const done = it.kotStatus === 'READY' || it.kotStatus === 'SERVED';
                    return (
                      <button
                        key={it.id}
                        onClick={() => !done && itemReady(it.id)}
                        className={`flex w-full items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${done ? 'bg-[#2ECC71]/15 text-white/40 line-through' : 'bg-white/5 hover:bg-white/10'}`}
                      >
                        <span>
                          <span className="font-bold text-[#2ECC71]">{it.quantity}×</span> {it.name}
                          {mods.length > 0 && <span className="block text-[11px] text-white/40">— {mods.map((m) => m.name).join(', ')}</span>}
                          {it.notes && <span className="block text-[11px] text-amber-300">✎ {it.notes}</span>}
                        </span>
                        {done && <span className="text-[#2ECC71]">✓</span>}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => bump(t.id)} className="border-t border-white/10 bg-white/5 py-2 text-sm font-bold text-white/80 hover:bg-[#2ECC71] hover:text-black">
                  ✓ BUMP
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

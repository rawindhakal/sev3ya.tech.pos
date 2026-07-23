'use client';

// Kitchen Display System (matrix #41–55, design spec §4). Dark screen with
// color-coded urgency timers (charcoal → amber @3m → crimson @5m), per-item
// ready taps, ticket bump, and a Processing/Ready token rail.
//
// Flexible-for-every-chef additions: a per-station filter (All/Kitchen/Bar)
// so a dedicated kitchen screen and a dedicated bar screen can both point at
// the same KDS and only see their own tickets; a large-text mode for screens
// mounted far from the pass; a mute toggle; an undo for a mis-tapped item;
// and the out-of-stock (86) button wired up to the existing API endpoint.
import { useEffect, useRef, useState } from 'react';
import { playDing } from '@/lib/sound';
import { api } from '@/lib/api';
import { notify } from '@/lib/dialog';

interface KdsItem {
  id: string;
  menuItemId?: string | null;
  name: string;
  quantity: number;
  modifiers?: { name: string; priceCents: number }[] | null;
  kotStatus: string;
  station: 'KITCHEN' | 'BAR' | 'BILLING';
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

type StationFilter = 'ALL' | 'KITCHEN' | 'BAR';
const STATION_KEY = 's3vya-kds-station';
const TEXT_KEY = 's3vya-kds-textsize';
const MUTE_KEY = 's3vya-kds-muted';

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
  const [station, setStation] = useState<StationFilter>('ALL');
  const [large, setLarge] = useState(false);
  const [muted, setMuted] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Load per-device prefs. A `?station=KITCHEN` / `?station=BAR` link lets
  // you point a fixed-mount tablet at its station once — it's remembered
  // locally from then on, no need to tap the toggle every reload.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('station');
    if (fromUrl === 'KITCHEN' || fromUrl === 'BAR' || fromUrl === 'ALL') {
      setStation(fromUrl);
      localStorage.setItem(STATION_KEY, fromUrl);
    } else {
      const saved = localStorage.getItem(STATION_KEY);
      if (saved === 'KITCHEN' || saved === 'BAR' || saved === 'ALL') setStation(saved);
    }
    setLarge(localStorage.getItem(TEXT_KEY) === '1');
    setMuted(localStorage.getItem(MUTE_KEY) === '1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseStation(s: StationFilter) {
    setStation(s);
    localStorage.setItem(STATION_KEY, s);
  }
  function toggleLarge() {
    setLarge((v) => { localStorage.setItem(TEXT_KEY, v ? '0' : '1'); return !v; });
  }
  function toggleMuted() {
    setMuted((v) => { localStorage.setItem(MUTE_KEY, v ? '0' : '1'); return !v; });
  }

  const prevCount = useRef<number | null>(null);
  async function load() {
    try {
      const rows = await api.get<KdsTicket[]>('/kds/tickets');
      if (!muted && prevCount.current !== null && rows.length > prevCount.current) playDing();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  async function itemReady(id: string) {
    setBusyId(id);
    try {
      setTickets(await api.post<KdsTicket[]>(`/kds/items/${id}/ready`, {}));
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  }
  async function itemUndo(id: string) {
    setBusyId(id);
    try {
      setTickets(await api.post<KdsTicket[]>(`/kds/items/${id}/unready`, {}));
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  }
  async function markOutOfStock(item: KdsItem) {
    if (!item.menuItemId) return;
    try {
      await api.post(`/kds/items/${item.id}/out-of-stock`, { menuItemId: item.menuItemId });
      notify(`${item.name} marked out of stock — it's hidden from the POS menu now.`, 'success');
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }
  // Bump: with a station filter active, only that station's items on the
  // ticket close (the rest of the order stays open for the other station);
  // with no filter, the whole ticket closes — same as before.
  async function bump(id: string) {
    try {
      const qs = station !== 'ALL' ? `?station=${station}` : '';
      setTickets(await api.post<KdsTicket[]>(`/kds/orders/${id}/bump${qs}`, {}));
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  // Apply the station filter at the item level, and drop any ticket left
  // with nothing to show for this station (bumped/served here, or never had
  // anything here to begin with) — each screen only ever shows its own work.
  // A READY-but-not-yet-bumped ticket must stay visible (green, with a bump
  // button) — only bumping (kotStatus -> SERVED) should remove it.
  const visibleTickets = tickets
    .map((t) => ({
      ...t,
      items: station === 'ALL' ? t.items : t.items.filter((i) => i.station === station),
    }))
    .filter((t) => t.items.length > 0 && t.items.some((i) => i.kotStatus !== 'SERVED'));

  const processing = visibleTickets.filter((t) => t.status === 'SENT_TO_KITCHEN');
  const ready = visibleTickets.filter((t) => t.status === 'READY');

  const textCls = large ? 'text-base' : 'text-sm';
  const titleCls = large ? 'text-xl' : 'text-lg';

  return (
    <div className="flex h-full flex-col bg-[#1A1A1A] text-white">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#111] px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">👨‍🍳</span>
          <span className="font-bold tracking-wide">KITCHEN DISPLAY</span>
        </div>

        {/* station filter — big, thumb-friendly pills */}
        <div className="flex items-center gap-1.5 rounded-lg bg-white/5 p-1">
          {([['ALL', 'All stations'], ['KITCHEN', '🍳 Kitchen'], ['BAR', '🍹 Bar']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => chooseStation(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${station === key ? 'bg-[#2ECC71] text-black' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-sm">
          <button onClick={toggleLarge} title="Large text mode" className={`rounded-md px-2 py-1.5 text-xs font-bold ${large ? 'bg-[#2ECC71] text-black' : 'bg-white/5 text-white/50 hover:text-white'}`}>
            {large ? 'A+ ON' : 'A+ text'}
          </button>
          <button onClick={toggleMuted} title="Mute new-ticket sound" className={`rounded-md px-2 py-1.5 text-xs font-bold ${muted ? 'bg-white/5 text-white/40' : 'bg-white/5 text-white/70 hover:text-white'}`}>
            {muted ? '🔇 Muted' : '🔔 Sound on'}
          </button>
          <span className="text-white/50">{visibleTickets.length} active</span>
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
      {visibleTickets.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-white/30">
          <div className="text-center">
            <div className="mb-2 text-5xl">🍳</div>
            <p>{station === 'ALL' ? 'No active kitchen tickets. Fire a KOT from the POS.' : `Nothing for ${station === 'KITCHEN' ? 'the kitchen' : 'the bar'} right now.`}</p>
          </div>
        </div>
      ) : (
        <div className={`grid flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3 ${large ? '' : 'xl:grid-cols-4'}`}>
          {visibleTickets.map((t) => {
            const u = urgency(t.firedAt, now);
            return (
              <div key={t.id} className={`flex flex-col overflow-hidden rounded-xl border-2 ${u.ring} ${u.flash}`}>
                <div className={`flex items-center justify-between px-3 py-2 text-black ${u.head}`}>
                  <span className={`font-bold ${titleCls}`}>#{t.number} · {t.table ?? t.type.replace('_', ' ')}</span>
                  <span className={`font-mono font-bold tabular-nums ${titleCls}`}>{u.label}</span>
                </div>
                <div className="flex-1 space-y-1.5 p-3">
                  {t.items.map((it) => {
                    const mods = Array.isArray(it.modifiers) ? it.modifiers : [];
                    const done = it.kotStatus === 'READY' || it.kotStatus === 'SERVED';
                    return (
                      <div key={it.id} className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 ${textCls} ${done ? 'bg-[#2ECC71]/15 text-white/40' : 'bg-white/5'}`}>
                        <button
                          onClick={() => (done ? itemUndo(it.id) : itemReady(it.id))}
                          disabled={busyId === it.id}
                          className={`flex-1 text-left disabled:opacity-50 ${done ? 'line-through' : ''}`}
                          title={done ? 'Tap to undo' : 'Tap when ready'}
                        >
                          <span className={`font-bold text-[#2ECC71] ${large ? 'text-lg' : ''}`}>{it.quantity}×</span> {it.name}
                          {mods.length > 0 && <span className="block text-[11px] text-white/40">— {mods.map((m) => m.name).join(', ')}</span>}
                          {it.notes && <span className="block text-[11px] text-amber-300">✎ {it.notes}</span>}
                        </button>
                        {done ? (
                          <span className="shrink-0 text-[#2ECC71]">✓ tap to undo</span>
                        ) : (
                          it.menuItemId && (
                            <button
                              onClick={(e) => { e.stopPropagation(); markOutOfStock(it); }}
                              title="Mark this item out of stock (hides it from the POS)"
                              className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300 hover:bg-red-500/25"
                            >
                              86
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => bump(t.id)} className={`border-t border-white/10 bg-white/5 py-2 font-bold text-white/80 hover:bg-[#2ECC71] hover:text-black ${textCls}`}>
                  ✓ {station === 'ALL' ? 'BUMP' : `BUMP MINE (${station})`}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

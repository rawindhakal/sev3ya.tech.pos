'use client';

// Interactive drag-drop floor plan (matrix #26). Tables are absolutely
// positioned within their area canvas; in edit mode they can be dragged and
// the layout saved. Live status colors mirror the grid view.
import { useEffect, useRef, useState } from 'react';
import { api, formatMoney } from '@/lib/api';
import type { RestaurantTable, TableArea, TableStatus } from '@/lib/types';

const STATUS_BG: Record<TableStatus, string> = {
  AVAILABLE: 'bg-green-100 border-green-400 text-green-800',
  OCCUPIED: 'bg-amber-100 border-amber-400 text-amber-800',
  RESERVED: 'bg-indigo-100 border-indigo-400 text-indigo-800',
  CLEANING: 'bg-slate-200 border-slate-400 text-slate-600',
};

const TILE = 84;
const CANVAS_H = 360;

export default function FloorPlan({
  areas,
  onTableClick,
}: {
  areas: TableArea[];
  onTableClick?: (t: RestaurantTable) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  // Seed positions from server; auto-place tables that have none yet.
  useEffect(() => {
    setPos((prev) => {
      const next = { ...prev };
      for (const area of areas) {
        area.tables.forEach((t, i) => {
          if (next[t.id]) return;
          if (t.posX != null && t.posY != null) next[t.id] = { x: t.posX, y: t.posY };
          else next[t.id] = { x: 20 + (i % 6) * (TILE + 16), y: 20 + Math.floor(i / 6) * (TILE + 16) };
        });
      }
      return next;
    });
  }, [areas]);

  function onPointerDown(e: React.PointerEvent, id: string) {
    if (!edit) return;
    const p = pos[id] ?? { x: 0, y: 0 };
    drag.current = { id, dx: e.clientX - p.x, dy: e.clientY - p.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const { id, dx, dy } = drag.current;
    const x = Math.max(0, Math.min(e.clientX - dx, 900));
    const y = Math.max(0, Math.min(e.clientY - dy, CANVAS_H - TILE));
    setPos((prev) => ({ ...prev, [id]: { x, y } }));
    setDirty(true);
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function saveLayout() {
    setSaving(true);
    try {
      const positions = Object.entries(pos).map(([id, p]) => ({
        id,
        posX: Math.round(p.x),
        posY: Math.round(p.y),
      }));
      await api.post('/tables/layout', { positions });
      setDirty(false);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-2">
        {edit && dirty && (
          <button className="btn-primary text-xs" disabled={saving} onClick={saveLayout}>
            {saving ? 'Saving…' : 'Save layout'}
          </button>
        )}
        <button
          className={`text-xs ${edit ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setEdit((v) => !v)}
        >
          {edit ? '✓ Done editing' : '✎ Edit layout'}
        </button>
      </div>

      {areas.map((area) => (
        <div key={area.area} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{area.area}</h2>
          <div
            className="relative overflow-hidden rounded-xl border border-slate-200 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px]"
            style={{ height: CANVAS_H }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {area.tables.map((t) => {
              const p = pos[t.id] ?? { x: 0, y: 0 };
              return (
                <button
                  key={t.id}
                  onPointerDown={(e) => onPointerDown(e, t.id)}
                  onClick={() => !edit && onTableClick?.(t)}
                  className={`absolute flex flex-col items-center justify-center rounded-xl border-2 text-center shadow-sm ${STATUS_BG[t.status]} ${edit ? 'cursor-move' : 'cursor-pointer'}`}
                  style={{ left: p.x, top: p.y, width: TILE, height: TILE, touchAction: 'none' }}
                >
                  {t.isVip && <span className="absolute right-1 top-1 text-[10px]">⭐</span>}
                  <span className="text-sm font-bold">{t.name}</span>
                  <span className="text-[10px] opacity-70">{t.seats} seats</span>
                  {t.activeOrder && (
                    <span className="text-[10px] font-semibold">{formatMoney(t.activeOrder.totalCents)}</span>
                  )}
                </button>
              );
            })}
            {area.tables.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-slate-300">No tables in this area</div>
            )}
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-400">
        {edit ? 'Drag tables to arrange the layout, then Save.' : 'Click a table to manage it. Toggle Edit layout to rearrange.'}
      </p>
    </div>
  );
}

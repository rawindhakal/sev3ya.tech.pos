'use client';

// A printable, downloadable table QR card — generated entirely client-side
// (the `qrcode` package renders straight to a <canvas>, no third-party image
// service and no network call) so it works offline and isn't dependent on
// an external site staying up. Print isolates just this card (not the whole
// POS page) via a scoped print stylesheet; Download exports the same canvas
// as a PNG.
import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { notify } from '@/lib/dialog';

export default function TableQrCard({
  url,
  tableName,
  tableArea,
  restaurantName,
}: {
  url: string;
  tableName: string;
  tableArea?: string | null;
  restaurantName?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 240, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } }).catch(() => {});
  }, [url]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `table-qr-${tableName.replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #qr-print-card, #qr-print-card * { visibility: visible; }
          #qr-print-card { position: fixed; inset: 0; margin: auto; display: flex !important;
            align-items: center; justify-content: center; }
        }
      `}</style>
      <div id="qr-print-card" className="mx-auto flex max-w-xs flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm print:border-0 print:shadow-none">
        {restaurantName && <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{restaurantName}</p>}
        <canvas ref={canvasRef} className="rounded-lg" />
        <div>
          <p className="text-lg font-bold text-slate-900">{tableName}{tableArea ? ` · ${tableArea}` : ''}</p>
          <p className="mt-1 text-sm text-slate-500">Scan to view the menu and order</p>
        </div>
      </div>
      <p className="break-all text-center font-mono text-xs text-slate-400">{url}</p>
      <div className="flex justify-center gap-2">
        <button type="button" className="btn-ghost" onClick={() => { navigator.clipboard?.writeText(url); notify('Link copied', 'success'); }}>Copy link</button>
        <button type="button" className="btn-ghost" onClick={download}>⬇ Download PNG</button>
        <button type="button" className="btn-primary" onClick={() => window.print()}>Print</button>
      </div>
    </div>
  );
}

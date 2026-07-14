// Dependency-free "Export to PDF": renders the report into a clean printable
// document in a hidden iframe and opens the print dialog — every OS offers
// "Save as PDF" there, and on tills with a printer it doubles as Print.

import { formatBsLong } from './bs-date';

export interface PdfColumn { key: string; label: string; type: 'text' | 'money' | 'number' }

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function exportPdf(opts: {
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: Record<string, string | number | null | undefined>[];
  restaurantName?: string;
  totalsRow?: boolean;
  currency?: string;
}) {
  const cur = opts.currency ?? 'Rs';
  const fmt = (c: PdfColumn, v: string | number | null | undefined) =>
    c.type === 'money' ? (v ? `${cur} ${(Number(v) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—') : esc(v);

  const totals = opts.totalsRow !== false
    ? opts.columns.map((c, i) => {
        if (i === 0) return '<td class="t">Totals</td>';
        if (c.type !== 'money') return '<td class="t"></td>';
        const sum = opts.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
        return `<td class="t r">${fmt(c, sum)}</td>`;
      }).join('')
    : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title><style>
    @page { margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .sub { color: #64748b; font-size: 11px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #64748b;
         border-bottom: 1.5px solid #0f172a; padding: 5px 6px; }
    td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; }
    .r { text-align: right; font-variant-numeric: tabular-nums; }
    tr:nth-child(even) td { background: #f8fafc; }
    .t { font-weight: 700; border-top: 1.5px solid #0f172a; border-bottom: none; background: #fff !important; }
    .foot { margin-top: 14px; color: #94a3b8; font-size: 10px; }
  </style></head><body>
    <h1>${esc(opts.restaurantName ?? 's3vyaPOS')} — ${esc(opts.title)}</h1>
    <div class="sub">${esc(opts.subtitle ?? '')} · Generated ${new Date().toLocaleString()} · ${formatBsLong(new Date())} BS</div>
    <table>
      <thead><tr>${opts.columns.map((c) => `<th class="${c.type === 'text' ? '' : 'r'}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>
        ${opts.rows.map((r) => `<tr>${opts.columns.map((c) => `<td class="${c.type === 'text' ? '' : 'r'}">${fmt(c, r[c.key])}</td>`).join('')}</tr>`).join('')}
        ${totals ? `<tr>${totals}</tr>` : ''}
      </tbody>
    </table>
    <div class="foot">s3vyaPOS · ${opts.rows.length} row(s)</div>
  </body></html>`;

  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  frame.contentWindow!.onafterprint = () => frame.remove();
  setTimeout(() => frame.contentWindow!.print(), 150);
  setTimeout(() => frame.parentNode && frame.remove(), 60000);
}

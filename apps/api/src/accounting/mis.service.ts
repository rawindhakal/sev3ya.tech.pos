import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from './journal.service';
import { adToBs, formatBs, fyRangeAd, BS_MONTH_NAMES } from '../common/bs-date';

// MIS / statutory reports (RestroX-style). Every report returns one uniform
// shape — { title, columns, rows, note? } — so the frontend renders and
// CSV-exports them all with a single generic component.
// column.type: 'text' | 'money' (cents) | 'number'

export interface MisColumn { key: string; label: string; type: 'text' | 'money' | 'number' }
export interface MisReport {
  title: string;
  columns: MisColumn[];
  rows: Record<string, string | number | null>[];
  note?: string;
}

const BANK_METHODS = ['BANK', 'CARD', 'FONEPAY', 'ESEWA', 'KHALTI'];
// Nepali FY months in order: Shrawan(4) … Chaitra(12), Baisakh(1) … Ashadh(3)
const FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

function range(from?: string, to?: string) {
  const start = from ? new Date(from) : new Date(Date.now() - 30 * 864e5);
  const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
  return { start, end };
}

// AD window generously covering BS fiscal year fy (Shrawan fy → Ashadh fy+1).
function fyAdWindow(fy: number) {
  const { start, end } = fyRangeAd(fy); // exact Shrawan 1 → Ashadh end
  return { gte: start, lte: end };
}
// Bucket index (0-11) of a date within fiscal year fy, or -1 if outside.
function fyBucket(fy: number, d: Date): number {
  const b = adToBs(d);
  const idx = FY_MONTHS.indexOf(b.month);
  if (idx < 0) return -1;
  const wantYear = b.month >= 4 ? fy : fy + 1;
  return b.year === wantYear ? idx : -1;
}

@Injectable()
export class MisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
  ) {}

  // ── Accounting: Account Summary (general ledger) ──
  async accountSummary(from?: string, to?: string): Promise<MisReport> {
    const { start } = range(from, to);
    const dayBefore = new Date(start.getTime() - 864e5).toISOString().slice(0, 10);
    const accounts = await this.journal.accounts();
    const rows = [] as MisReport['rows'];
    let sn = 0;
    for (const a of accounts) {
      const [opening, period] = await Promise.all([
        this.journal.ledger(a.id, '1970-01-02', dayBefore),
        this.journal.ledger(a.id, from, to),
      ]);
      if (!opening.totals.closingCents && !period.rows.length) continue;
      rows.push({
        sn: ++sn,
        account: `${a.code} · ${a.name}`,
        group: a.group ?? '',
        openingCents: opening.totals.closingCents,
        drCents: period.totals.drCents,
        crCents: period.totals.crCents,
        closingCents: opening.totals.closingCents +
          (['ASSET', 'EXPENSE'].includes(a.type)
            ? period.totals.drCents - period.totals.crCents
            : period.totals.crCents - period.totals.drCents),
      });
    }
    return {
      title: 'Account Summary',
      columns: [
        { key: 'sn', label: 'SN', type: 'number' },
        { key: 'account', label: 'Code / Account', type: 'text' },
        { key: 'group', label: 'Group', type: 'text' },
        { key: 'openingCents', label: 'OP. Balance', type: 'money' },
        { key: 'drCents', label: 'TXN Debit', type: 'money' },
        { key: 'crCents', label: 'TXN Credit', type: 'money' },
        { key: 'closingCents', label: 'CL. Balance', type: 'money' },
      ],
      rows,
      note: 'System accounts include live POS activity; others reflect manual journal vouchers.',
    };
  }

  // ── Tax (Nepal): VAT Summary — BS fiscal-month matrix ──
  async vatSummary(fy: number): Promise<MisReport> {
    const win = fyAdWindow(fy);
    const [orders, refunds, pos] = await Promise.all([
      this.prisma.order.findMany({ where: { status: 'PAID', paidAt: win }, select: { paidAt: true, totalCents: true, taxCents: true } }),
      this.prisma.order.findMany({ where: { refundCents: { gt: 0 }, refundedAt: win }, select: { refundedAt: true, refundCents: true } }),
      this.prisma.purchaseOrder.findMany({ where: { status: 'RECEIVED', receivedAt: win }, include: { lines: true } }),
    ]);
    const zero = () => Array(12).fill(0) as number[];
    const taxableSales = zero(), vatSales = zero(), salesReturns = zero(), vatReturns = zero(), purchases = zero();
    for (const o of orders) {
      const i = fyBucket(fy, o.paidAt!); if (i < 0) continue;
      taxableSales[i] += o.totalCents - o.taxCents;
      vatSales[i] += o.taxCents;
    }
    for (const r of refunds) {
      const i = fyBucket(fy, r.refundedAt!); if (i < 0) continue;
      const net = Math.round(r.refundCents / 1.13);
      salesReturns[i] += net;
      vatReturns[i] += r.refundCents - net;
    }
    for (const p of pos) {
      const i = fyBucket(fy, p.receivedAt!); if (i < 0) continue;
      purchases[i] += p.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitCostCents), 0);
    }
    const NP_MONTHS = ['साउन', 'भदौ', 'असोज', 'कात्तिक', 'मंसिर', 'पौष', 'माघ', 'फागुन', 'चैत', 'वैशाख', 'जेठ', 'असार'];
    const mk = (label: string, vals: number[]) =>
      ({ head: label, ...Object.fromEntries(vals.map((v, i) => [`m${i}`, v])), totalCents: vals.reduce((a, b) => a + b, 0) });
    return {
      title: `VAT Summary — FY ${fy}/${(fy + 1) % 100}`,
      columns: [
        { key: 'head', label: 'मिति', type: 'text' },
        ...NP_MONTHS.map((m, i) => ({ key: `m${i}`, label: m, type: 'money' as const })),
        { key: 'totalCents', label: 'जम्मा', type: 'money' },
      ],
      rows: [
        mk('करयोग्य बिक्री (Taxable Sales)', taxableSales),
        mk('करयोग्य बिक्रीको कर (VAT on Sales)', vatSales),
        mk('करयोग्य फिर्ता (Sales Returns)', salesReturns),
        mk('फिर्ताको कर (VAT on Returns)', vatReturns),
        mk('करयोग्य खरीद (Purchases)', purchases),
        mk('खरीदको कर (VAT on Purchases)', zero()),
      ],
      note: 'Purchase VAT is 0 — purchase orders do not carry VAT yet. Sales figures from paid invoices, bucketed by BS month.',
    };
  }

  // ── Sales: Daily Sales Summary (per-day collections) ──
  async dailySales(from?: string, to?: string): Promise<MisReport> {
    const { start, end } = range(from, to);
    const payments = await this.prisma.payment.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { createdAt: true, method: true, amountCents: true },
    });
    const days = new Map<string, { cash: number; bank: number; credit: number }>();
    for (const p of payments) {
      const key = p.createdAt.toISOString().slice(0, 10);
      const d = days.get(key) ?? { cash: 0, bank: 0, credit: 0 };
      if (p.method === 'CASH' || p.method === 'OFFLINE') d.cash += p.amountCents;
      else if (p.method === 'CREDIT') d.credit += p.amountCents;
      else d.bank += p.amountCents;
      days.set(key, d);
    }
    const rows = [...days.entries()].sort().map(([date, d], i) => ({
      sn: i + 1,
      date,
      dateBs: formatBs(new Date(`${date}T12:00:00`)),
      cashCents: d.cash,
      bankCents: d.bank,
      creditCents: d.credit,
      totalCents: d.cash + d.bank + d.credit,
    }));
    return {
      title: 'Daily Sales Summary',
      columns: [
        { key: 'sn', label: 'SN', type: 'number' },
        { key: 'date', label: 'Date (AD)', type: 'text' },
        { key: 'dateBs', label: 'Date (BS)', type: 'text' },
        { key: 'cashCents', label: 'Counter (Cash)', type: 'money' },
        { key: 'bankCents', label: 'Bank & Wallets', type: 'money' },
        { key: 'creditCents', label: 'Credit', type: 'money' },
        { key: 'totalCents', label: 'Total', type: 'money' },
      ],
      rows,
    };
  }

  // ── Sales: Collection report (per-day × tender matrix) ──
  async collections(from?: string, to?: string): Promise<MisReport> {
    const { start, end } = range(from, to);
    const payments = await this.prisma.payment.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { createdAt: true, method: true, amountCents: true },
    });
    const methods = ['CASH', ...BANK_METHODS, 'CREDIT', 'OFFLINE'];
    const days = new Map<string, Record<string, number>>();
    for (const p of payments) {
      const key = p.createdAt.toISOString().slice(0, 10);
      const d = days.get(key) ?? {};
      d[p.method] = (d[p.method] ?? 0) + p.amountCents;
      days.set(key, d);
    }
    const rows = [...days.entries()].sort().map(([date, d]) => ({
      date,
      dateBs: formatBs(new Date(`${date}T12:00:00`)),
      ...Object.fromEntries(methods.map((m) => [m, d[m] ?? 0])),
      totalCents: Object.values(d).reduce((a, b) => a + b, 0),
    }));
    return {
      title: 'Sales Collection Report',
      columns: [
        { key: 'dateBs', label: 'Date (BS)', type: 'text' },
        ...methods.map((m) => ({ key: m, label: m, type: 'money' as const })),
        { key: 'totalCents', label: 'Total', type: 'money' },
      ],
      rows,
    };
  }

  // ── Sales: Monthly matrix by item / category / customer ──
  async monthlySales(groupBy: 'item' | 'category' | 'customer', fy: number): Promise<MisReport> {
    const win = fyAdWindow(fy);
    const buckets = new Map<string, number[]>();
    const bump = (name: string, i: number, v: number) => {
      const arr = buckets.get(name) ?? Array(12).fill(0);
      arr[i] += v;
      buckets.set(name, arr);
    };
    if (groupBy === 'customer') {
      const orders = await this.prisma.order.findMany({
        where: { status: 'PAID', paidAt: win },
        select: { paidAt: true, totalCents: true, customerName: true },
      });
      for (const o of orders) {
        const i = fyBucket(fy, o.paidAt!); if (i < 0) continue;
        bump(o.customerName?.trim() || 'Walk-in / Cash', i, o.totalCents);
      }
    } else {
      const items = await this.prisma.orderItem.findMany({
        where: { cancelledAt: null, order: { status: 'PAID', paidAt: win } },
        select: {
          quantity: true, unitPriceCents: true, nameSnapshot: true,
          menuItem: { select: { category: { select: { name: true } } } },
          order: { select: { paidAt: true } },
        },
      });
      for (const it of items) {
        const i = fyBucket(fy, it.order.paidAt!); if (i < 0) continue;
        const name = groupBy === 'item' ? it.nameSnapshot : it.menuItem?.category?.name ?? 'Uncategorised';
        bump(name, i, it.unitPriceCents * it.quantity);
      }
    }
    const rows = [...buckets.entries()]
      .map(([name, vals]) => ({
        name,
        ...Object.fromEntries(vals.map((v, i) => [`m${i}`, v])),
        totalCents: vals.reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => (b.totalCents as number) - (a.totalCents as number));
    const label = groupBy === 'item' ? 'Dish' : groupBy === 'category' ? 'Category' : 'Customer';
    return {
      title: `${label} Monthly Sales — FY ${fy}/${(fy + 1) % 100}`,
      columns: [
        { key: 'name', label, type: 'text' },
        ...BS_MONTH_NAMES.slice(3).concat(BS_MONTH_NAMES.slice(0, 3)).map((m, i) => ({ key: `m${i}`, label: m, type: 'money' as const })),
        { key: 'totalCents', label: 'Total', type: 'money' },
      ],
      rows,
    };
  }

  // ── Tax: Sales Return Register (refunds) ──
  async salesReturns(from?: string, to?: string): Promise<MisReport> {
    const { start, end } = range(from, to);
    const orders = await this.prisma.order.findMany({
      where: { refundCents: { gt: 0 }, refundedAt: { gte: start, lte: end } },
      orderBy: { refundedAt: 'asc' },
      select: { number: true, refundedAt: true, refundCents: true, refundReason: true, customerName: true, totalCents: true },
    });
    return {
      title: 'Sales Return Register',
      columns: [
        { key: 'dateBs', label: 'Date (BS)', type: 'text' },
        { key: 'invoice', label: 'Ref Invoice', type: 'text' },
        { key: 'party', label: 'Party', type: 'text' },
        { key: 'invoiceCents', label: 'Invoice Total', type: 'money' },
        { key: 'refundCents', label: 'Refunded', type: 'money' },
        { key: 'reason', label: 'Reason', type: 'text' },
      ],
      rows: orders.map((o) => ({
        dateBs: formatBs(o.refundedAt!),
        invoice: `#${o.number}`,
        party: o.customerName ?? 'Cash Sale',
        invoiceCents: o.totalCents,
        refundCents: o.refundCents,
        reason: o.refundReason ?? '',
      })),
    };
  }

  // ── Receivable & Payable: Party Balance ──
  async partyBalances(): Promise<MisReport> {
    const [debtors, pos] = await Promise.all([
      this.prisma.customer.findMany({ where: { creditBalanceCents: { gt: 0 } }, orderBy: { creditBalanceCents: 'desc' } }),
      this.prisma.purchaseOrder.findMany({ where: { status: 'RECEIVED' }, include: { supplier: { select: { name: true } }, lines: true } }),
    ]);
    const payable = new Map<string, number>();
    for (const p of pos) {
      const amt = p.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitCostCents), 0);
      payable.set(p.supplier.name, (payable.get(p.supplier.name) ?? 0) + amt);
    }
    const rows = [
      ...debtors.map((c) => ({ party: c.name, contact: c.phone, kind: 'RECEIVABLE', receivableCents: c.creditBalanceCents, payableCents: 0 })),
      ...[...payable.entries()].map(([name, amt]) => ({ party: name, contact: '', kind: 'PAYABLE', receivableCents: 0, payableCents: amt })),
    ];
    return {
      title: 'Party Balance Report',
      columns: [
        { key: 'party', label: 'Party', type: 'text' },
        { key: 'contact', label: 'Contact', type: 'text' },
        { key: 'kind', label: 'Type', type: 'text' },
        { key: 'receivableCents', label: 'Receivable (Dr)', type: 'money' },
        { key: 'payableCents', label: 'Payable (Cr)', type: 'money' },
      ],
      rows,
      note: 'Receivables from the customer credit facility; payables from received purchase orders.',
    };
  }

  // ── Sales: line-level detail with filters + grouping ──
  // Powers the Sales Report screen: Detailed / KOT (kitchen) / BOT (bar)
  // presets, and grouping by item / category / payment method / day.
  async salesDetail(q: {
    from?: string; to?: string;
    categoryId?: string; itemId?: string;
    method?: string; type?: string; station?: string;
    groupBy?: 'detail' | 'item' | 'category' | 'method' | 'day';
  }): Promise<MisReport & { kpis: Record<string, number> }> {
    const { start, end } = range(q.from, q.to);
    const lines = await this.prisma.orderItem.findMany({
      where: {
        cancelledAt: null,
        ...(q.station ? { station: q.station as any } : {}),
        ...(q.itemId ? { menuItemId: q.itemId } : {}),
        ...(q.categoryId ? { menuItem: { categoryId: q.categoryId } } : {}),
        order: {
          status: 'PAID',
          paidAt: { gte: start, lte: end },
          ...(q.type ? { type: q.type as any } : {}),
          ...(q.method ? { payments: { some: { method: q.method as any } } } : {}),
        },
      },
      include: {
        menuItem: { select: { category: { select: { id: true, name: true } } } },
        order: {
          select: {
            number: true, paidAt: true, type: true, customerName: true,
            payments: { select: { method: true, amountCents: true } },
          },
        },
      },
      orderBy: { order: { paidAt: 'asc' } },
    });

    const flat = lines.map((l) => {
      const mods = Array.isArray(l.modifiers) ? (l.modifiers as any[]) : [];
      const modCents = mods.reduce((s, m) => s + (m?.priceCents ?? 0), 0);
      const gross = (l.unitPriceCents + modCents) * l.quantity - (l.discountCents ?? 0);
      return {
        invoice: l.order.number,
        at: l.order.paidAt!,
        item: l.nameSnapshot,
        category: l.menuItem?.category?.name ?? 'Open item',
        station: l.station,
        qty: l.quantity,
        unitCents: l.unitPriceCents + modCents,
        discountCents: l.discountCents ?? 0,
        grossCents: gross,
        type: l.order.type,
        party: l.order.customerName ?? '',
        tenders: l.order.payments.map((p) => p.method).join('+') || '—',
      };
    });

    const kpis = {
      lines: flat.length,
      qty: flat.reduce((s, r) => s + r.qty, 0),
      grossCents: flat.reduce((s, r) => s + r.grossCents, 0),
      discountCents: flat.reduce((s, r) => s + r.discountCents, 0),
      invoices: new Set(flat.map((r) => r.invoice)).size,
    };

    const money = (k: string, l: string) => ({ key: k, label: l, type: 'money' as const });
    const text = (k: string, l: string) => ({ key: k, label: l, type: 'text' as const });
    const num = (k: string, l: string) => ({ key: k, label: l, type: 'number' as const });

    const groupBy = q.groupBy ?? 'detail';
    if (groupBy === 'detail') {
      return {
        title: 'Detailed Sales Report',
        columns: [
          text('dateBs', 'Date (BS)'), text('invoice', 'Invoice'), text('item', 'Item'),
          text('category', 'Category'), text('station', 'Station'), num('qty', 'Qty'),
          money('unitCents', 'Rate'), money('discountCents', 'Disc'), money('grossCents', 'Amount'),
          text('type', 'Type'), text('tenders', 'Tender'),
        ],
        rows: flat.map((r) => ({ ...r, dateBs: formatBs(r.at), invoice: `#${r.invoice}`, at: undefined } as any)),
        kpis,
      };
    }

    // Aggregated groupings share one shape: name / qty / amount (+share %).
    const keyOf = (r: (typeof flat)[number]) =>
      groupBy === 'item' ? r.item
      : groupBy === 'category' ? r.category
      : groupBy === 'method' ? r.tenders
      : formatBs(r.at); // day
    const agg = new Map<string, { qty: number; grossCents: number; invoices: Set<number> }>();
    for (const r of flat) {
      const k = keyOf(r);
      const a = agg.get(k) ?? { qty: 0, grossCents: 0, invoices: new Set<number>() };
      a.qty += r.qty; a.grossCents += r.grossCents; a.invoices.add(r.invoice);
      agg.set(k, a);
    }
    const label = groupBy === 'item' ? 'Item' : groupBy === 'category' ? 'Category' : groupBy === 'method' ? 'Payment method' : 'Date (BS)';
    const rows = [...agg.entries()]
      .map(([name, a]) => ({
        name, qty: a.qty, invoices: a.invoices.size, grossCents: a.grossCents,
        sharePct: kpis.grossCents ? Math.round((a.grossCents / kpis.grossCents) * 1000) / 10 : 0,
      }))
      .sort((a, b) => (groupBy === 'day' ? a.name.localeCompare(b.name) : b.grossCents - a.grossCents));
    return {
      title: `Sales by ${label}`,
      columns: [text('name', label), num('qty', 'Qty'), num('invoices', 'Invoices'), money('grossCents', 'Amount'), num('sharePct', 'Share %')],
      rows,
      kpis,
    };
  }

  // ── Inventory: Stock Item Ledger Summary ──
  async stockLedger(from?: string, to?: string): Promise<MisReport> {
    const { start, end } = range(from, to);
    const [ingredients, movements] = await Promise.all([
      this.prisma.ingredient.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.stockMovement.findMany({ where: { createdAt: { gte: start } }, select: { ingredientId: true, quantity: true, createdAt: true } }),
    ]);
    const rows = ingredients.map((ing) => {
      const mine = movements.filter((m) => m.ingredientId === ing.id);
      const inRange = mine.filter((m) => m.createdAt <= end);
      const afterEnd = mine.filter((m) => m.createdAt > end);
      const inQty = inRange.filter((m) => m.quantity > 0).reduce((s, m) => s + m.quantity, 0);
      const outQty = inRange.filter((m) => m.quantity < 0).reduce((s, m) => s + m.quantity, 0);
      const closing = ing.stockQty - afterEnd.reduce((s, m) => s + m.quantity, 0);
      const opening = closing - inQty - outQty;
      return {
        item: ing.name,
        unit: ing.unit,
        opening: Math.round(opening * 100) / 100,
        inQty: Math.round(inQty * 100) / 100,
        outQty: Math.round(-outQty * 100) / 100,
        closing: Math.round(closing * 100) / 100,
        valueCents: Math.round(closing * ing.costPerUnitCents),
      };
    });
    return {
      title: 'Stock Item Ledger Summary',
      columns: [
        { key: 'item', label: 'Stock Item', type: 'text' },
        { key: 'unit', label: 'Unit', type: 'text' },
        { key: 'opening', label: 'Opening', type: 'number' },
        { key: 'inQty', label: 'Stock In', type: 'number' },
        { key: 'outQty', label: 'Stock Out', type: 'number' },
        { key: 'closing', label: 'Closing', type: 'number' },
        { key: 'valueCents', label: 'Closing Value', type: 'money' },
      ],
      rows,
    };
  }
}

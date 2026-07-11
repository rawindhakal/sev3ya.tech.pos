import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatBs } from '../common/bs-date';

// Accounting books (Tally / Busy-style), derived live from operational data —
// every sale, purchase, expense, drawer movement and credit entry is already
// captured, so the books are always in balance with the floor.
//
// Books: Day Book, Sales Book, Purchase Register, Cash Book, Bank Book,
// Balance Sheet (P&L lives in FinanceService).

const BANK_METHODS = ['BANK', 'CARD', 'FONEPAY', 'ESEWA', 'KHALTI'] as const;

function range(from?: string, to?: string) {
  const start = from ? new Date(from) : new Date(Date.now() - 30 * 864e5);
  const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
  return { start, end };
}

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Sales Book ───────────────────────────────────────
  async salesBook(from?: string, to?: string) {
    const { start, end } = range(from, to);
    const orders = await this.prisma.order.findMany({
      where: { status: 'PAID', paidAt: { gte: start, lte: end } },
      orderBy: { paidAt: 'asc' },
      include: { payments: true },
    });
    const rows = orders.map((o) => ({
      dateAd: o.paidAt,
      dateBs: o.paidAt ? formatBs(o.paidAt) : null,
      invoice: o.number,
      party: o.customerName ?? 'Cash Sale',
      type: o.type,
      netCents: o.totalCents - o.taxCents,
      vatCents: o.taxCents,
      totalCents: o.totalCents,
      tenders: o.payments.map((p) => `${p.method} ${(p.amountCents / 100).toFixed(2)}`).join(' + '),
    }));
    return {
      range: { from: start, to: end },
      rows,
      totals: {
        count: rows.length,
        netCents: rows.reduce((s, r) => s + r.netCents, 0),
        vatCents: rows.reduce((s, r) => s + r.vatCents, 0),
        totalCents: rows.reduce((s, r) => s + r.totalCents, 0),
      },
    };
  }

  // ── Purchase Register ────────────────────────────────
  async purchaseRegister(from?: string, to?: string) {
    const { start, end } = range(from, to);
    const pos = await this.prisma.purchaseOrder.findMany({
      where: {
        status: { not: 'DRAFT' },
        OR: [
          { receivedAt: { gte: start, lte: end } },
          { receivedAt: null, orderedAt: { gte: start, lte: end } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: { supplier: { select: { name: true } }, lines: true },
    });
    const rows = pos.map((p) => {
      const when = p.receivedAt ?? p.orderedAt ?? p.createdAt;
      return {
        dateAd: when,
        dateBs: formatBs(when),
        number: p.number,
        supplier: p.supplier.name,
        status: p.status,
        items: p.lines.length,
        amountCents: p.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitCostCents), 0),
      };
    });
    return {
      range: { from: start, to: end },
      rows,
      totals: { count: rows.length, amountCents: rows.reduce((s, r) => s + r.amountCents, 0) },
    };
  }

  // ── Cash Book (receipts / payments with running balance) ──
  async cashBook(from?: string, to?: string) {
    const { start, end } = range(from, to);
    const window = { gte: start, lte: end };
    const [cashPayments, movements, expenses] = await Promise.all([
      this.prisma.payment.findMany({
        where: { method: 'CASH', createdAt: window },
        include: { order: { select: { number: true, customerName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.cashMovement.findMany({
        where: { createdAt: window, type: { in: ['PAY_IN', 'PAY_OUT'] } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.expense.findMany({ where: { incurredAt: window }, orderBy: { incurredAt: 'asc' } }),
    ]);
    const entries = [
      ...cashPayments.map((p) => ({
        at: p.createdAt,
        particulars: `Cash sale — invoice #${p.order.number}${p.order.customerName ? ` (${p.order.customerName})` : ''}`,
        receiptCents: p.amountCents,
        paymentCents: 0,
      })),
      ...movements.map((m) => ({
        at: m.createdAt,
        particulars: `${m.type === 'PAY_IN' ? 'Pay-in' : 'Pay-out'}${m.reason ? ` — ${m.reason}` : ''}`,
        receiptCents: m.type === 'PAY_IN' ? m.amountCents : 0,
        paymentCents: m.type === 'PAY_OUT' ? m.amountCents : 0,
      })),
      ...expenses.map((e) => ({
        at: e.incurredAt,
        particulars: `Expense — ${e.category}${e.description ? ` (${e.description})` : ''}`,
        receiptCents: 0,
        paymentCents: e.amountCents,
      })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());

    let bal = 0;
    const rows = entries.map((e) => {
      bal += e.receiptCents - e.paymentCents;
      return { ...e, dateBs: formatBs(e.at), balanceCents: bal };
    });
    return {
      range: { from: start, to: end },
      rows,
      totals: {
        receiptsCents: rows.reduce((s, r) => s + r.receiptCents, 0),
        paymentsCents: rows.reduce((s, r) => s + r.paymentCents, 0),
        netCents: bal,
      },
    };
  }

  // ── Bank Book (all non-cash tenders) ─────────────────
  async bankBook(from?: string, to?: string) {
    const { start, end } = range(from, to);
    const window = { gte: start, lte: end };
    const [payments, settlements] = await Promise.all([
      this.prisma.payment.findMany({
        where: { method: { in: BANK_METHODS as any }, createdAt: window },
        include: { order: { select: { number: true, customerName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.creditLedgerEntry.findMany({
        where: { type: 'PAYMENT', method: { in: BANK_METHODS as any }, createdAt: window },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const entries = [
      ...payments.map((p) => ({
        at: p.createdAt,
        method: p.method,
        particulars: `Sale — invoice #${p.order.number}${p.order.customerName ? ` (${p.order.customerName})` : ''}`,
        amountCents: p.amountCents,
      })),
      ...settlements.map((s) => ({
        at: s.createdAt,
        method: s.method!,
        particulars: `Credit settlement — ${s.customer.name}`,
        amountCents: s.amountCents,
      })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());

    let bal = 0;
    const rows = entries.map((e) => {
      bal += e.amountCents;
      return { ...e, dateBs: formatBs(e.at), balanceCents: bal };
    });
    const byMethod: Record<string, number> = {};
    for (const r of rows) byMethod[r.method] = (byMethod[r.method] ?? 0) + r.amountCents;
    return {
      range: { from: start, to: end },
      rows,
      totals: { receiptsCents: bal, byMethod },
    };
  }

  // ── Day Book (every transaction of one day, chronological) ──
  async dayBook(date?: string) {
    const day = date ? new Date(date) : new Date();
    const from = day.toISOString().slice(0, 10);
    const [sales, cash, bank, purchases] = await Promise.all([
      this.salesBook(from, from),
      this.cashBook(from, from),
      this.bankBook(from, from),
      this.purchaseRegister(from, from),
    ]);
    const entries = [
      ...sales.rows.map((r) => ({ at: r.dateAd!, kind: 'SALE', particulars: `Invoice #${r.invoice} — ${r.party} (${r.tenders})`, drCents: r.totalCents, crCents: 0 })),
      ...cash.rows.filter((r) => !r.particulars.startsWith('Cash sale')).map((r) => ({
        at: r.at, kind: r.receiptCents ? 'CASH IN' : 'CASH OUT',
        particulars: r.particulars, drCents: r.receiptCents, crCents: r.paymentCents,
      })),
      ...purchases.rows.map((r) => ({ at: r.dateAd, kind: 'PURCHASE', particulars: `PO #${r.number} — ${r.supplier} (${r.status})`, drCents: 0, crCents: r.amountCents })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return {
      dateAd: from,
      dateBs: formatBs(day),
      entries: entries.map((e) => ({ ...e, dateBs: formatBs(new Date(e.at)) })),
      totals: {
        salesCents: sales.totals.totalCents,
        cashReceiptsCents: cash.totals.receiptsCents,
        cashPaymentsCents: cash.totals.paymentsCents,
        bankReceiptsCents: bank.totals.receiptsCents,
        purchasesCents: purchases.totals.amountCents,
      },
    };
  }

  // ── Balance Sheet (derived from operations, as of a date) ──
  async balanceSheet(asOf?: string) {
    const upto = asOf ? new Date(`${asOf}T23:59:59.999`) : new Date();
    const window = { lte: upto };
    const [cashIn, payIn, payOut, expenses, bankIn, bankSettle, cashSettleAgg, ar, inv, apPos, vat] = await Promise.all([
      this.prisma.payment.aggregate({ _sum: { amountCents: true }, where: { method: 'CASH', createdAt: window } }),
      this.prisma.cashMovement.aggregate({ _sum: { amountCents: true }, where: { type: 'PAY_IN', createdAt: window } }),
      this.prisma.cashMovement.aggregate({ _sum: { amountCents: true }, where: { type: 'PAY_OUT', createdAt: window } }),
      this.prisma.expense.aggregate({ _sum: { amountCents: true }, where: { incurredAt: window } }),
      this.prisma.payment.aggregate({ _sum: { amountCents: true }, where: { method: { in: BANK_METHODS as any }, createdAt: window } }),
      this.prisma.creditLedgerEntry.aggregate({ _sum: { amountCents: true }, where: { type: 'PAYMENT', method: { in: BANK_METHODS as any }, createdAt: window } }),
      this.prisma.creditLedgerEntry.aggregate({ _sum: { amountCents: true }, where: { type: 'PAYMENT', method: 'CASH', createdAt: window } }),
      this.prisma.customer.aggregate({ _sum: { creditBalanceCents: true }, _count: true, where: { creditBalanceCents: { gt: 0 } } }),
      this.prisma.ingredient.findMany({ select: { stockQty: true, costPerUnitCents: true } }),
      this.prisma.purchaseOrder.findMany({ where: { status: 'RECEIVED', receivedAt: window }, include: { lines: true } }),
      this.prisma.order.aggregate({ _sum: { taxCents: true }, where: { status: 'PAID', paidAt: window } }),
    ]);
    const n = (v: unknown) => Number(v ?? 0);
    // Cash pay-ins already include cash credit settlements — don't double count.
    const cashInHand = n(cashIn._sum.amountCents) + n(payIn._sum.amountCents) - n(payOut._sum.amountCents) - n(expenses._sum.amountCents);
    const bankBalance = n(bankIn._sum.amountCents) + n(bankSettle._sum.amountCents);
    const receivables = n(ar._sum.creditBalanceCents);
    const inventory = Math.round(inv.reduce((s, i) => s + i.stockQty * i.costPerUnitCents, 0));
    const payables = apPos.reduce((s, p) => s + p.lines.reduce((x, l) => x + Math.round(l.quantity * l.unitCostCents), 0), 0);
    const vatPayable = n(vat._sum.taxCents);
    const totalAssets = cashInHand + bankBalance + receivables + inventory;
    const totalLiabilities = payables + vatPayable;

    return {
      asOfAd: upto,
      asOfBs: formatBs(upto),
      note: 'Derived live from operations (sales, purchases, expenses, drawer & credit ledgers). Equity is the balancing figure.',
      assets: {
        cashInHandCents: cashInHand,
        bankBalanceCents: bankBalance,
        accountsReceivableCents: receivables,
        inventoryCents: inventory,
        totalCents: totalAssets,
      },
      liabilities: {
        accountsPayableCents: payables,
        vatPayableCents: vatPayable,
        totalCents: totalLiabilities,
      },
      equity: {
        retainedEarningsCents: totalAssets - totalLiabilities,
        totalCents: totalAssets - totalLiabilities,
      },
    };
  }
}

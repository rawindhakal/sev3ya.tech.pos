import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const num = (v: unknown): number => (v == null ? 0 : Number(v));

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  private range(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = to ? new Date(to) : new Date(from ?? Date.now());
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  // ── Expense ledger (#157) ──────────────────────────
  expenses(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    return this.prisma.expense.findMany({
      where: { incurredAt: { gte: start, lte: end } },
      orderBy: { incurredAt: 'desc' },
    });
  }
  createExpense(dto: { category: ExpenseCategory; amountCents: number; description?: string; incurredAt?: string }) {
    return this.prisma.expense.create({
      data: {
        category: dto.category,
        amountCents: dto.amountCents,
        description: dto.description,
        incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : new Date(),
      },
    });
  }
  async removeExpense(id: string) {
    const e = await this.prisma.expense.findUnique({ where: { id } });
    if (!e) throw new NotFoundException(`Expense ${id} not found`);
    return this.prisma.expense.delete({ where: { id } });
  }

  // ── Daily P&L (#156) + tax summary (#162) + break-even (#165) ──
  async pnl(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    const paid = { status: 'PAID' as const, paidAt: { gte: start, lte: end } };

    const [sales, cogsRows, expenseRows] = await Promise.all([
      this.prisma.order.aggregate({
        _sum: { totalCents: true, taxCents: true, serviceChargeCents: true, subtotalCents: true, discountCents: true },
        _count: true,
        where: paid,
      }),
      // COGS = sold quantity × recipe cost per item.
      this.prisma.$queryRaw<{ cogs: number | null }[]>(Prisma.sql`
        SELECT SUM(oi.quantity * rc.cost) AS cogs
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        JOIN (
          SELECT ri."menuItemId" AS mid, SUM(ri.quantity * ing."costPerUnitCents") AS cost
          FROM recipe_items ri JOIN ingredients ing ON ing.id = ri."ingredientId"
          GROUP BY ri."menuItemId"
        ) rc ON rc.mid = oi."menuItemId"
        WHERE o.status = 'PAID' AND o."paidAt" BETWEEN ${start} AND ${end}`),
      this.prisma.expense.groupBy({
        by: ['category'],
        _sum: { amountCents: true },
        where: { incurredAt: { gte: start, lte: end } },
      }),
    ]);

    const gross = num(sales._sum.totalCents);
    const vat = num(sales._sum.taxCents);
    const serviceCharge = num(sales._sum.serviceChargeCents);
    const netSales = gross - vat; // VAT is a liability, not revenue
    const cogs = Math.round(num(cogsRows[0]?.cogs));
    const grossProfit = netSales - cogs;
    const expensesByCategory = expenseRows.map((e) => ({ category: e.category, amountCents: num(e._sum.amountCents) }));
    const totalExpenses = expensesByCategory.reduce((s, e) => s + e.amountCents, 0);
    const netProfit = grossProfit - totalExpenses;
    const marginRatio = netSales > 0 ? grossProfit / netSales : 0;

    // Break-even: revenue needed to cover fixed (non-COGS) expenses.
    const breakEvenRevenueCents = marginRatio > 0 ? Math.round(totalExpenses / marginRatio) : 0;

    return {
      range: { from: start, to: end },
      grossSalesCents: gross,
      vatCollectedCents: vat,
      serviceChargeCents: serviceCharge,
      discountsCents: num(sales._sum.discountCents),
      netSalesCents: netSales,
      cogsCents: cogs,
      grossProfitCents: grossProfit,
      grossMarginPct: netSales > 0 ? Math.round(marginRatio * 100) : 0,
      expensesByCategory,
      totalExpensesCents: totalExpenses,
      netProfitCents: netProfit,
      orders: num(sales._count),
      breakEvenRevenueCents,
    };
  }

  // ── Accounts-payable aging from open POs (#164) ────
  async apAging() {
    const pos = await this.prisma.purchaseOrder.findMany({
      where: { status: { in: ['ORDERED', 'PARTIAL'] } },
      include: { supplier: { select: { name: true } }, lines: true },
    });
    const buckets = { '0-30': 0, '31-60': 0, '60+': 0 };
    const rows = pos.map((po) => {
      const outstanding = po.lines.reduce(
        (s, l) => s + Math.max(0, l.quantity - l.receivedQty) * l.unitCostCents + l.receivedQty * l.unitCostCents,
        0,
      );
      const ageDays = po.orderedAt ? Math.floor((Date.now() - po.orderedAt.getTime()) / 864e5) : 0;
      const bucket = ageDays <= 30 ? '0-30' : ageDays <= 60 ? '31-60' : '60+';
      buckets[bucket] += Math.round(outstanding);
      return { number: po.number, supplier: po.supplier.name, amountCents: Math.round(outstanding), ageDays, bucket };
    });
    const total = rows.reduce((s, r) => s + r.amountCents, 0);
    return { rows, buckets, totalCents: total };
  }
}

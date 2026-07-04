import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const num = (v: unknown): number => (v == null ? 0 : Number(v));

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private range(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = to ? new Date(to) : new Date(from ?? Date.now());
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  async report(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    const paidWhere = { status: 'PAID' as const, paidAt: { gte: start, lte: end } };

    const [
      summary,
      byCategory,
      byHour,
      byPayment,
      byType,
      menuRows,
      recipeCosts,
      turnover,
      waste,
      shrinkage,
      voids,
    ] = await Promise.all([
      // Z-report / DSR totals (#186)
      this.prisma.order.aggregate({
        _sum: { subtotalCents: true, taxCents: true, serviceChargeCents: true, discountCents: true, totalCents: true, guestCount: true },
        _count: true,
        where: paidWhere,
      }),
      // Revenue by category
      this.prisma.$queryRaw<{ name: string; revenue: bigint; qty: bigint }[]>(Prisma.sql`
        SELECT c.name AS name, SUM(oi."unitPriceCents" * oi.quantity) AS revenue, SUM(oi.quantity) AS qty
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        JOIN menu_items mi ON mi.id = oi."menuItemId"
        JOIN categories c ON c.id = mi."categoryId"
        WHERE o.status = 'PAID' AND o."paidAt" BETWEEN ${start} AND ${end}
        GROUP BY c.name ORDER BY revenue DESC`),
      // Hourly distribution (#187)
      this.prisma.$queryRaw<{ hour: number; revenue: bigint; orders: bigint }[]>(Prisma.sql`
        SELECT EXTRACT(HOUR FROM "paidAt")::int AS hour, SUM("totalCents") AS revenue, COUNT(*) AS orders
        FROM orders WHERE status = 'PAID' AND "paidAt" BETWEEN ${start} AND ${end}
        GROUP BY 1 ORDER BY 1`),
      // Payment channels (#192)
      this.prisma.payment.groupBy({
        by: ['method'],
        _sum: { amountCents: true },
        _count: true,
        where: { createdAt: { gte: start, lte: end } },
      }),
      // Order-type split (#197)
      this.prisma.order.groupBy({
        by: ['type'],
        _sum: { totalCents: true },
        _count: true,
        where: paidWhere,
      }),
      // Menu item volume + revenue
      this.prisma.$queryRaw<{ id: string; name: string; qty: bigint; revenue: bigint }[]>(Prisma.sql`
        SELECT oi."menuItemId" AS id, oi."nameSnapshot" AS name,
               SUM(oi.quantity) AS qty, SUM(oi."unitPriceCents" * oi.quantity) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        WHERE o.status = 'PAID' AND o."paidAt" BETWEEN ${start} AND ${end} AND oi."menuItemId" IS NOT NULL
        GROUP BY oi."menuItemId", oi."nameSnapshot" ORDER BY qty DESC`),
      // Recipe cost per menu item (for margins, #188)
      this.prisma.$queryRaw<{ menuitemid: string; costperitem: number }[]>(Prisma.sql`
        SELECT ri."menuItemId" AS menuitemid, SUM(ri.quantity * ing."costPerUnitCents") AS costperitem
        FROM recipe_items ri JOIN ingredients ing ON ing.id = ri."ingredientId"
        GROUP BY ri."menuItemId"`),
      // Table turnover velocity (#196)
      this.prisma.$queryRaw<{ avg_seconds: number | null }[]>(Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM ("paidAt" - "seatedAt"))) AS avg_seconds
        FROM orders WHERE status = 'PAID' AND type = 'DINE_IN'
          AND "seatedAt" IS NOT NULL AND "paidAt" BETWEEN ${start} AND ${end}`),
      // Waste & spillage cost (#198)
      this.prisma.$queryRaw<{ cost: number | null }[]>(Prisma.sql`
        SELECT SUM(-sm.quantity * ing."costPerUnitCents") AS cost
        FROM stock_movements sm JOIN ingredients ing ON ing.id = sm."ingredientId"
        WHERE sm.type = 'WASTAGE' AND sm."createdAt" BETWEEN ${start} AND ${end}`),
      // Stock-take variance value (#190)
      this.prisma.$queryRaw<{ variance: number | null }[]>(Prisma.sql`
        SELECT SUM(sm.quantity * ing."costPerUnitCents") AS variance
        FROM stock_movements sm JOIN ingredients ing ON ing.id = sm."ingredientId"
        WHERE sm.type = 'STOCK_TAKE' AND sm."createdAt" BETWEEN ${start} AND ${end}`),
      // Void/cancellation audit (#08 report)
      this.prisma.order.findMany({
        where: { status: 'CANCELLED', updatedAt: { gte: start, lte: end }, voidReason: { not: null } },
        select: { number: true, voidReason: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);

    const costMap = new Map(recipeCosts.map((r) => [r.menuitemid, num(r.costperitem)]));
    const menuPerformance = menuRows.map((m) => {
      const qty = num(m.qty);
      const revenue = num(m.revenue);
      const cost = Math.round(costMap.get(m.id) ?? 0) * qty;
      const profit = revenue - cost;
      const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
      return { name: m.name, qty, revenueCents: revenue, costCents: cost, profitCents: profit, marginPct };
    });

    return {
      range: { from: start, to: end },
      summary: {
        orders: num(summary._count),
        grossCents: num(summary._sum.totalCents),
        subtotalCents: num(summary._sum.subtotalCents),
        taxCents: num(summary._sum.taxCents),
        serviceChargeCents: num(summary._sum.serviceChargeCents),
        discountCents: num(summary._sum.discountCents),
        guests: num(summary._sum.guestCount),
        avgTicketCents: num(summary._count) ? Math.round(num(summary._sum.totalCents) / num(summary._count)) : 0,
      },
      byCategory: byCategory.map((c) => ({ name: c.name, revenueCents: num(c.revenue), qty: num(c.qty) })),
      byHour: byHour.map((h) => ({ hour: num(h.hour), revenueCents: num(h.revenue), orders: num(h.orders) })),
      byPayment: byPayment.map((p) => ({ method: p.method, amountCents: num(p._sum.amountCents), count: num(p._count) })),
      byType: byType.map((t) => ({ type: t.type, totalCents: num(t._sum.totalCents), count: num(t._count) })),
      menuPerformance,
      tableTurnoverMinutes: turnover[0]?.avg_seconds ? Math.round(Number(turnover[0].avg_seconds) / 60) : 0,
      wasteCostCents: Math.round(num(waste[0]?.cost)),
      stockVarianceCents: Math.round(num(shrinkage[0]?.variance)),
      voids: voids.map((v) => ({ number: v.number, reason: v.voidReason, at: v.updatedAt })),
    };
  }
}

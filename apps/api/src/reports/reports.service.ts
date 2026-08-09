import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { nepalDateKey, nepalStartOfDate, nepalEndOfDate } from '../common/nepal-time';

const num = (v: unknown): number => (v == null ? 0 : Number(v));

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // from/to are YYYY-MM-DD meant in Nepal local time, not the server's own
  // timezone — see common/nepal-time.ts for why that distinction matters.
  private range(from?: string, to?: string) {
    const start = from ? nepalStartOfDate(from) : nepalStartOfDate(nepalDateKey(new Date()));
    const end = nepalEndOfDate(to ?? from ?? nepalDateKey(new Date()));
    return { start, end };
  }

  // outletId (multi-outlet, Phase 3) scopes the whole Z-report to one
  // location; omitted = every outlet combined (single-outlet tenants,
  // unchanged). Ingredient/StockMovement-derived figures (waste, stock-take
  // variance) stay unscoped — inventory is warehouse-scoped, not
  // outlet-scoped, see the Phase 3 plan's non-goals.
  async report(from?: string, to?: string, outletId?: string) {
    const { start, end } = this.range(from, to);
    const paidWhere = { status: 'PAID' as const, paidAt: { gte: start, lte: end }, ...(outletId ? { outletId } : {}) };
    const outletSql = outletId ? Prisma.sql`AND o."outletId" = ${outletId}` : Prisma.empty;
    const outletSqlUnqualified = outletId ? Prisma.sql`AND "outletId" = ${outletId}` : Prisma.empty;

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
        WHERE o.status = 'PAID' AND o."paidAt" BETWEEN ${start} AND ${end} ${outletSql}
        GROUP BY c.name ORDER BY revenue DESC`),
      // Hourly distribution (#187)
      this.prisma.$queryRaw<{ hour: number; revenue: bigint; orders: bigint }[]>(Prisma.sql`
        SELECT EXTRACT(HOUR FROM "paidAt")::int AS hour, SUM("totalCents") AS revenue, COUNT(*) AS orders
        FROM orders WHERE status = 'PAID' AND "paidAt" BETWEEN ${start} AND ${end} ${outletSqlUnqualified}
        GROUP BY 1 ORDER BY 1`),
      // Payment channels (#192)
      this.prisma.payment.groupBy({
        by: ['method'],
        _sum: { amountCents: true },
        _count: true,
        where: { createdAt: { gte: start, lte: end }, ...(outletId ? { order: { outletId } } : {}) },
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
        WHERE o.status = 'PAID' AND o."paidAt" BETWEEN ${start} AND ${end} AND oi."menuItemId" IS NOT NULL ${outletSql}
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
          AND "seatedAt" IS NOT NULL AND "paidAt" BETWEEN ${start} AND ${end} ${outletSqlUnqualified}`),
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
        where: { status: 'CANCELLED', updatedAt: { gte: start, lte: end }, voidReason: { not: null }, ...(outletId ? { outletId } : {}) },
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

  // Discounts & Complimentary report (matrix Part 2 #5) — every paid order
  // that had a non-zero discount or was comped, who approved it, and a
  // by-approver rollup so an owner can spot who's discounting too freely.
  async discounts(from?: string, to?: string, outletId?: string) {
    const { start, end } = this.range(from, to);
    const outletWhere = outletId ? { outletId } : {};
    const [orders, salesTotal] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          status: 'PAID',
          paidAt: { gte: start, lte: end },
          discountCents: { gt: 0 },
          ...outletWhere,
        },
        select: {
          id: true, number: true, paidAt: true, type: true, discountCents: true, discountLabel: true,
          discountApprovedBy: true, isComplimentary: true, subtotalCents: true, cashierName: true,
          table: { select: { name: true } },
        },
        orderBy: { paidAt: 'desc' },
      }),
      this.prisma.order.aggregate({
        _sum: { subtotalCents: true },
        where: { status: 'PAID', paidAt: { gte: start, lte: end }, ...outletWhere },
      }),
    ]);

    const totalDiscountCents = orders.reduce((s, o) => s + o.discountCents, 0);
    const complimentary = orders.filter((o) => o.isComplimentary);
    const totalSalesCents = num(salesTotal._sum.subtotalCents);

    // Roll up by approver so an owner can see who's discounting most.
    const byApproverMap = new Map<string, { count: number; totalCents: number; compCount: number }>();
    for (const o of orders) {
      const name = o.discountApprovedBy ?? '(not recorded)';
      const row = byApproverMap.get(name) ?? { count: 0, totalCents: 0, compCount: 0 };
      row.count++;
      row.totalCents += o.discountCents;
      if (o.isComplimentary) row.compCount++;
      byApproverMap.set(name, row);
    }

    return {
      range: { from: start, to: end },
      totalDiscountCents,
      totalSalesCents,
      discountPctOfSales: totalSalesCents > 0 ? Math.round((totalDiscountCents / totalSalesCents) * 1000) / 10 : 0,
      complimentaryCount: complimentary.length,
      complimentaryCents: complimentary.reduce((s, o) => s + o.discountCents, 0),
      byApprover: [...byApproverMap.entries()]
        .map(([name, r]) => ({ name, ...r }))
        .sort((a, b) => b.totalCents - a.totalCents),
      transactions: orders.map((o) => ({
        orderId: o.id,
        orderNumber: o.number,
        at: o.paidAt,
        type: o.type,
        table: o.table?.name ?? null,
        cashierName: o.cashierName,
        discountCents: o.discountCents,
        discountLabel: o.discountLabel,
        discountApprovedBy: o.discountApprovedBy,
        isComplimentary: o.isComplimentary,
        subtotalCents: o.subtotalCents,
      })),
    };
  }

  // Raw Material Stock Variance report (owner checklist Part 3) — per
  // ingredient, how much SHOULD have been used (ideal, derived from recipes
  // at time of sale — see InventoryService.deductForOrder, which writes
  // SALE_DEDUCTION movements strictly from the recipe) vs what a physical
  // stock-take actually found on the shelf. A stock-take shortfall beyond
  // recorded wastage is the real "chicken went missing" leakage signal —
  // ideal vs SALE_DEDUCTION can never differ since one is defined from the
  // other, so the STOCK_TAKE variance is the only number that can catch
  // theft/measurement drift that sales+wastage records don't explain.
  async stockVariance(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    const [ingredients, movements] = await Promise.all([
      this.prisma.ingredient.findMany({ select: { id: true, name: true, unit: true, costPerUnitCents: true } }),
      this.prisma.stockMovement.groupBy({
        by: ['ingredientId', 'type'],
        _sum: { quantity: true },
        where: { createdAt: { gte: start, lte: end } },
      }),
    ]);
    const byIngredient = new Map<string, Partial<Record<string, number>>>();
    for (const m of movements) {
      const row = byIngredient.get(m.ingredientId) ?? {};
      row[m.type] = num(m._sum.quantity);
      byIngredient.set(m.ingredientId, row);
    }
    return ingredients
      .map((i) => {
        const row = byIngredient.get(i.id) ?? {};
        const idealConsumptionQty = Math.abs(row.SALE_DEDUCTION ?? 0);
        const purchasedQty = row.PURCHASE ?? 0;
        const wastageQty = Math.abs(row.WASTAGE ?? 0);
        const stockTakeVarianceQty = row.STOCK_TAKE ?? 0;
        return {
          ingredientId: i.id,
          name: i.name,
          unit: i.unit,
          idealConsumptionQty,
          purchasedQty,
          wastageQty,
          stockTakeVarianceQty,
          stockTakeVarianceCents: Math.round(stockTakeVarianceQty * i.costPerUnitCents),
        };
      })
      .filter((r) => r.idealConsumptionQty || r.purchasedQty || r.wastageQty || r.stockTakeVarianceQty)
      .sort((a, b) => a.stockTakeVarianceCents - b.stockTakeVarianceCents); // worst shortfalls first
  }
}

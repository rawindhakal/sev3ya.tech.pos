import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { nepalStartOfToday, nepalStartOfDate, nepalEndOfDate } from '../common/nepal-time';

// Coerce Postgres BigInt aggregates to plain numbers for JSON.
const num = (v: unknown): number => (v == null ? 0 : Number(v));

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private startOfToday() {
    return nepalStartOfToday();
  }
  private daysAgo(n: number) {
    // Plain millisecond subtraction, not .setDate() — that mutates using the
    // server process's LOCAL calendar fields, which reintroduces the same
    // server-timezone bug this whole file exists to avoid. Nepal has no DST,
    // so subtracting exactly n×24h from a Nepal-midnight instant always
    // lands on another Nepal-midnight instant.
    return new Date(this.startOfToday().getTime() - n * 86_400_000);
  }

  // Dashboard's quick date filter (Today/Yesterday/This week/This month/
  // custom range) — from/to are YYYY-MM-DD, both inclusive, meant in Nepal
  // local time (not the server's own timezone). Defaults to just today,
  // matching the page's original fixed behavior. outletId (multi-outlet,
  // Phase 3) scopes every metric to one location; omitted = every outlet
  // combined (single-outlet tenants, unchanged).
  async dashboard(from?: string, to?: string, outletId?: string) {
    const rangeStart = from ? nepalStartOfDate(from) : this.startOfToday();
    const rangeEnd = to ? nepalEndOfDate(to) : new Date(rangeStart.getTime() + 864e5 - 1);
    const window30 = this.daysAgo(29);
    const outletWhere: Prisma.OrderWhereInput = outletId ? { outletId } : {};
    // Conditional AND clauses for the raw-SQL queries below (hand-written SQL
    // needs its own fragment since it doesn't go through the query builder) —
    // two variants since some queries alias the orders table as "o" and some
    // reference it unqualified.
    const outletSql = outletId ? Prisma.sql`AND o."outletId" = ${outletId}` : Prisma.empty;
    const outletSqlUnqualified = outletId ? Prisma.sql`AND "outletId" = ${outletId}` : Prisma.empty;

    const [
      todaysOrders,
      todaysCustomers,
      todaysEarningsAgg,
      earnings30,
      salesSeries,
      paymentsByMethod,
      topItems,
      topTables,
      guestTime,
      turnaround,
      waiterOverview,
      recentOrders,
    ] = await Promise.all([
      // Order count in the selected range (excluding cancelled).
      this.prisma.order.count({
        where: { createdAt: { gte: rangeStart, lte: rangeEnd }, status: { not: 'CANCELLED' }, ...outletWhere },
      }),
      // Customers (covers) in the selected range.
      this.prisma.order.aggregate({
        _sum: { guestCount: true },
        where: { createdAt: { gte: rangeStart, lte: rangeEnd }, status: { not: 'CANCELLED' }, ...outletWhere },
      }),
      // Earnings (paid) in the selected range.
      this.prisma.order.aggregate({
        _sum: { totalCents: true },
        _count: true,
        where: { status: 'PAID', paidAt: { gte: rangeStart, lte: rangeEnd }, ...outletWhere },
      }),
      // Last-30-day paid revenue → average daily earning (rolling context stat,
      // independent of the selected range).
      this.prisma.order.aggregate({
        _sum: { totalCents: true },
        where: { status: 'PAID', paidAt: { gte: window30 }, ...outletWhere },
      }),
      // Daily sales across the selected range (line graph).
      this.prisma.$queryRaw<{ day: Date; cents: bigint; orders: bigint }[]>(
        Prisma.sql`
          SELECT date_trunc('day', "paidAt") AS day,
                 SUM("totalCents") AS cents,
                 COUNT(*) AS orders
          FROM orders
          WHERE status = 'PAID' AND "paidAt" >= ${rangeStart} AND "paidAt" <= ${rangeEnd} ${outletSqlUnqualified}
          GROUP BY 1 ORDER BY 1`,
      ),
      // Amount received by payment method in the selected range.
      this.prisma.payment.groupBy({
        by: ['method'],
        _sum: { amountCents: true },
        _count: true,
        where: { createdAt: { gte: rangeStart, lte: rangeEnd }, ...(outletId ? { order: { outletId } } : {}) },
      }),
      // Top selling items in the selected range.
      this.prisma.$queryRaw<{ name: string; qty: bigint; revenue: bigint }[]>(
        Prisma.sql`
          SELECT oi."nameSnapshot" AS name,
                 SUM(oi.quantity) AS qty,
                 SUM(oi."unitPriceCents" * oi.quantity) AS revenue
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          WHERE o.status = 'PAID' AND o."paidAt" >= ${rangeStart} AND o."paidAt" <= ${rangeEnd} ${outletSql}
          GROUP BY oi."nameSnapshot"
          ORDER BY qty DESC LIMIT 8`,
      ),
      // Top selling tables in the selected range.
      this.prisma.$queryRaw<{ name: string; orders: bigint; revenue: bigint }[]>(
        Prisma.sql`
          SELECT t.name AS name,
                 COUNT(o.id) AS orders,
                 SUM(o."totalCents") AS revenue
          FROM orders o
          JOIN restaurant_tables t ON t.id = o."tableId"
          WHERE o.status = 'PAID' AND o."paidAt" >= ${rangeStart} AND o."paidAt" <= ${rangeEnd} ${outletSql}
          GROUP BY t.name
          ORDER BY revenue DESC LIMIT 6`,
      ),
      // Average guest time on table, in seconds, in the selected range (dine-in).
      this.prisma.$queryRaw<{ avg_seconds: number | null }[]>(
        Prisma.sql`
          SELECT AVG(EXTRACT(EPOCH FROM ("paidAt" - "seatedAt"))) AS avg_seconds
          FROM orders
          WHERE status = 'PAID' AND type = 'DINE_IN'
            AND "seatedAt" IS NOT NULL AND "paidAt" IS NOT NULL
            AND "paidAt" >= ${rangeStart} AND "paidAt" <= ${rangeEnd} ${outletSqlUnqualified}`,
      ),
      // Turnaround: dine-in paid orders per table used, in the selected range.
      this.prisma.$queryRaw<{ orders: bigint; tables: bigint }[]>(
        Prisma.sql`
          SELECT COUNT(*) AS orders, COUNT(DISTINCT "tableId") AS tables
          FROM orders
          WHERE status = 'PAID' AND type = 'DINE_IN'
            AND "tableId" IS NOT NULL AND "paidAt" >= ${rangeStart} AND "paidAt" <= ${rangeEnd} ${outletSqlUnqualified}`,
      ),
      // Waiter overview in the selected range.
      this.prisma.$queryRaw<
        { name: string; orders: bigint; revenue: bigint; guests: bigint }[]
      >(
        Prisma.sql`
          SELECT w.name AS name,
                 COUNT(o.id) AS orders,
                 SUM(o."totalCents") AS revenue,
                 SUM(o."guestCount") AS guests
          FROM orders o
          JOIN waiters w ON w.id = o."waiterId"
          WHERE o.status = 'PAID' AND o."paidAt" >= ${rangeStart} AND o."paidAt" <= ${rangeEnd} ${outletSql}
          GROUP BY w.name
          ORDER BY revenue DESC`,
      ),
      // Recent orders in the selected range.
      this.prisma.order.findMany({
        where: { createdAt: { gte: rangeStart, lte: rangeEnd }, ...outletWhere },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          table: { select: { name: true } },
          waiter: { select: { name: true } },
        },
      }),
    ]);

    const revenue30 = num(earnings30._sum.totalCents);
    const turn = turnaround[0];

    return {
      today: {
        orders: todaysOrders,
        earningsCents: num(todaysEarningsAgg._sum.totalCents),
        paidOrders: num(todaysEarningsAgg._count),
        customers: num(todaysCustomers._sum.guestCount),
      },
      averages: {
        dailyEarningCents: Math.round(revenue30 / 30),
        guestTimeMinutes: guestTime[0]?.avg_seconds
          ? Math.round(Number(guestTime[0].avg_seconds) / 60)
          : 0,
        turnaroundRate:
          turn && num(turn.tables) > 0
            ? Number((num(turn.orders) / num(turn.tables)).toFixed(2))
            : 0,
      },
      salesSeries: salesSeries.map((r) => ({
        date: r.day,
        cents: num(r.cents),
        orders: num(r.orders),
      })),
      paymentsByMethod: paymentsByMethod.map((p) => ({
        method: p.method,
        amountCents: num(p._sum.amountCents),
        count: num(p._count),
      })),
      topItems: topItems.map((i) => ({
        name: i.name,
        qty: num(i.qty),
        revenueCents: num(i.revenue),
      })),
      topTables: topTables.map((t) => ({
        name: t.name,
        orders: num(t.orders),
        revenueCents: num(t.revenue),
      })),
      waiters: waiterOverview.map((w) => ({
        name: w.name,
        orders: num(w.orders),
        revenueCents: num(w.revenue),
        guests: num(w.guests),
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        number: o.number,
        type: o.type,
        status: o.status,
        totalCents: o.totalCents,
        guestCount: o.guestCount,
        table: o.table?.name ?? null,
        waiter: o.waiter?.name ?? null,
        createdAt: o.createdAt,
      })),
    };
  }
}

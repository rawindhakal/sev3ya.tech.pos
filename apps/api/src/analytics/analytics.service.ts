import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Coerce Postgres BigInt aggregates to plain numbers for JSON.
const num = (v: unknown): number => (v == null ? 0 : Number(v));

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  private startOfMonth() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  private daysAgo(n: number) {
    const d = this.startOfToday();
    d.setDate(d.getDate() - n);
    return d;
  }

  async dashboard() {
    const todayStart = this.startOfToday();
    const monthStart = this.startOfMonth();
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    const window30 = this.daysAgo(29);

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
      // Today's order count (excluding cancelled).
      this.prisma.order.count({
        where: { createdAt: { gte: todayStart }, status: { not: 'CANCELLED' } },
      }),
      // Today's customers (covers).
      this.prisma.order.aggregate({
        _sum: { guestCount: true },
        where: { createdAt: { gte: todayStart }, status: { not: 'CANCELLED' } },
      }),
      // Today's earnings (paid).
      this.prisma.order.aggregate({
        _sum: { totalCents: true },
        _count: true,
        where: { status: 'PAID', paidAt: { gte: todayStart } },
      }),
      // Last-30-day paid revenue → average daily earning.
      this.prisma.order.aggregate({
        _sum: { totalCents: true },
        where: { status: 'PAID', paidAt: { gte: window30 } },
      }),
      // Daily sales for the current month (line graph).
      this.prisma.$queryRaw<{ day: Date; cents: bigint; orders: bigint }[]>(
        Prisma.sql`
          SELECT date_trunc('day', "paidAt") AS day,
                 SUM("totalCents") AS cents,
                 COUNT(*) AS orders
          FROM orders
          WHERE status = 'PAID' AND "paidAt" >= ${monthStart} AND "paidAt" < ${monthEnd}
          GROUP BY 1 ORDER BY 1`,
      ),
      // Amount received by payment method (today).
      this.prisma.payment.groupBy({
        by: ['method'],
        _sum: { amountCents: true },
        _count: true,
        where: { createdAt: { gte: todayStart } },
      }),
      // Top selling items (this month).
      this.prisma.$queryRaw<{ name: string; qty: bigint; revenue: bigint }[]>(
        Prisma.sql`
          SELECT oi."nameSnapshot" AS name,
                 SUM(oi.quantity) AS qty,
                 SUM(oi."unitPriceCents" * oi.quantity) AS revenue
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          WHERE o.status = 'PAID' AND o."paidAt" >= ${monthStart}
          GROUP BY oi."nameSnapshot"
          ORDER BY qty DESC LIMIT 8`,
      ),
      // Top selling tables (this month).
      this.prisma.$queryRaw<{ name: string; orders: bigint; revenue: bigint }[]>(
        Prisma.sql`
          SELECT t.name AS name,
                 COUNT(o.id) AS orders,
                 SUM(o."totalCents") AS revenue
          FROM orders o
          JOIN restaurant_tables t ON t.id = o."tableId"
          WHERE o.status = 'PAID' AND o."paidAt" >= ${monthStart}
          GROUP BY t.name
          ORDER BY revenue DESC LIMIT 6`,
      ),
      // Average guest time on table, in seconds (this month, dine-in).
      this.prisma.$queryRaw<{ avg_seconds: number | null }[]>(
        Prisma.sql`
          SELECT AVG(EXTRACT(EPOCH FROM ("paidAt" - "seatedAt"))) AS avg_seconds
          FROM orders
          WHERE status = 'PAID' AND type = 'DINE_IN'
            AND "seatedAt" IS NOT NULL AND "paidAt" IS NOT NULL
            AND "paidAt" >= ${monthStart}`,
      ),
      // Turnaround: dine-in paid orders per table used today.
      this.prisma.$queryRaw<{ orders: bigint; tables: bigint }[]>(
        Prisma.sql`
          SELECT COUNT(*) AS orders, COUNT(DISTINCT "tableId") AS tables
          FROM orders
          WHERE status = 'PAID' AND type = 'DINE_IN'
            AND "tableId" IS NOT NULL AND "paidAt" >= ${todayStart}`,
      ),
      // Waiter overview (this month).
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
          WHERE o.status = 'PAID' AND o."paidAt" >= ${monthStart}
          GROUP BY w.name
          ORDER BY revenue DESC`,
      ),
      // Recent orders today.
      this.prisma.order.findMany({
        where: { createdAt: { gte: todayStart } },
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

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { nepalStartOfToday, nepalStartOfDate, nepalEndOfDate, NPT_OFFSET_MIN } from '../common/nepal-time';

// Coerce Postgres BigInt aggregates to plain numbers for JSON.
const num = (v: unknown): number => (v == null ? 0 : Number(v));

// Nepal-local hour-of-day (0-23) for a real UTC instant — used to bucket
// attendance punches by wall-clock hour regardless of the server's own
// timezone, same reasoning as every other Nepal-time helper in this file.
function nepalHourOf(d: Date): number {
  return Math.floor((((d.getTime() + NPT_OFFSET_MIN * 60_000) / 3_600_000) % 24 + 24) % 24);
}

// Distributes an attendance session's labor cost across the Nepal-local
// hour buckets it actually overlaps, prorated by minutes worked in each —
// a session spanning 8:40-9:20 puts 1/3 of an hour's wage in bucket 8 and
// 1/3 in bucket 9, not the whole hour's wage in whichever bucket it started.
function addSessionCost(start: Date, end: Date, hourlyRateCents: number, bucket: number[]): void {
  if (end <= start || hourlyRateCents <= 0) return;
  let cursor = start.getTime();
  const endMs = end.getTime();
  while (cursor < endMs) {
    const hour = nepalHourOf(new Date(cursor));
    const msIntoHour = (cursor + NPT_OFFSET_MIN * 60_000) % 3_600_000;
    const nextBoundary = cursor + (3_600_000 - msIntoHour);
    const segmentEnd = Math.min(nextBoundary, endMs);
    const minutes = (segmentEnd - cursor) / 60_000;
    bucket[hour] += hourlyRateCents * (minutes / 60);
    cursor = segmentEnd;
  }
}

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
    // Postgres's EXTRACT()/date_trunc() convert a timestamptz using the DB
    // session's own timezone setting, not a fixed one — which is Etc/UTC in
    // production (confirmed via `SHOW timezone`) but can differ on a dev
    // machine (e.g. Asia/Kathmandu, if that's the OS's own zone), silently
    // masking the bug in local testing. Every hour/day-of-week/day bucket
    // below explicitly converts via this fragment first so bucketing is
    // deterministically Nepal-local regardless of session timezone — the
    // same reasoning as this file's nepalStartOfToday/nepalStartOfDate/
    // nepalEndOfDate helpers, just applied inside a GROUP BY instead of a
    // WHERE bound. Without it, an order paid at 12:30 AM Nepal time (still
    // "yesterday evening" in UTC) lands in the wrong day's bucket, and every
    // hourly bar is shifted by the fixed 5h45m offset.
    const NPT_TZ = Prisma.sql`AT TIME ZONE 'Asia/Kathmandu'`;

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
      byHour,
      byType,
      menuRows,
      recipeCosts,
      discountsByDay,
      voidsByDay,
      avgTicketByDay,
      cafeSetting,
      byCategory,
      dowHourHeatmap,
      newReturningByDay,
      customerLinkStats,
      paymentMethodsByDay,
      attendanceLogs,
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
          SELECT date_trunc('day', "paidAt" ${NPT_TZ}) AS day,
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
      // Recent orders in the selected range — excludes cancelled orders that
      // never had any value (an empty cart opened and immediately voided,
      // e.g. a table tapped by mistake). A cancelled order that DID have
      // items rung up before being voided still shows, since that's real
      // activity worth seeing, not noise.
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: rangeStart, lte: rangeEnd },
          NOT: { status: 'CANCELLED', totalCents: 0 },
          ...outletWhere,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          table: { select: { name: true } },
          waiter: { select: { name: true } },
        },
      }),
      // Revenue by hour-of-day across the whole range (line chart #1, and
      // the revenue side of Labor vs Sales #6).
      this.prisma.$queryRaw<{ hour: number; revenue: bigint; orders: bigint }[]>(
        Prisma.sql`
          SELECT EXTRACT(HOUR FROM "paidAt" ${NPT_TZ})::int AS hour, SUM("totalCents") AS revenue, COUNT(*) AS orders
          FROM orders WHERE status = 'PAID' AND "paidAt" >= ${rangeStart} AND "paidAt" <= ${rangeEnd} ${outletSqlUnqualified}
          GROUP BY 1 ORDER BY 1`,
      ),
      // Order source split (#4) — DINE_IN / TAKEAWAY / DELIVERY.
      this.prisma.order.groupBy({
        by: ['type'],
        _sum: { totalCents: true },
        _count: true,
        where: { status: 'PAID', paidAt: { gte: rangeStart, lte: rangeEnd }, ...outletWhere },
      }),
      // Menu engineering (#7) — volume per item, for margin-costing below.
      this.prisma.$queryRaw<{ id: string; name: string; qty: bigint; revenue: bigint }[]>(
        Prisma.sql`
          SELECT oi."menuItemId" AS id, oi."nameSnapshot" AS name,
                 SUM(oi.quantity) AS qty, SUM(oi."unitPriceCents" * oi.quantity) AS revenue
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          WHERE o.status = 'PAID' AND o."paidAt" >= ${rangeStart} AND o."paidAt" <= ${rangeEnd}
            AND oi."menuItemId" IS NOT NULL ${outletSql}
          GROUP BY oi."menuItemId", oi."nameSnapshot" ORDER BY qty DESC`,
      ),
      // Recipe cost per menu item, for the same margin-costing (range-independent).
      this.prisma.$queryRaw<{ menuitemid: string; costperitem: number }[]>(
        Prisma.sql`
          SELECT ri."menuItemId" AS menuitemid, SUM(ri.quantity * ing."costPerUnitCents") AS costperitem
          FROM recipe_items ri JOIN ingredients ing ON ing.id = ri."ingredientId"
          GROUP BY ri."menuItemId"`,
      ),
      // Discounts by day (#8, left half).
      this.prisma.$queryRaw<{ day: Date; discount: bigint; comps: bigint }[]>(
        Prisma.sql`
          SELECT date_trunc('day', "paidAt" ${NPT_TZ}) AS day, SUM("discountCents") AS discount,
                 COUNT(*) FILTER (WHERE "isComplimentary") AS comps
          FROM orders
          WHERE status = 'PAID' AND "discountCents" > 0
            AND "paidAt" >= ${rangeStart} AND "paidAt" <= ${rangeEnd} ${outletSqlUnqualified}
          GROUP BY 1 ORDER BY 1`,
      ),
      // Voids by day (#8, right half) — cancelled orders, bucketed by when
      // they were cancelled (paidAt is never set for these).
      this.prisma.$queryRaw<{ day: Date; voids: bigint; voidedcents: bigint }[]>(
        Prisma.sql`
          SELECT date_trunc('day', "updatedAt" ${NPT_TZ}) AS day, COUNT(*) AS voids, SUM("totalCents") AS voidedcents
          FROM orders
          WHERE status = 'CANCELLED'
            AND "updatedAt" >= ${rangeStart} AND "updatedAt" <= ${rangeEnd} ${outletSqlUnqualified}
          GROUP BY 1 ORDER BY 1`,
      ),
      // Average ticket time by day (#9) — fired → ready, only items that
      // actually passed through the KDS "ready" step.
      this.prisma.$queryRaw<{ day: Date; avg_seconds: number | null; tickets: bigint }[]>(
        Prisma.sql`
          SELECT date_trunc('day', oi."readyAt" ${NPT_TZ}) AS day,
                 AVG(EXTRACT(EPOCH FROM (oi."readyAt" - o."kotFiredAt"))) AS avg_seconds,
                 COUNT(*) AS tickets
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          WHERE oi."readyAt" IS NOT NULL AND o."kotFiredAt" IS NOT NULL
            AND oi."readyAt" >= ${rangeStart} AND oi."readyAt" <= ${rangeEnd} ${outletSql}
          GROUP BY 1 ORDER BY 1`,
      ),
      // Target ticket time (reference line for #9), editable in Settings.
      this.prisma.cafeSetting.findUnique({ where: { id: 'singleton' }, select: { targetTicketMinutes: true } }),
      // Revenue by category (#10 treemap).
      this.prisma.$queryRaw<{ name: string; revenue: bigint; qty: bigint }[]>(
        Prisma.sql`
          SELECT c.name AS name, SUM(oi."unitPriceCents" * oi.quantity) AS revenue, SUM(oi.quantity) AS qty
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          JOIN menu_items mi ON mi.id = oi."menuItemId"
          JOIN categories c ON c.id = mi."categoryId"
          WHERE o.status = 'PAID' AND o."paidAt" >= ${rangeStart} AND o."paidAt" <= ${rangeEnd} ${outletSql}
          GROUP BY c.name ORDER BY revenue DESC`,
      ),
      // Day-of-week × hour transaction heatmap (#11). dow: 0=Sunday.
      this.prisma.$queryRaw<{ dow: number; hour: number; revenue: bigint; orders: bigint }[]>(
        Prisma.sql`
          SELECT EXTRACT(DOW FROM "paidAt" ${NPT_TZ})::int AS dow, EXTRACT(HOUR FROM "paidAt" ${NPT_TZ})::int AS hour,
                 SUM("totalCents") AS revenue, COUNT(*) AS orders
          FROM orders WHERE status = 'PAID' AND "paidAt" >= ${rangeStart} AND "paidAt" <= ${rangeEnd} ${outletSqlUnqualified}
          GROUP BY 1, 2`,
      ),
      // New vs returning guests by day (#13) — "new" means this order is
      // that customer's true first-ever paid order (unbounded lookback, not
      // just first-in-range), so a regular whose only visit in this
      // particular range happens to be their first-ever visit still counts
      // as new, and everyone else counts as returning.
      this.prisma.$queryRaw<{ day: Date; bucket: string; orders: bigint }[]>(
        Prisma.sql`
          WITH first_visit AS (
            SELECT "customerId", MIN("paidAt") AS first_paid_at
            FROM orders WHERE status = 'PAID' AND "customerId" IS NOT NULL
            GROUP BY "customerId"
          )
          SELECT date_trunc('day', o."paidAt" ${NPT_TZ}) AS day,
                 CASE WHEN o."paidAt" = fv.first_paid_at THEN 'new' ELSE 'returning' END AS bucket,
                 COUNT(*) AS orders
          FROM orders o JOIN first_visit fv ON fv."customerId" = o."customerId"
          WHERE o.status = 'PAID' AND o."paidAt" >= ${rangeStart} AND o."paidAt" <= ${rangeEnd} ${outletSql}
          GROUP BY 1, 2 ORDER BY 1`,
      ),
      // Coverage footnote for #13 — how many paid orders in range had no
      // linked Customer at all (walk-ins with no phone captured), since
      // those are invisible to the new/returning classification above.
      this.prisma.$queryRaw<{ no_customer: bigint; total: bigint }[]>(
        Prisma.sql`
          SELECT COUNT(*) FILTER (WHERE "customerId" IS NULL) AS no_customer, COUNT(*) AS total
          FROM orders WHERE status = 'PAID' AND "paidAt" >= ${rangeStart} AND "paidAt" <= ${rangeEnd} ${outletSqlUnqualified}`,
      ),
      // Payment methods over time (#14) — day × method.
      this.prisma.$queryRaw<{ day: Date; method: string; amount: bigint }[]>(
        Prisma.sql`
          SELECT date_trunc('day', p."createdAt" ${NPT_TZ}) AS day, p.method AS method, SUM(p."amountCents") AS amount
          FROM payments p JOIN orders o ON o.id = p."orderId"
          WHERE p."createdAt" >= ${rangeStart} AND p."createdAt" <= ${rangeEnd} ${outletSql}
          GROUP BY 1, 2 ORDER BY 1`,
      ),
      // Raw IN/OUT punches in range, for the labor-cost side of #6 —
      // bucketed into hourly wage cost after this Promise.all resolves.
      this.prisma.attendanceLog.findMany({
        where: { at: { gte: rangeStart, lte: rangeEnd }, employeeId: { not: null }, status: { in: ['IN', 'OUT'] } },
        select: { employeeId: true, at: true, status: true },
        orderBy: [{ employeeId: 'asc' }, { at: 'asc' }],
      }),
    ]);

    const revenue30 = num(earnings30._sum.totalCents);
    const turn = turnaround[0];

    // Menu engineering (#7) — real recipe-cost margin per item, same
    // calculation reports.service.ts's Z-Report already does.
    const costMap = new Map(recipeCosts.map((r) => [r.menuitemid, num(r.costperitem)]));
    const menuPerformance = menuRows.map((m) => {
      const qty = num(m.qty);
      const revenue = num(m.revenue);
      const cost = Math.round(costMap.get(m.id) ?? 0) * qty;
      const profit = revenue - cost;
      const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
      return { name: m.name, qty, revenueCents: revenue, costCents: cost, profitCents: profit, marginPct };
    });

    // Labor vs sales (#6) — bucket each employee's clocked-in sessions into
    // Nepal-local hourly wage cost, derived from monthlySalaryCents (no
    // per-employee hourly-rate field exists — this is a flagged estimate,
    // not a precise timeclock cost).
    const laborEmployeeIds = [...new Set(attendanceLogs.map((l) => l.employeeId!).filter(Boolean))];
    const laborEmployees = laborEmployeeIds.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: laborEmployeeIds } },
          select: { id: true, monthlySalaryCents: true },
        })
      : [];
    const hourlyRateByEmp = new Map(laborEmployees.map((e) => [e.id, e.monthlySalaryCents / 26 / 8]));
    const laborCentsByHour = new Array(24).fill(0) as number[];
    const punchesByEmp = new Map<string, { at: Date; status: string }[]>();
    for (const l of attendanceLogs) {
      if (!l.employeeId) continue;
      const arr = punchesByEmp.get(l.employeeId) ?? [];
      arr.push({ at: l.at, status: l.status! });
      punchesByEmp.set(l.employeeId, arr);
    }
    for (const [empId, punches] of punchesByEmp) {
      const rate = hourlyRateByEmp.get(empId) ?? 0;
      let sessionStart: Date | null = null;
      for (const p of punches) {
        if (p.status === 'IN' && !sessionStart) sessionStart = p.at;
        else if (p.status === 'OUT' && sessionStart) {
          addSessionCost(sessionStart, p.at, rate, laborCentsByHour);
          sessionStart = null;
        }
      }
      // Still clocked in at the end of the range — count up to rangeEnd
      // (or now, if the range extends into the future) so an open shift
      // isn't silently dropped from the total.
      if (sessionStart) addSessionCost(sessionStart, new Date(Math.min(rangeEnd.getTime(), Date.now())), rate, laborCentsByHour);
    }
    const revenueByHourMap = new Map(byHour.map((h) => [num(h.hour), num(h.revenue)]));
    const laborVsSales = laborCentsByHour.map((cents, hour) => ({
      hour,
      laborCents: Math.round(cents),
      revenueCents: revenueByHourMap.get(hour) ?? 0,
    }));

    // New vs returning guests (#13) — pivot the day×bucket rows into one
    // row per day with both counts, so the frontend doesn't need to.
    const newReturningMap = new Map<string, { date: Date; newOrders: number; returningOrders: number }>();
    for (const r of newReturningByDay) {
      const key = r.day.toISOString();
      const row = newReturningMap.get(key) ?? { date: r.day, newOrders: 0, returningOrders: 0 };
      if (r.bucket === 'new') row.newOrders += num(r.orders);
      else row.returningOrders += num(r.orders);
      newReturningMap.set(key, row);
    }
    const customerLink = customerLinkStats[0];

    // Payment methods over time (#14) — pivot day×method rows into one row
    // per day with a field per method.
    const paymentMethodsMap = new Map<string, { date: Date; [method: string]: number | Date }>();
    for (const r of paymentMethodsByDay) {
      const key = r.day.toISOString();
      const row = paymentMethodsMap.get(key) ?? { date: r.day };
      row[r.method] = (Number(row[r.method]) || 0) + num(r.amount);
      paymentMethodsMap.set(key, row);
    }

    // Discounts & voids (#8) — merge the two day-bucketed series into one
    // row per day.
    const discountsVoidsMap = new Map<string, { date: Date; discountCents: number; complimentaryCount: number; voidCount: number; voidedCents: number }>();
    for (const r of discountsByDay) {
      const key = r.day.toISOString();
      const row = discountsVoidsMap.get(key) ?? { date: r.day, discountCents: 0, complimentaryCount: 0, voidCount: 0, voidedCents: 0 };
      row.discountCents += num(r.discount);
      row.complimentaryCount += num(r.comps);
      discountsVoidsMap.set(key, row);
    }
    for (const r of voidsByDay) {
      const key = r.day.toISOString();
      const row = discountsVoidsMap.get(key) ?? { date: r.day, discountCents: 0, complimentaryCount: 0, voidCount: 0, voidedCents: 0 };
      row.voidCount += num(r.voids);
      row.voidedCents += num(r.voidedcents);
      discountsVoidsMap.set(key, row);
    }

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
      // #1 Hourly Sales.
      salesByHour: byHour.map((h) => ({ hour: num(h.hour), revenueCents: num(h.revenue), orders: num(h.orders) })),
      // #4 Order Source.
      ordersByType: byType.map((t) => ({ type: t.type, totalCents: num(t._sum.totalCents), count: num(t._count) })),
      // #6 Labor vs Sales — flagged as a derived estimate (see comment above).
      laborVsSales,
      // #7 Menu Engineering.
      menuPerformance,
      // #8 Discounts & Voids, one row per day.
      discountsAndVoidsByDay: [...discountsVoidsMap.values()].sort((a, b) => a.date.getTime() - b.date.getTime()),
      // #9 Average Ticket Time.
      avgTicketByDay: avgTicketByDay.map((r) => ({
        date: r.day,
        avgMinutes: r.avg_seconds != null ? Math.round((Number(r.avg_seconds) / 60) * 10) / 10 : null,
        tickets: num(r.tickets),
      })),
      avgTicketTargetMinutes: cafeSetting?.targetTicketMinutes ?? 15,
      // #10 Sales by Category.
      salesByCategory: byCategory.map((c) => ({ name: c.name, revenueCents: num(c.revenue), qty: num(c.qty) })),
      // #11 Day×Hour Heatmap.
      dowHourHeatmap: dowHourHeatmap.map((r) => ({ dow: num(r.dow), hour: num(r.hour), revenueCents: num(r.revenue), orders: num(r.orders) })),
      // #13 New vs Returning Guests.
      newVsReturningByDay: [...newReturningMap.values()].sort((a, b) => a.date.getTime() - b.date.getTime()),
      customerLinkCoverage: {
        noCustomer: num(customerLink?.no_customer),
        total: num(customerLink?.total),
      },
      // #14 Payment Methods Over Time, one row per day with a field per method.
      paymentMethodsByDay: [...paymentMethodsMap.values()].sort((a, b) => (a.date as Date).getTime() - (b.date as Date).getTime()),
    };
  }
}

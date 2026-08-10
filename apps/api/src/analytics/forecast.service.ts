import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nepalDateKey, nepalStartOfToday } from '../common/nepal-time';

const WINDOW_DAYS = 70;
const WEEKDAY_SAMPLES = 8;
const TREND_MIN = 0.6;
const TREND_MAX = 1.4;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function mean(xs: number[]) {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
}
function stddev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((v) => (v - m) ** 2)));
}
// Recency-weighted average — newest sample gets the highest weight
// (n..1), so a recent shift in the pattern outweighs an old one.
function weightedAvg(mostRecentFirst: number[]) {
  if (!mostRecentFirst.length) return 0;
  let sumW = 0;
  let sumWV = 0;
  mostRecentFirst.forEach((v, i) => {
    const w = mostRecentFirst.length - i;
    sumW += w;
    sumWV += w * v;
  });
  return sumWV / sumW;
}

// This is NOT a trained machine-learning model — no model store or training
// pipeline exists in this stack, and none is introduced here. It's a
// recency-weighted seasonal (same-weekday) average combined with a simple
// trend factor, computed live from order history. Real and useful, but
// statistics, not a neural net — flagged so it isn't mistaken for something
// it isn't (see the Phase 4 plan's non-goals).
@Injectable()
export class ForecastService {
  constructor(private readonly prisma: PrismaService) {}

  async predictTomorrow(outletId?: string) {
    const todayStart = nepalStartOfToday();
    const windowStart = new Date(todayStart.getTime() - WINDOW_DAYS * 86_400_000);
    const tomorrowKey = nepalDateKey(new Date(todayStart.getTime() + 86_400_000));
    const weekday = new Date(`${tomorrowKey}T12:00:00Z`).getUTCDay();

    const [orders, itemRows] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: 'PAID', paidAt: { gte: windowStart, lt: todayStart }, ...(outletId ? { outletId } : {}) },
        select: { paidAt: true, totalCents: true },
      }),
      this.prisma.orderItem.findMany({
        where: { order: { status: 'PAID', paidAt: { gte: windowStart, lt: todayStart }, ...(outletId ? { outletId } : {}) } },
        select: { nameSnapshot: true, quantity: true, order: { select: { paidAt: true } } },
      }),
    ]);

    // dateKey -> {cents, orders}, filled for every day in the window so gaps
    // (days with zero sales) count as real zero samples, not missing data.
    const daily = new Map<string, { cents: number; orders: number }>();
    for (let t = windowStart.getTime(); t < todayStart.getTime(); t += 86_400_000) {
      daily.set(nepalDateKey(new Date(t)), { cents: 0, orders: 0 });
    }
    for (const o of orders) {
      if (!o.paidAt) continue;
      const key = nepalDateKey(o.paidAt);
      const cell = daily.get(key);
      if (cell) { cell.cents += o.totalCents; cell.orders += 1; }
    }
    const dailySorted = [...daily.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

    // Same-weekday history for tomorrow, most-recent-first.
    const weekdaySamples = dailySorted
      .filter(([key]) => new Date(`${key}T12:00:00Z`).getUTCDay() === weekday)
      .reverse()
      .slice(0, WEEKDAY_SAMPLES);
    const revenueSamples = weekdaySamples.map(([, v]) => v.cents);
    const orderSamples = weekdaySamples.map(([, v]) => v.orders);

    const last14 = dailySorted.slice(-14).map(([, v]) => v.cents);
    const prior14 = dailySorted.slice(-28, -14).map(([, v]) => v.cents);
    const rawTrend = mean(prior14) > 0 ? mean(last14) / mean(prior14) : 1;
    const trendFactor = Math.min(TREND_MAX, Math.max(TREND_MIN, Number.isFinite(rawTrend) ? rawTrend : 1));

    const seasonalRevenue = weekdaySamples.length ? weightedAvg(revenueSamples) : mean(dailySorted.map(([, v]) => v.cents));
    const seasonalOrders = weekdaySamples.length ? weightedAvg(orderSamples) : mean(dailySorted.map(([, v]) => v.orders));
    const predictedRevenueCents = Math.round(seasonalRevenue * trendFactor);
    const predictedOrders = Math.max(0, Math.round(seasonalOrders * trendFactor));
    const bandCents = Math.round(stddev(revenueSamples) * trendFactor);

    // Top ~15 items by recent (last 14 days) volume, then per-item weighted
    // weekday forecast the same way as revenue above.
    const itemDaily = new Map<string, Map<string, number>>(); // name -> dateKey -> qty
    for (const row of itemRows) {
      if (!row.order.paidAt) continue;
      const key = nepalDateKey(row.order.paidAt);
      const m = itemDaily.get(row.nameSnapshot) ?? new Map<string, number>();
      m.set(key, (m.get(key) ?? 0) + row.quantity);
      itemDaily.set(row.nameSnapshot, m);
    }
    const last14Keys = new Set(dailySorted.slice(-14).map(([key]) => key));
    const recentVolume = [...itemDaily.entries()]
      .map(([name, m]) => ({ name, vol: [...m.entries()].filter(([key]) => last14Keys.has(key)).reduce((s, [, q]) => s + q, 0) }))
      .filter((r) => r.vol > 0)
      .sort((a, b) => b.vol - a.vol)
      .slice(0, 15);

    const items = recentVolume.map(({ name }) => {
      const m = itemDaily.get(name)!;
      const seriesForItem = dailySorted.map(([key]) => m.get(key) ?? 0);
      const weekdayQtys = dailySorted
        .map(([key], i) => ({ key, qty: seriesForItem[i] }))
        .filter((r) => new Date(`${r.key}T12:00:00Z`).getUTCDay() === weekday)
        .reverse()
        .slice(0, WEEKDAY_SAMPLES)
        .map((r) => r.qty);
      const recentAvg = mean(seriesForItem.slice(-14));
      const predictedQty = Math.max(0, Math.round((weekdayQtys.length ? weightedAvg(weekdayQtys) : recentAvg) * trendFactor));
      const trend = predictedQty > recentAvg * 1.1 ? 'up' : predictedQty < recentAvg * 0.9 ? 'down' : 'steady';
      return { name, predictedQty, recentAvgQty: Math.round(recentAvg * 10) / 10, trend };
    }).sort((a, b) => b.predictedQty - a.predictedQty);

    const trendPct = Math.round((trendFactor - 1) * 100);
    const basis = weekdaySamples.length
      ? `Based on the last ${weekdaySamples.length} ${WEEKDAY_NAMES[weekday]}${weekdaySamples.length > 1 ? 's' : ''} (recency-weighted), ${trendPct === 0 ? 'flat' : trendPct > 0 ? `trending ${trendPct}% up` : `trending ${Math.abs(trendPct)}% down`} vs the prior two weeks. Statistical estimate, not a trained model.`
      : `Not enough ${WEEKDAY_NAMES[weekday]} history yet — using the overall daily average instead. Statistical estimate, not a trained model.`;

    return {
      date: tomorrowKey,
      weekday: WEEKDAY_NAMES[weekday],
      predictedRevenueCents,
      predictedOrders,
      confidenceLowCents: Math.max(0, predictedRevenueCents - bandCents),
      confidenceHighCents: predictedRevenueCents + bandCents,
      trendFactor: Math.round(trendFactor * 100) / 100,
      trendPct,
      basis,
      sampleSize: weekdaySamples.length,
      history: dailySorted.slice(-30).map(([date, v]) => ({ date, cents: v.cents, orders: v.orders })),
      items,
    };
  }
}

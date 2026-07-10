import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CashMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CashDrawerService {
  constructor(private readonly prisma: PrismaService) {}

  // Each terminal has its own open session (independent business day).
  private openSession(terminalId?: string) {
    return this.prisma.cashDrawerSession.findFirst({
      where: { closedAt: null, ...(terminalId ? { terminalId } : {}) },
      include: { movements: { orderBy: { createdAt: 'desc' } } },
    });
  }

  // Expected cash = opening float + cash sales during the session
  //                 + pay-ins − pay-outs. Cash sales are scoped to this terminal.
  private async computeExpected(session: {
    id: string;
    openedAt: Date;
    openingFloatCents: number;
    closedAt: Date | null;
    terminalId: string | null;
  }) {
    const until = session.closedAt ?? new Date();
    const cashSales = await this.prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        method: 'CASH',
        createdAt: { gte: session.openedAt, lte: until },
        ...(session.terminalId ? { order: { terminalId: session.terminalId } } : {}),
      },
    });
    const movements = await this.prisma.cashMovement.groupBy({
      by: ['type'],
      _sum: { amountCents: true },
      where: { sessionId: session.id },
    });
    const sum = (t: CashMovementType) =>
      Number(movements.find((m) => m.type === t)?._sum.amountCents ?? 0);

    const cashSalesCents = Number(cashSales._sum.amountCents ?? 0);
    const payIn = sum('PAY_IN');
    const payOut = sum('PAY_OUT');
    const expectedCents =
      session.openingFloatCents + cashSalesCents + payIn - payOut;
    return { cashSalesCents, payIn, payOut, expectedCents };
  }

  async current(terminalId?: string) {
    const session = await this.openSession(terminalId);
    if (!session) return { open: false as const, session: null };
    const breakdown = await this.computeExpected(session);
    return { open: true as const, session, ...breakdown };
  }

  // Admin-only correction of the open session's opening float — audited.
  async adjustOpeningFloat(openingFloatCents: number, actor?: { sub?: string; name?: string }) {
    if (!Number.isFinite(openingFloatCents) || openingFloatCents < 0)
      throw new BadRequestException('Opening balance must be zero or more');
    const session = await this.openSession();
    if (!session) throw new BadRequestException('No open cash drawer session');
    const updated = await this.prisma.cashDrawerSession.update({
      where: { id: session.id },
      data: { openingFloatCents: Math.round(openingFloatCents) },
    });
    await this.prisma.auditLog.create({
      data: {
        employeeId: actor?.sub,
        employeeName: actor?.name ?? 'admin',
        action: 'OPENING_FLOAT_ADJUSTED',
        detail: `Opening float ${session.openingFloatCents} → ${updated.openingFloatCents} (session ${session.id})`,
      },
    });
    return this.current();
  }

  async open(dto: { openingFloatCents: number; openedBy?: string; terminalId?: string }) {
    const existing = await this.openSession(dto.terminalId);
    if (existing)
      throw new BadRequestException('A cash drawer session is already open for this terminal');
    return this.prisma.cashDrawerSession.create({
      data: {
        terminalId: dto.terminalId ?? null,
        openingFloatCents: dto.openingFloatCents,
        openedBy: dto.openedBy,
        movements: {
          create: {
            type: 'OPENING',
            amountCents: dto.openingFloatCents,
            reason: 'Opening float',
          },
        },
      },
      include: { movements: true },
    });
  }

  async addMovement(dto: {
    type: 'PAY_IN' | 'PAY_OUT';
    amountCents: number;
    reason?: string;
    terminalId?: string;
  }) {
    const session = await this.openSession(dto.terminalId);
    if (!session) throw new BadRequestException('No open cash drawer session');
    await this.prisma.cashMovement.create({
      data: { sessionId: session.id, type: dto.type, amountCents: dto.amountCents, reason: dto.reason },
    });
    return this.current(dto.terminalId);
  }

  async close(dto: { countedCents: number; closedBy?: string; notes?: string; terminalId?: string }) {
    const session = await this.openSession(dto.terminalId);
    if (!session) throw new BadRequestException('No open cash drawer session');
    const { expectedCents } = await this.computeExpected(session);
    return this.prisma.cashDrawerSession.update({
      where: { id: session.id },
      data: {
        closedAt: new Date(),
        closedBy: dto.closedBy,
        countedCents: dto.countedCents,
        expectedCents,
        varianceCents: dto.countedCents - expectedCents,
        notes: dto.notes,
      },
      include: { movements: true },
    });
  }

  async history() {
    return this.prisma.cashDrawerSession.findMany({
      where: { closedAt: { not: null } },
      orderBy: { openedAt: 'desc' },
      take: 20,
    });
  }

  async findOne(id: string) {
    const s = await this.prisma.cashDrawerSession.findUnique({
      where: { id },
      include: { movements: { orderBy: { createdAt: 'desc' } } },
    });
    if (!s) throw new NotFoundException(`Session ${id} not found`);
    return s;
  }

  // Daily Z-report for a drawer session's window (a "business day" =
  // terminal-open → close, not clock midnight).
  async report(sessionId?: string, terminalId?: string) {
    const session = sessionId
      ? await this.findOne(sessionId)
      : await this.openSession(terminalId);
    if (!session) throw new NotFoundException('No cash drawer session');
    const start = session.openedAt;
    const end = session.closedAt ?? new Date();
    // Scope the report to this terminal's own sales.
    const term = session.terminalId ? { terminalId: session.terminalId } : {};
    const paidWhere = { status: 'PAID' as const, paidAt: { gte: start, lte: end }, ...term };

    const [sales, byPayment, byType] = await Promise.all([
      this.prisma.order.aggregate({
        _sum: { totalCents: true, taxCents: true, discountCents: true, serviceChargeCents: true, subtotalCents: true, guestCount: true },
        _count: true,
        where: paidWhere,
      }),
      this.prisma.payment.groupBy({
        by: ['method'],
        _sum: { amountCents: true },
        _count: true,
        where: { createdAt: { gte: start, lte: end }, ...(session.terminalId ? { order: { terminalId: session.terminalId } } : {}) },
      }),
      this.prisma.order.groupBy({
        by: ['type'],
        _sum: { totalCents: true },
        _count: true,
        where: paidWhere,
      }),
    ]);
    const b = await this.computeExpected(session);
    const n = (v: unknown) => (v == null ? 0 : Number(v));

    // Credit-facility activity inside this business day: new credit charged
    // (sales put on account) and credit paid back, split by tender. A CASH
    // settlement is also a PAY_IN movement, so it already sits in expectedCents.
    const ledgerWindow = { createdAt: { gte: start, lte: end } };
    const [creditCharged, creditPaidByMethod] = await Promise.all([
      this.prisma.creditLedgerEntry.aggregate({
        _sum: { amountCents: true },
        _count: true,
        where: { type: 'CHARGE', ...ledgerWindow },
      }),
      this.prisma.creditLedgerEntry.groupBy({
        by: ['method'],
        _sum: { amountCents: true },
        _count: true,
        where: { type: 'PAYMENT', ...ledgerWindow },
      }),
    ]);
    const creditPaidCents = creditPaidByMethod.reduce((s, m) => s + n(m._sum.amountCents), 0);

    return {
      session: {
        id: session.id,
        openedAt: start,
        closedAt: session.closedAt,
        openedBy: session.openedBy,
        closedBy: session.closedBy,
        openingFloatCents: session.openingFloatCents,
        countedCents: session.countedCents,
      },
      sales: {
        orders: n(sales._count),
        grossCents: n(sales._sum.totalCents),
        subtotalCents: n(sales._sum.subtotalCents),
        vatCents: n(sales._sum.taxCents),
        discountCents: n(sales._sum.discountCents),
        serviceChargeCents: n(sales._sum.serviceChargeCents),
        guests: n(sales._sum.guestCount),
      },
      byPayment: byPayment.map((p) => ({ method: p.method, amountCents: n(p._sum.amountCents), count: n(p._count) })),
      byType: byType.map((t) => ({ type: t.type, totalCents: n(t._sum.totalCents), count: n(t._count) })),
      cash: {
        openingFloatCents: session.openingFloatCents,
        cashSalesCents: b.cashSalesCents,
        payInCents: b.payIn,
        payOutCents: b.payOut,
        expectedCents: b.expectedCents,
        countedCents: session.countedCents,
        varianceCents: session.varianceCents,
      },
      credit: {
        chargedCents: n(creditCharged._sum.amountCents),
        chargedCount: n(creditCharged._count),
        paidCents: creditPaidCents,
        paidByMethod: creditPaidByMethod.map((m) => ({
          method: m.method,
          amountCents: n(m._sum.amountCents),
          count: n(m._count),
        })),
      },
    };
  }
}

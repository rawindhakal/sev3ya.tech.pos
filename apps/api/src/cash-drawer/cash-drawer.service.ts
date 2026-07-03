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

  private openSession() {
    return this.prisma.cashDrawerSession.findFirst({
      where: { closedAt: null },
      include: { movements: { orderBy: { createdAt: 'desc' } } },
    });
  }

  // Expected cash = opening float + cash sales during the session
  //                 + pay-ins − pay-outs.
  private async computeExpected(session: {
    id: string;
    openedAt: Date;
    openingFloatCents: number;
    closedAt: Date | null;
  }) {
    const until = session.closedAt ?? new Date();
    const cashSales = await this.prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        method: 'CASH',
        createdAt: { gte: session.openedAt, lte: until },
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

  async current() {
    const session = await this.openSession();
    if (!session) return { open: false as const, session: null };
    const breakdown = await this.computeExpected(session);
    return { open: true as const, session, ...breakdown };
  }

  async open(dto: { openingFloatCents: number; openedBy?: string }) {
    const existing = await this.openSession();
    if (existing)
      throw new BadRequestException('A cash drawer session is already open');
    return this.prisma.cashDrawerSession.create({
      data: {
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
  }) {
    const session = await this.openSession();
    if (!session) throw new BadRequestException('No open cash drawer session');
    await this.prisma.cashMovement.create({
      data: { sessionId: session.id, type: dto.type, amountCents: dto.amountCents, reason: dto.reason },
    });
    return this.current();
  }

  async close(dto: { countedCents: number; closedBy?: string; notes?: string }) {
    const session = await this.openSession();
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
}

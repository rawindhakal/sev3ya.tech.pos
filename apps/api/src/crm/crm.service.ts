import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// 1 loyalty point per Rs 10 spent.
const POINTS_PER_CENT = 1 / 1000;

// Tier thresholds by lifetime spend (paisa).
function tierOf(totalCents: number) {
  if (totalCents >= 5_000_000) return 'PLATINUM';
  if (totalCents >= 2_000_000) return 'GOLD';
  if (totalCents >= 500_000) return 'SILVER';
  return 'MEMBER';
}

// RFM-style segment (#115).
function segmentOf(c: { visitCount: number; totalSpentCents: number; lastVisitAt: Date | null }) {
  const recencyDays = c.lastVisitAt ? (Date.now() - c.lastVisitAt.getTime()) / 864e5 : 999;
  if (recencyDays > 45) return 'At Risk';
  if (c.totalSpentCents >= 2_000_000) return 'High Spender';
  if (c.visitCount >= 5) return 'Loyal';
  if (c.visitCount <= 1) return 'New';
  return 'Regular';
}

function decorate<T extends { totalSpentCents: number; visitCount: number; lastVisitAt: Date | null }>(c: T) {
  return { ...c, tier: tierOf(c.totalSpentCents), segment: segmentOf(c) };
}

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  // Called inside the payment transaction — upserts the customer by phone,
  // awards points, and rolls up spend / visits (matrix #111, #112).
  async recordSale(
    tx: Prisma.TransactionClient,
    order: { id: string; customerPhone: string | null; customerName: string | null; totalCents: number; paidAt: Date | null },
  ) {
    if (!order.customerPhone) return;
    const points = Math.floor(order.totalCents * POINTS_PER_CENT);
    const cust = await tx.customer.upsert({
      where: { phone: order.customerPhone },
      create: {
        phone: order.customerPhone,
        name: order.customerName ?? 'Guest',
        loyaltyPoints: points,
        totalSpentCents: order.totalCents,
        visitCount: 1,
        lastVisitAt: order.paidAt ?? new Date(),
      },
      update: {
        loyaltyPoints: { increment: points },
        totalSpentCents: { increment: order.totalCents },
        visitCount: { increment: 1 },
        lastVisitAt: order.paidAt ?? new Date(),
        name: order.customerName ?? undefined,
      },
    });
    await tx.order.update({ where: { id: order.id }, data: { customerId: cust.id } });
  }

  // Redeem loyalty points against an order (1 point = Rs 1). Runs inside the
  // payment transaction; guards the balance and records the redemption.
  async redeem(tx: Prisma.TransactionClient, phone: string | null, points: number, orderId: string) {
    if (!phone || points <= 0) return;
    const c = await tx.customer.findUnique({ where: { phone } });
    if (!c) throw new BadRequestException('No customer found for point redemption');
    if (c.loyaltyPoints < points)
      throw new BadRequestException(`Only ${c.loyaltyPoints} points available`);
    await tx.customer.update({ where: { id: c.id }, data: { loyaltyPoints: { decrement: points } } });
    await tx.order.update({ where: { id: orderId }, data: { redeemedPoints: points, customerId: c.id } });
  }

  // Attach/create a customer by phone (used when billing).
  upsertByPhone(name: string | undefined, phone: string) {
    return this.prisma.customer.upsert({
      where: { phone },
      create: { phone, name: name?.trim() || 'Guest' },
      update: name?.trim() ? { name: name.trim() } : {},
    });
  }

  // Add to a customer's outstanding credit (CREDIT tender / house account).
  // Writes a CHARGE ledger entry so the account has a full audit trail.
  async addCredit(tx: Prisma.TransactionClient, customerId: string, amountCents: number, orderId?: string) {
    if (amountCents <= 0) return;
    const c = await tx.customer.update({
      where: { id: customerId },
      data: { creditBalanceCents: { increment: amountCents } },
    });
    await tx.creditLedgerEntry.create({
      data: {
        customerId,
        type: 'CHARGE',
        amountCents,
        orderId,
        balanceAfterCents: c.creditBalanceCents,
      },
    });
  }

  // Settle (pay down) a customer's credit balance. Records a PAYMENT ledger
  // entry with the tender used; a CASH settlement also drops a PAY_IN into the
  // open cash-drawer session so the money shows up in the counter balance and
  // the day-end report.
  async settleCredit(
    id: string,
    amountCents: number,
    method: 'CASH' | 'FONEPAY' | 'BANK' | 'ESEWA' | 'KHALTI' | 'CARD' = 'CASH',
    note?: string,
    actorName?: string,
  ) {
    if (!amountCents || amountCents <= 0) throw new BadRequestException('Amount must be positive');
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(`Customer ${id} not found`);
    if (c.creditBalanceCents <= 0) throw new BadRequestException('No outstanding credit');
    const pay = Math.min(amountCents, c.creditBalanceCents);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id },
        data: { creditBalanceCents: { decrement: pay } },
      });
      await tx.creditLedgerEntry.create({
        data: {
          customerId: id,
          type: 'PAYMENT',
          amountCents: pay,
          method,
          note,
          createdBy: actorName,
          balanceAfterCents: updated.creditBalanceCents,
        },
      });
      // Cash received at the counter goes into the open drawer session.
      if (method === 'CASH') {
        const session = await tx.cashDrawerSession.findFirst({
          where: { closedAt: null },
          orderBy: { openedAt: 'desc' },
        });
        if (session) {
          await tx.cashMovement.create({
            data: {
              sessionId: session.id,
              type: 'PAY_IN',
              amountCents: pay,
              reason: `Credit paid — ${c.name}`,
            },
          });
        }
      }
      return { ...updated, paidCents: pay };
    });
  }

  // Full credit ledger for one customer (statement view).
  async ledger(id: string) {
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(`Customer ${id} not found`);
    const entries = await this.prisma.creditLedgerEntry.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { customer: decorate(c), entries };
  }

  async findAll(search?: string) {
    const where: Prisma.CustomerWhereInput = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] }
      : {};
    const list = await this.prisma.customer.findMany({ where, orderBy: { totalSpentCents: 'desc' }, take: 200 });
    return list.map(decorate);
  }

  // POS lookup by phone (#123 behavior history, #124 first-time tag).
  async lookup(phone: string) {
    const c = await this.prisma.customer.findUnique({
      where: { phone },
      include: {
        orders: {
          where: { status: 'PAID' },
          orderBy: { paidAt: 'desc' },
          take: 5,
          select: { number: true, totalCents: true, paidAt: true, items: { select: { nameSnapshot: true, quantity: true } } },
        },
      },
    });
    if (!c) return { found: false as const };
    return { found: true as const, ...decorate(c) };
  }

  async findOne(id: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        orders: {
          where: { status: 'PAID' },
          orderBy: { paidAt: 'desc' },
          take: 20,
          select: { number: true, type: true, totalCents: true, paidAt: true },
        },
      },
    });
    if (!c) throw new NotFoundException(`Customer ${id} not found`);
    return decorate(c);
  }

  create(dto: { name: string; phone: string; email?: string; birthday?: string }) {
    return this.prisma.customer.create({
      data: { name: dto.name, phone: dto.phone, email: dto.email, birthday: dto.birthday ? new Date(dto.birthday) : null },
    });
  }

  async update(id: string, dto: { name?: string; email?: string; optIn?: boolean; birthday?: string }) {
    await this.findOne(id);
    return this.prisma.customer.update({
      where: { id },
      data: { name: dto.name, email: dto.email, optIn: dto.optIn, birthday: dto.birthday ? new Date(dto.birthday) : undefined },
    });
  }

  // GDPR one-click delete (#125): unlink orders, then remove the profile.
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.order.updateMany({ where: { customerId: id }, data: { customerId: null, customerName: null, customerPhone: null } });
    return this.prisma.customer.delete({ where: { id } });
  }

  async stats() {
    const all = await this.prisma.customer.findMany({ select: { totalSpentCents: true, visitCount: true, lastVisitAt: true, loyaltyPoints: true } });
    const segments: Record<string, number> = {};
    const tiers: Record<string, number> = {};
    for (const c of all) {
      segments[segmentOf(c)] = (segments[segmentOf(c)] ?? 0) + 1;
      tiers[tierOf(c.totalSpentCents)] = (tiers[tierOf(c.totalSpentCents)] ?? 0) + 1;
    }
    return {
      total: all.length,
      totalPoints: all.reduce((s, c) => s + c.loyaltyPoints, 0),
      lifetimeValueCents: all.reduce((s, c) => s + c.totalSpentCents, 0),
      segments,
      tiers,
    };
  }
}

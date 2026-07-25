import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// No 0/O/1/I — avoids misreads when a code is read aloud or handwritten.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(len = 10) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

@Injectable()
export class GiftCardsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.giftCard.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async issue(dto: { valueCents: number; issuedToName?: string; issuedToPhone?: string }) {
    if (dto.valueCents <= 0) throw new BadRequestException('Value must be positive');
    let code = randomCode();
    while (await this.prisma.giftCard.findUnique({ where: { code } })) code = randomCode();
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.giftCard.create({
        data: {
          code,
          initialValueCents: dto.valueCents,
          balanceCents: dto.valueCents,
          issuedToName: dto.issuedToName,
          issuedToPhone: dto.issuedToPhone,
        },
      });
      await tx.giftCardTransaction.create({ data: { giftCardId: card.id, amountCents: dto.valueCents, note: 'Issued' } });
      return card;
    });
  }

  async lookup(code: string) {
    const card = await this.prisma.giftCard.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!card) throw new NotFoundException('Gift card not found');
    return card;
  }

  async topUp(code: string, amountCents: number, note?: string) {
    if (amountCents <= 0) throw new BadRequestException('Amount must be positive');
    const card = await this.lookup(code);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.giftCard.update({ where: { id: card.id }, data: { balanceCents: { increment: amountCents } } });
      await tx.giftCardTransaction.create({ data: { giftCardId: card.id, amountCents, note: note ?? 'Top-up' } });
      return updated;
    });
  }

  async setActive(code: string, isActive: boolean) {
    const card = await this.lookup(code);
    return this.prisma.giftCard.update({ where: { id: card.id }, data: { isActive } });
  }

  async transactions(code: string) {
    const card = await this.lookup(code);
    return this.prisma.giftCardTransaction.findMany({ where: { giftCardId: card.id }, orderBy: { createdAt: 'desc' } });
  }

  // Redeem inside the caller's payment transaction — validates balance,
  // decrements it, logs the ledger entry, and returns the card id so the
  // Payment row can be linked to it.
  async redeem(tx: Prisma.TransactionClient, code: string, amountCents: number, orderId: string) {
    const card = await tx.giftCard.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!card) throw new BadRequestException('Gift card not found');
    if (!card.isActive) throw new BadRequestException('This gift card is inactive');
    if (card.balanceCents < amountCents)
      throw new BadRequestException(`Gift card balance is only Rs ${(card.balanceCents / 100).toFixed(2)}`);
    await tx.giftCard.update({ where: { id: card.id }, data: { balanceCents: { decrement: amountCents } } });
    await tx.giftCardTransaction.create({ data: { giftCardId: card.id, orderId, amountCents: -amountCents, note: 'Redeemed' } });
    return card.id;
  }
}

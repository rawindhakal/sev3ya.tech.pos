import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  coupons() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  createCoupon(dto: {
    code: string;
    type: CouponType;
    value: number;
    minOrderCents?: number;
    maxUsesTotal?: number;
    maxUsesPerCustomer?: number;
    startsAt?: string;
    expiresAt?: string;
  }) {
    return this.prisma.coupon.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        type: dto.type,
        value: dto.value,
        minOrderCents: dto.minOrderCents ?? 0,
        maxUsesTotal: dto.maxUsesTotal ?? null,
        maxUsesPerCustomer: dto.maxUsesPerCustomer ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async updateCoupon(id: string, dto: Prisma.CouponUpdateInput) {
    await this.getCoupon(id);
    return this.prisma.coupon.update({ where: { id }, data: dto });
  }

  async deleteCoupon(id: string) {
    await this.getCoupon(id);
    return this.prisma.coupon.delete({ where: { id } });
  }

  private async getCoupon(id: string) {
    const c = await this.prisma.coupon.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Coupon not found');
    return c;
  }

  // Validate + preview the discount a coupon would produce, without
  // redeeming it — lets the POS/self-order UI show "10% off applied" before
  // committing.
  async preview(code: string, subtotalCents: number, customerId?: string) {
    const coupon = await this.findValid(code, subtotalCents, customerId);
    const discountCents = coupon.type === 'PCT' ? Math.round((subtotalCents * coupon.value) / 100) : coupon.value;
    return { coupon, discountCents: Math.min(discountCents, subtotalCents) };
  }

  private async findValid(code: string, subtotalCents: number, customerId?: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!coupon || !coupon.isActive) throw new BadRequestException('Invalid or inactive coupon code');
    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) throw new BadRequestException('This coupon is not active yet');
    if (coupon.expiresAt && coupon.expiresAt < now) throw new BadRequestException('This coupon has expired');
    if (subtotalCents < coupon.minOrderCents)
      throw new BadRequestException(`Minimum order Rs ${(coupon.minOrderCents / 100).toFixed(0)} required for this coupon`);
    if (coupon.maxUsesTotal != null && coupon.usedCount >= coupon.maxUsesTotal)
      throw new BadRequestException('This coupon has reached its usage limit');
    if (coupon.maxUsesPerCustomer != null && customerId) {
      const used = await this.prisma.couponRedemption.count({ where: { couponId: coupon.id, customerId } });
      if (used >= coupon.maxUsesPerCustomer) throw new BadRequestException('You have already used this coupon');
    }
    return coupon;
  }

  // Apply a coupon to an order inside the caller's transaction — OrdersService
  // owns recomputing/persisting the order's money totals afterward.
  async redeem(tx: Prisma.TransactionClient, code: string, subtotalCents: number, orderId: string, customerId?: string) {
    const coupon = await this.findValid(code, subtotalCents, customerId);
    const existing = await tx.couponRedemption.findUnique({ where: { orderId } });
    if (existing) throw new BadRequestException('This order already has a coupon applied — remove it first');
    await tx.couponRedemption.create({ data: { couponId: coupon.id, orderId, customerId } });
    await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
    const discountCents = coupon.type === 'PCT' ? Math.round((subtotalCents * coupon.value) / 100) : coupon.value;
    return { coupon, discountCents: Math.min(discountCents, subtotalCents) };
  }

  // Undo a coupon application (order changed, or staff removes it) — frees
  // the usage slot back up. No-op if nothing was applied.
  async unredeem(tx: Prisma.TransactionClient, orderId: string) {
    const existing = await tx.couponRedemption.findUnique({ where: { orderId } });
    if (!existing) return;
    await tx.couponRedemption.delete({ where: { orderId } });
    await tx.coupon.update({ where: { id: existing.couponId }, data: { usedCount: { decrement: 1 } } });
  }
}

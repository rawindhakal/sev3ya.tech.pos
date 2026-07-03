import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeTotals } from '../common/settings';
import { SettingsService } from '../settings/settings.service';
import { OrderType } from '@prisma/client';
import {
  CartLineDto,
  CreateOrderDto,
  PayDto,
  RefundDto,
  SaveCartDto,
  UpdateOrderDto,
  VoidDto,
} from './dto/order.dto';

const orderInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
  payments: true,
  table: { select: { id: true, name: true, area: true } },
  waiter: { select: { id: true, name: true } },
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // Pick the price for a menu item based on the order type (matrix #15).
  private tierPrice(
    mi: { priceCents: number; takeawayPriceCents: number | null; deliveryPriceCents: number | null },
    type: OrderType,
  ) {
    if (type === 'TAKEAWAY') return mi.takeawayPriceCents ?? mi.priceCents;
    if (type === 'DELIVERY') return mi.deliveryPriceCents ?? mi.priceCents;
    return mi.priceCents;
  }

  private async resolveLines(lines: CartLineDto[], type: OrderType) {
    if (!lines.length) return [];
    const ids = [...new Set(lines.filter((l) => l.menuItemId).map((l) => l.menuItemId!))];
    const menuItems = ids.length
      ? await this.prisma.menuItem.findMany({ where: { id: { in: ids } } })
      : [];
    const byId = new Map(menuItems.map((m) => [m.id, m]));
    return lines.map((l) => {
      const base = {
        quantity: l.quantity,
        modifiers: (l.modifiers ?? []) as unknown as Prisma.InputJsonValue,
        notes: l.notes ?? null,
      };
      if (l.menuItemId) {
        const mi = byId.get(l.menuItemId);
        if (!mi) throw new BadRequestException(`Menu item ${l.menuItemId} not found`);
        // Price comes from the DB (authoritative) at the correct tier.
        return {
          ...base,
          menuItemId: mi.id,
          nameSnapshot: mi.name,
          unitPriceCents: this.tierPrice(mi, type),
        };
      }
      // Open item: custom name + price, not linked to the menu.
      if (!l.name || l.unitPriceCents == null)
        throw new BadRequestException('Open item requires a name and price');
      return {
        ...base,
        menuItemId: null,
        nameSnapshot: l.name,
        unitPriceCents: l.unitPriceCents,
      };
    });
  }

  async create(dto: CreateOrderDto) {
    const resolved = await this.resolveLines(dto.items ?? [], dto.type);
    const rates = await this.settings.getRates();
    const totals = computeTotals(resolved, rates);
    const isDineIn = dto.type === 'DINE_IN' && dto.tableId;

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          type: dto.type,
          tableId: dto.tableId ?? null,
          waiterId: dto.waiterId ?? null,
          guestCount: dto.guestCount ?? 1,
          seatedAt: isDineIn ? new Date() : null,
          subtotalCents: totals.subtotalCents,
          serviceChargeCents: totals.serviceChargeCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          items: { create: resolved },
        },
        include: orderInclude,
      });
      if (isDineIn) {
        await tx.restaurantTable.update({
          where: { id: dto.tableId! },
          data: { status: 'OCCUPIED' },
        });
      }
      return created;
    });
    return order;
  }

  findAll(params: { status?: string; today?: boolean }) {
    const where: Prisma.OrderWhereInput = {};
    if (params.status) where.status = params.status as any;
    if (params.today) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      where.createdAt = { gte: start };
    }
    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: orderInclude,
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  // Replace the whole cart and recompute totals. Keeps the order in draft.
  async saveCart(id: string, dto: SaveCartDto) {
    const existing = await this.findOne(id);
    const resolved = await this.resolveLines(dto.items, existing.type);
    const rates = await this.settings.getRates();
    const totals = computeTotals(resolved, {
      ...rates,
      discountCents: dto.discountCents ?? 0,
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      return tx.order.update({
        where: { id },
        data: {
          notes: dto.notes,
          waiterId: dto.waiterId,
          guestCount: dto.guestCount,
          discountCents: dto.discountCents ?? 0,
          subtotalCents: totals.subtotalCents,
          serviceChargeCents: totals.serviceChargeCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          items: { create: resolved },
        },
        include: orderInclude,
      });
    });
  }

  async update(id: string, dto: UpdateOrderDto) {
    await this.findOne(id);
    return this.prisma.order.update({
      where: { id },
      data: dto,
      include: orderInclude,
    });
  }

  // Send to kitchen: flag items and advance status.
  async sendKot(id: string) {
    const order = await this.findOne(id);
    if (order.items.length === 0)
      throw new BadRequestException('Cannot send an empty order to the kitchen');
    await this.prisma.orderItem.updateMany({
      where: { orderId: id, kotStatus: 'PENDING' },
      data: { kotStatus: 'PREPARING' },
    });
    return this.prisma.order.update({
      where: { id },
      data: { status: 'SENT_TO_KITCHEN' },
      include: orderInclude,
    });
  }

  async bill(id: string) {
    const order = await this.findOne(id);
    if (order.items.length === 0)
      throw new BadRequestException('Cannot bill an empty order');
    return this.prisma.order.update({
      where: { id },
      data: { status: 'BILLED', billedAt: order.billedAt ?? new Date() },
      include: orderInclude,
    });
  }

  // Record payment(s), close the order and free the table.
  async pay(id: string, dto: PayDto) {
    const order = await this.findOne(id);
    const paid = dto.payments.reduce((s, p) => s + p.amountCents, 0);
    if (paid < order.totalCents)
      throw new BadRequestException(
        `Payment ${paid} is less than order total ${order.totalCents}`,
      );
    return this.prisma.$transaction(async (tx) => {
      await tx.payment.createMany({
        data: dto.payments.map((p) => ({
          orderId: id,
          method: p.method,
          amountCents: p.amountCents,
        })),
      });
      const now = new Date();
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: now,
          billedAt: order.billedAt ?? now,
        },
        include: orderInclude,
      });
      if (order.tableId) {
        await tx.restaurantTable.update({
          where: { id: order.tableId },
          data: { status: 'AVAILABLE' },
        });
      }
      return updated;
    });
  }

  // Void an un-paid order with a mandatory audit reason (matrix #10).
  async cancel(id: string, dto: VoidDto) {
    const order = await this.findOne(id);
    if (order.status === 'PAID')
      throw new BadRequestException('Paid orders must be refunded, not voided');
    // Audit rule: a void with items requires a documented reason.
    if (order.items.length > 0 && !dto.reason?.trim())
      throw new BadRequestException('A reason is required to void an order with items');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: { status: 'CANCELLED', voidReason: dto.reason?.trim() || 'Discarded draft' },
        include: orderInclude,
      });
      if (order.tableId) {
        await tx.restaurantTable.update({
          where: { id: order.tableId },
          data: { status: 'AVAILABLE' },
        });
      }
      return updated;
    });
  }

  // Refund a paid order (full or partial) with a mandatory reason (matrix #10).
  async refund(id: string, dto: RefundDto) {
    const order = await this.findOne(id);
    if (order.status !== 'PAID')
      throw new BadRequestException('Only paid orders can be refunded');
    const amount = dto.amountCents ?? order.totalCents;
    if (amount > order.totalCents)
      throw new BadRequestException('Refund cannot exceed the order total');
    return this.prisma.order.update({
      where: { id },
      data: {
        status: 'REFUNDED',
        refundReason: dto.reason,
        refundCents: amount,
        refundedAt: new Date(),
      },
      include: orderInclude,
    });
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KdsService {
  constructor(private readonly prisma: PrismaService) {}

  // Active kitchen tickets: fired orders not yet served/closed.
  async tickets() {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: ['SENT_TO_KITCHEN', 'READY'] } },
      orderBy: { kotFiredAt: 'asc' },
      include: {
        table: { select: { name: true } },
        items: { orderBy: { createdAt: 'asc' } },
      },
    });
    return orders.map((o) => ({
      id: o.id,
      number: o.number,
      type: o.type,
      status: o.status,
      table: o.table?.name ?? null,
      firedAt: o.kotFiredAt,
      items: o.items.map((it) => ({
        id: it.id,
        name: it.nameSnapshot,
        quantity: it.quantity,
        modifiers: it.modifiers,
        kotStatus: it.kotStatus,
        notes: it.notes,
      })),
    }));
  }

  // Split view for the token display: processing vs ready (spec §4.2).
  async tokens() {
    const tickets = await this.tickets();
    return {
      processing: tickets.filter((t) => t.status === 'SENT_TO_KITCHEN').map((t) => ({ number: t.number, table: t.table })),
      ready: tickets.filter((t) => t.status === 'READY').map((t) => ({ number: t.number, table: t.table })),
    };
  }

  async markItem(itemId: string, status: 'PREPARING' | 'READY' | 'SERVED') {
    const item = await this.prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item) throw new BadRequestException('Order item not found');
    await this.prisma.orderItem.update({ where: { id: itemId }, data: { kotStatus: status } });
    // If every item on the order is READY, advance the order to READY.
    const remaining = await this.prisma.orderItem.count({
      where: { orderId: item.orderId, kotStatus: { in: ['PENDING', 'PREPARING'] } },
    });
    if (remaining === 0) {
      await this.prisma.order.update({ where: { id: item.orderId }, data: { status: 'READY' } });
    }
    return this.tickets();
  }

  // Bump (complete) a whole ticket off the board.
  async bump(orderId: string) {
    await this.prisma.orderItem.updateMany({ where: { orderId }, data: { kotStatus: 'SERVED' } });
    await this.prisma.order.update({ where: { id: orderId }, data: { status: 'SERVED' } });
    return this.tickets();
  }

  // Chef flags a menu item out of stock from the KDS (matrix #51).
  async outOfStock(menuItemId: string) {
    return this.prisma.menuItem.update({ where: { id: menuItemId }, data: { isAvailable: false } });
  }
}

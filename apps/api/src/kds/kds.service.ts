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
        // Only fired, non-cancelled items belong on the kitchen board.
        items: { where: { cancelledAt: null, kotStatus: { not: 'PENDING' } }, orderBy: { createdAt: 'asc' } },
      },
    });
    return orders
      .filter((o) => o.items.length > 0)
      .map((o) => ({
        id: o.id,
        number: o.number,
        type: o.type,
        status: o.status,
        table: o.table?.name ?? null,
        firedAt: o.kotFiredAt,
        items: o.items.map((it) => ({
          id: it.id,
          menuItemId: it.menuItemId,
          name: it.nameSnapshot,
          quantity: it.quantity,
          modifiers: it.modifiers,
          kotStatus: it.kotStatus,
          station: it.station,
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
    // If every (non-cancelled) item on the order is READY, advance the order.
    const remaining = await this.prisma.orderItem.count({
      where: { orderId: item.orderId, cancelledAt: null, kotStatus: { in: ['PENDING', 'PREPARING'] } },
    });
    if (remaining === 0) {
      await this.prisma.order.update({ where: { id: item.orderId }, data: { status: 'READY' } });
    }
    return this.tickets();
  }

  // Undo an accidental "ready" tap — puts the item back in progress and, if
  // the order had already advanced to READY on the strength of it, reopens
  // the order too so it doesn't quietly fall off a chef's board mid-cook.
  async unmarkItem(itemId: string) {
    const item = await this.prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item) throw new BadRequestException('Order item not found');
    await this.prisma.orderItem.update({ where: { id: itemId }, data: { kotStatus: 'PREPARING' } });
    const order = await this.prisma.order.findUnique({ where: { id: item.orderId } });
    if (order?.status === 'READY') {
      await this.prisma.order.update({ where: { id: item.orderId }, data: { status: 'SENT_TO_KITCHEN' } });
    }
    return this.tickets();
  }

  // Bump (complete) a ticket off the board. With no station, closes the
  // whole order (original behaviour). With a station, only that station's
  // items are marked done — the order itself only closes once every
  // station's items are finished, so e.g. the kitchen finishing first
  // doesn't silently drop the bar's half of the ticket.
  async bump(orderId: string, station?: 'KITCHEN' | 'BAR' | 'BILLING') {
    await this.prisma.orderItem.updateMany({
      where: { orderId, cancelledAt: null, ...(station ? { station } : {}) },
      data: { kotStatus: 'SERVED' },
    });
    const remaining = await this.prisma.orderItem.count({
      where: { orderId, cancelledAt: null, kotStatus: { in: ['PENDING', 'PREPARING'] } },
    });
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: remaining === 0 ? 'SERVED' : 'SENT_TO_KITCHEN' },
    });
    return this.tickets();
  }

  // Chef flags a menu item out of stock from the KDS (matrix #51).
  async outOfStock(menuItemId: string) {
    return this.prisma.menuItem.update({ where: { id: menuItemId }, data: { isAvailable: false } });
  }
}

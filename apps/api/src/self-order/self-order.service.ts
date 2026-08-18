import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TablesService } from '../tables/tables.service';
import { OrdersService } from '../orders/orders.service';
import { SettingsService } from '../settings/settings.service';
import { SmsService } from '../notifications/sms.service';
import { CartLineDto } from '../orders/dto/order.dto';

// Public, unauthenticated surface for QR table ordering — a guest scans a
// table's QR code (resolves to a table via its opaque qrToken, never the
// real table id) and can browse the live menu, order, call the waiter, and
// watch the order status, all without a staff login. Money-affecting write
// paths (discounts, complimentary, void, payment) are intentionally NOT
// exposed here — those still require a staff session at the counter.
@Injectable()
export class SelfOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tables: TablesService,
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
    private readonly sms: SmsService,
  ) {}

  private openOrderForTable(tableId: string) {
    return this.prisma.order.findFirst({
      where: { tableId, status: { notIn: ['PAID', 'CANCELLED'] } },
      orderBy: { createdAt: 'desc' },
      include: { items: { where: { cancelledAt: null }, orderBy: { createdAt: 'asc' } } },
    });
  }

  async menuFor(token: string) {
    const table = await this.tables.findByQrToken(token);
    const settings = await this.settings.get();
    if (!settings.features.selfOrder) throw new ForbiddenException('Self-ordering is currently switched off for this restaurant');
    const [categories, items, order] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.menuItem.findMany({
        where: { isAvailable: true },
        orderBy: { name: 'asc' },
        include: {
          variants: { orderBy: { sortOrder: 'asc' } },
          modifierGroups: { include: { modifiers: true } },
        },
      }),
      this.openOrderForTable(table.id),
    ]);
    return {
      table: { id: table.id, name: table.name, area: table.area },
      categories,
      items,
      order,
      restaurantName: settings.restaurantName,
      currencySymbol: settings.currencySymbol,
    };
  }

  async currentOrder(token: string) {
    const table = await this.tables.findByQrToken(token);
    return this.openOrderForTable(table.id);
  }

  // Submit new items from a guest's device — starts the table's order if
  // none is open yet, appends to it otherwise, and fires the KOT immediately
  // (there's no waiter present to tap "fire").
  async submitItems(token: string, items: CartLineDto[], customerName?: string, customerPhone?: string) {
    if (!items?.length) throw new BadRequestException('No items to send');
    const table = await this.tables.findByQrToken(token);
    const order = await this.openOrderForTable(table.id);
    let orderId: string;
    if (!order) {
      const created = await this.orders.create({ type: 'DINE_IN', tableId: table.id, items, customerName, customerPhone });
      await this.prisma.order.update({ where: { id: created.id }, data: { source: 'SELF_ORDER' } });
      orderId = created.id;
      if (customerPhone) {
        this.sms.send(customerPhone, `Thanks${customerName ? ` ${customerName}` : ''}! Order #${created.number} received — we'll text you when it's ready.`).catch(() => {});
      }
    } else {
      const existingLines = order.items.map((i) => ({
        id: i.id,
        quantity: i.quantity,
        notes: i.notes ?? undefined,
        modifiers: Array.isArray(i.modifiers) ? (i.modifiers as any) : undefined,
        discountCents: i.discountCents,
      }));
      const updated = await this.orders.saveCart(order.id, { items: [...existingLines, ...items] });
      orderId = updated.id;
    }
    // Fires straight into the normal silent auto-print queue, same as a
    // staff-fired KOT — no staff review/acknowledge step first.
    const { order: updatedOrder } = await this.orders.sendKot(orderId);
    return updatedOrder;
  }

  async callWaiter(token: string) {
    const table = await this.tables.findByQrToken(token);
    return this.tables.createWaiterCall(table.id);
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeTotals } from '../common/settings';
import { SettingsService } from '../settings/settings.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import { CrmService } from '../crm/crm.service';
import type { TokenPayload } from '../common/token';
import { ForbiddenException } from '@nestjs/common';
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
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    private readonly crm: CrmService,
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
        discountCents: l.discountCents ?? 0,
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
          station: mi.station, // KOT/BOT/Billing routing snapshot
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
        station: 'BILLING' as const,
      };
    });
  }

  async create(dto: CreateOrderDto) {
    const resolved = await this.resolveLines(dto.items ?? [], dto.type);
    const rates = await this.settings.getRates();
    const totals = computeTotals(resolved, rates);
    const isDineIn = dto.type === 'DINE_IN' && dto.tableId;

    // Max-occupancy guard (matrix #36).
    if (isDineIn) {
      const table = await this.prisma.restaurantTable.findUnique({
        where: { id: dto.tableId! },
      });
      if (table && dto.guestCount && dto.guestCount > table.seats)
        throw new BadRequestException(
          `Table ${table.name} seats ${table.seats}; cannot seat ${dto.guestCount} guests`,
        );
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          type: dto.type,
          tableId: dto.tableId ?? null,
          waiterId: dto.waiterId ?? null,
          guestCount: dto.guestCount ?? 1,
          customerName: dto.customerName ?? null,
          customerPhone: dto.customerPhone ?? null,
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

  // Reconcile the cart: keep already-fired items (preserving KOT status),
  // update quantities/notes on existing lines, add new lines as PENDING, and
  // delete only removed UNFIRED lines. Enables incremental KOT + item cancel.
  async saveCart(id: string, dto: SaveCartDto) {
    const existing = await this.findOne(id);
    const existingById = new Map(existing.items.map((i) => [i.id, i]));
    const incomingIds = new Set(dto.items.filter((l) => l.id).map((l) => l.id!));

    // Resolve pricing/station for the genuinely new lines only.
    const newLines = dto.items.filter((l) => !l.id || !existingById.has(l.id));
    const resolvedNew = await this.resolveLines(newLines, existing.type);

    return this.prisma.$transaction(async (tx) => {
      // Remove lines the user deleted — but only if never fired & not cancelled.
      for (const ex of existing.items) {
        if (!incomingIds.has(ex.id) && ex.kotStatus === 'PENDING' && !ex.cancelledAt) {
          await tx.orderItem.delete({ where: { id: ex.id } });
        }
      }
      // Update existing matched lines (qty/notes/modifiers) — keep KOT status.
      for (const line of dto.items) {
        if (line.id && existingById.has(line.id)) {
          await tx.orderItem.update({
            where: { id: line.id },
            data: {
              quantity: line.quantity,
              discountCents: line.discountCents ?? 0,
              notes: line.notes ?? null,
              modifiers: (line.modifiers ?? []) as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }
      // Create new lines as PENDING.
      let ni = 0;
      for (const line of dto.items) {
        if (!line.id || !existingById.has(line.id)) {
          await tx.orderItem.create({ data: { orderId: id, ...resolvedNew[ni] } });
          ni++;
        }
      }
      // Recompute from non-cancelled items.
      const rates = await this.settings.getRates();
      const items = await tx.orderItem.findMany({ where: { orderId: id, cancelledAt: null } });
      const totals = computeTotals(items, { ...rates, discountCents: dto.discountCents ?? 0 });
      await tx.order.update({
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
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
    });
  }

  // Cancel a single order item (prints a cancellation KOT if already fired).
  async cancelItem(orderId: string, itemId: string, reason: string, actor?: TokenPayload) {
    const order = await this.findOne(orderId);
    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw new BadRequestException('Item not on this order');
    if (item.cancelledAt) throw new BadRequestException('Item already cancelled');
    const wasFired = item.kotStatus !== 'PENDING';
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: itemId },
        data: { cancelledAt: new Date(), cancelReason: reason },
      });
      await this.recompute(tx, orderId);
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
    await this.audit.log(actor ?? null, 'CANCEL_ITEM', `Order #${order.number} — ${item.quantity}× ${item.nameSnapshot} (${reason})`);
    return { order: updated, cancelledItem: item, wasFired };
  }

  async update(id: string, dto: UpdateOrderDto) {
    await this.findOne(id);
    return this.prisma.order.update({
      where: { id },
      data: dto,
      include: orderInclude,
    });
  }

  // Incremental KOT: fire only the not-yet-fired (PENDING) items and return
  // exactly those so the client prints KOT/BOT for the new items only.
  async sendKot(id: string) {
    const order = await this.findOne(id);
    const pending = order.items.filter((i) => i.kotStatus === 'PENDING' && !i.cancelledAt);
    if (pending.length === 0)
      throw new BadRequestException('No new items to fire to the kitchen');
    await this.prisma.orderItem.updateMany({
      where: { orderId: id, kotStatus: 'PENDING', cancelledAt: null },
      data: { kotStatus: 'PREPARING' },
    });
    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: 'SENT_TO_KITCHEN', kotFiredAt: order.kotFiredAt ?? new Date() },
      include: orderInclude,
    });
    // fired items carry station so the POS can split KOT (kitchen) vs BOT (bar).
    return { order: updated, fired: pending };
  }

  async bill(id: string) {
    const order = await this.findOne(id);
    if (order.items.filter((i) => !i.cancelledAt).length === 0)
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
      // Redeem loyalty points first (guards balance), then award on this sale.
      if (dto.redeemPoints)
        await this.crm.redeem(tx, dto.customerPhone ?? order.customerPhone, dto.redeemPoints, id);
      // Deduct recipe ingredients from stock on sale (matrix #56).
      await this.inventory.deductForOrder(tx, id);
      // Roll up loyalty / CRM stats for the customer (matrix #111).
      await this.crm.recordSale(tx, updated);
      // Credit-tender amounts become the customer's outstanding balance.
      const creditCents = dto.payments.filter((p) => p.method === 'CREDIT').reduce((s, p) => s + p.amountCents, 0);
      if (creditCents > 0) {
        const withCust = await tx.order.findUniqueOrThrow({ where: { id }, select: { customerId: true } });
        if (withCust.customerId) await this.crm.addCredit(tx, withCust.customerId, creditCents);
      }
      // Return the fresh row so redeemedPoints / customerId are reflected.
      return tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
    });
  }

  // Attach (or create) a customer to an order while billing.
  async attachCustomer(id: string, dto: { name?: string; phone: string }) {
    await this.findOne(id);
    const cust = await this.crm.upsertByPhone(dto.name, dto.phone);
    return this.prisma.order.update({
      where: { id },
      data: { customerId: cust.id, customerName: cust.name, customerPhone: cust.phone },
      include: orderInclude,
    });
  }

  // Void an un-paid order with a mandatory audit reason (matrix #10).
  async cancel(id: string, dto: VoidDto, actor?: TokenPayload) {
    const order = await this.findOne(id);
    if (order.status === 'PAID')
      throw new BadRequestException('Paid orders must be refunded, not voided');
    // Voiding an order that has items needs a documented reason AND the void
    // permission (empty drafts can be discarded freely).
    if (order.items.length > 0) {
      if (!dto.reason?.trim())
        throw new BadRequestException('A reason is required to void an order with items');
      if (!actor?.canVoid)
        throw new ForbiddenException('Voiding an order requires the "canVoid" permission');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
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
      return u;
    });
    if (order.items.length > 0)
      await this.audit.log(actor ?? null, 'VOID', `Order #${order.number} — ${dto.reason?.trim()}`);
    return updated;
  }

  // Refund a paid order (full or partial) with a mandatory reason (matrix #10).
  async refund(id: string, dto: RefundDto, actor?: TokenPayload) {
    const order = await this.findOne(id);
    if (order.status !== 'PAID')
      throw new BadRequestException('Only paid orders can be refunded');
    const amount = dto.amountCents ?? order.totalCents;
    if (amount > order.totalCents)
      throw new BadRequestException('Refund cannot exceed the order total');
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: 'REFUNDED',
        refundReason: dto.reason,
        refundCents: amount,
        refundedAt: new Date(),
      },
      include: orderInclude,
    });
    await this.audit.log(actor ?? null, 'REFUND', `Order #${order.number} — ${dto.reason} (${amount})`);
    return updated;
  }

  // Recompute an order's money snapshots from its current items + rates.
  private async recompute(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { where: { cancelledAt: null } } },
    });
    const rates = await this.settings.getRates();
    const totals = computeTotals(order.items, {
      ...rates,
      discountCents: order.discountCents,
    });
    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotalCents: totals.subtotalCents,
        serviceChargeCents: totals.serviceChargeCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
      },
    });
  }

  // Move an open order to another table (matrix #31).
  async transfer(id: string, newTableId: string) {
    const order = await this.findOne(id);
    if (['PAID', 'CANCELLED', 'REFUNDED'].includes(order.status))
      throw new BadRequestException('Only active orders can be transferred');
    const newTable = await this.prisma.restaurantTable.findUnique({
      where: { id: newTableId },
    });
    if (!newTable) throw new BadRequestException('Target table not found');
    if (newTable.status === 'OCCUPIED' && order.tableId !== newTableId)
      throw new BadRequestException(`Table ${newTable.name} is occupied`);
    return this.prisma.$transaction(async (tx) => {
      if (order.tableId && order.tableId !== newTableId)
        await tx.restaurantTable.update({
          where: { id: order.tableId },
          data: { status: 'AVAILABLE' },
        });
      await tx.restaurantTable.update({
        where: { id: newTableId },
        data: { status: 'OCCUPIED' },
      });
      return tx.order.update({
        where: { id },
        data: { tableId: newTableId, type: 'DINE_IN' },
        include: orderInclude,
      });
    });
  }

  // Merge another order's items into this one, then void the source (#28).
  async merge(targetId: string, fromId: string) {
    if (targetId === fromId)
      throw new BadRequestException('Cannot merge an order into itself');
    const target = await this.findOne(targetId);
    const from = await this.findOne(fromId);
    for (const o of [target, from])
      if (['PAID', 'CANCELLED', 'REFUNDED'].includes(o.status))
        throw new BadRequestException('Only active orders can be merged');
    return this.prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: { orderId: fromId },
        data: { orderId: targetId },
      });
      await tx.order.update({
        where: { id: fromId },
        data: { status: 'CANCELLED', voidReason: `Merged into #${target.number}` },
      });
      if (from.tableId && from.tableId !== target.tableId)
        await tx.restaurantTable.update({
          where: { id: from.tableId },
          data: { status: 'AVAILABLE' },
        });
      await this.recompute(tx, targetId);
      return tx.order.findUniqueOrThrow({ where: { id: targetId }, include: orderInclude });
    });
  }

  // Move selected items from this order to another table (item-level transfer).
  // If the target table has no open order, a new one is started there.
  async transferItems(id: string, dto: { itemIds: string[]; targetTableId: string }, actor?: TokenPayload) {
    const source = await this.findOne(id);
    if (['PAID', 'CANCELLED', 'REFUNDED'].includes(source.status))
      throw new BadRequestException('Only active orders can be transferred from');
    const items = source.items.filter((i) => dto.itemIds.includes(i.id) && !i.cancelledAt);
    if (!items.length) throw new BadRequestException('No valid items to transfer');
    const targetTable = await this.prisma.restaurantTable.findUnique({ where: { id: dto.targetTableId } });
    if (!targetTable) throw new BadRequestException('Target table not found');
    if (source.tableId === dto.targetTableId) throw new BadRequestException('Items are already on that table');

    const result = await this.prisma.$transaction(async (tx) => {
      let target = await tx.order.findFirst({
        where: { tableId: dto.targetTableId, status: { notIn: ['PAID', 'CANCELLED', 'REFUNDED'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (!target) {
        target = await tx.order.create({
          data: { type: 'DINE_IN', tableId: dto.targetTableId, seatedAt: new Date(), waiterId: source.waiterId },
        });
        await tx.restaurantTable.update({ where: { id: dto.targetTableId }, data: { status: 'OCCUPIED' } });
      }
      await tx.orderItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { orderId: target.id } });
      await this.recompute(tx, id);
      await this.recompute(tx, target.id);
      return {
        source: await tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude }),
        target: await tx.order.findUniqueOrThrow({ where: { id: target.id }, include: orderInclude }),
      };
    });
    await this.audit.log(actor ?? null, 'TRANSFER_ITEMS', `${items.length} item(s) from #${source.number} → ${targetTable.name}`);
    return result;
  }
}

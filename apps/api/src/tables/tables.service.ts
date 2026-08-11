import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TableStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OutletsService } from '../outlets/outlets.service';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outlets: OutletsService,
  ) {}

  // Returns tables plus their current open order (if any) so the floor
  // view can show live occupancy in one call. outletId (multi-outlet, Phase
  // 3) scopes the floor plan to one location; omitted = every table
  // (single-outlet tenants, unchanged).
  async findAll(outletId?: string, includeInactive?: boolean) {
    const tables = await this.prisma.restaurantTable.findMany({
      where: { ...(outletId ? { outletId } : {}), ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ area: 'asc' }, { name: 'asc' }],
      include: {
        orders: {
          where: { status: { notIn: ['PAID', 'CANCELLED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            number: true,
            totalCents: true,
            guestCount: true,
            seatedAt: true,
            status: true,
            _count: { select: { items: { where: { cancelledAt: null } } } },
          },
        },
      },
    });
    return tables.map((t) => {
      const { orders, ...rest } = t;
      const active = orders[0] ?? null;
      const hasItems = !!active && (active as any)._count?.items > 0;
      // An "occupied" table with an empty order shows as available — starting
      // a new order there re-uses the empty one server-side.
      const status = rest.status === 'OCCUPIED' && !hasItems ? 'AVAILABLE' : rest.status;
      return { ...rest, status, activeOrder: hasItems ? active : null };
    });
  }

  // Group tables by area for the floor plan.
  async findByArea(outletId?: string, includeInactive?: boolean) {
    const tables = await this.findAll(outletId, includeInactive);
    const areas: Record<string, typeof tables> = {};
    for (const t of tables) {
      const key = t.area ?? 'Unassigned';
      (areas[key] ??= []).push(t);
    }
    return Object.entries(areas).map(([area, tables]) => ({ area, tables }));
  }

  async create(data: { name: string; seats?: number; area?: string; isVip?: boolean; outletId?: string }) {
    return this.prisma.restaurantTable.create({
      data: { ...data, outletId: data.outletId ?? (await this.outlets.defaultOutletId()) },
    });
  }

  // Persist many table positions in one transaction (floor-plan save).
  async saveLayout(positions: { id: string; posX: number; posY: number }[]) {
    await this.prisma.$transaction(
      positions.map((p) =>
        this.prisma.restaurantTable.update({
          where: { id: p.id },
          data: { posX: p.posX, posY: p.posY },
        }),
      ),
    );
    return { saved: positions.length };
  }

  async update(
    id: string,
    data: {
      name?: string;
      seats?: number;
      area?: string;
      status?: TableStatus;
      isVip?: boolean;
      isActive?: boolean;
      posX?: number;
      posY?: number;
    },
  ) {
    const table = await this.prisma.restaurantTable.findUnique({ where: { id } });
    if (!table) throw new NotFoundException(`Table ${id} not found`);
    return this.prisma.restaurantTable.update({ where: { id }, data });
  }

  // A table with any order/reservation history can't be hard-deleted
  // (those foreign keys aren't cascading, by design — old orders must keep
  // pointing at a real row for reporting) and shouldn't be while genuinely
  // in use right now either. So: block outright if there's a live order;
  // soft-delete (hide from normal lists, keep the row) if it has history;
  // hard-delete only a table that was never actually used.
  async remove(id: string) {
    const table = await this.prisma.restaurantTable.findUnique({ where: { id } });
    if (!table) throw new NotFoundException(`Table ${id} not found`);
    const activeOrder = await this.prisma.order.findFirst({
      where: { tableId: id, status: { notIn: ['PAID', 'CANCELLED'] } },
    });
    if (activeOrder) throw new BadRequestException('This table has an open order — close or cancel it before deleting the table');
    const [orderCount, reservationCount] = await Promise.all([
      this.prisma.order.count({ where: { tableId: id } }),
      this.prisma.reservation.count({ where: { tableId: id } }),
    ]);
    if (orderCount > 0 || reservationCount > 0) {
      return this.prisma.restaurantTable.update({ where: { id }, data: { isActive: false } });
    }
    return this.prisma.restaurantTable.delete({ where: { id } });
  }

  // ── Area management — "area" is just a free-text field on each table
  // (no separate Area entity), so renaming/dissolving one is a bulk update
  // across every table currently tagged with that name. ──
  async listAreas(outletId?: string) {
    const tables = await this.prisma.restaurantTable.findMany({
      where: { ...(outletId ? { outletId } : {}), isActive: true },
      select: { area: true },
    });
    const counts = new Map<string, number>();
    for (const t of tables) {
      const key = t.area?.trim() || 'Unassigned';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].map(([area, tableCount]) => ({ area, tableCount })).sort((a, b) => a.area.localeCompare(b.area));
  }

  async renameArea(name: string, newName: string, outletId?: string) {
    if (!newName?.trim()) throw new BadRequestException('New area name is required');
    const where = { area: name, ...(outletId ? { outletId } : {}) };
    const { count } = await this.prisma.restaurantTable.updateMany({ where, data: { area: newName.trim() } });
    if (count === 0) throw new NotFoundException(`No tables found in area "${name}"`);
    return { renamed: count };
  }

  // "Deleting" an area just un-tags its tables (moves them to Unassigned) —
  // the tables themselves aren't touched otherwise.
  async dissolveArea(name: string, outletId?: string) {
    const where = { area: name, ...(outletId ? { outletId } : {}) };
    const { count } = await this.prisma.restaurantTable.updateMany({ where, data: { area: null } });
    if (count === 0) throw new NotFoundException(`No tables found in area "${name}"`);
    return { unassigned: count };
  }

  // ── QR self-ordering ────────────────────────────────
  // Generates a token the first time (idempotent thereafter) so a printed
  // QR code keeps working even if "Get QR" is clicked again.
  async ensureQrToken(id: string) {
    const table = await this.prisma.restaurantTable.findUnique({ where: { id } });
    if (!table) throw new NotFoundException(`Table ${id} not found`);
    if (table.qrToken) return table;
    return this.prisma.restaurantTable.update({ where: { id }, data: { qrToken: randomUUID() } });
  }

  async findByQrToken(token: string) {
    const table = await this.prisma.restaurantTable.findUnique({ where: { qrToken: token } });
    if (!table) throw new NotFoundException('Table not found — this QR code may be out of date');
    return table;
  }

  // ── "Call waiter" (software table buzzer) ───────────
  waiterCalls() {
    return this.prisma.waiterCall.findMany({
      where: { status: { not: 'RESOLVED' } },
      orderBy: { createdAt: 'asc' },
      include: { table: { select: { name: true, area: true } } },
    });
  }

  createWaiterCall(tableId: string) {
    return this.prisma.waiterCall.create({ data: { tableId }, include: { table: { select: { name: true, area: true } } } });
  }

  acknowledgeWaiterCall(id: string) {
    return this.prisma.waiterCall.update({ where: { id }, data: { status: 'ACKNOWLEDGED' } });
  }

  resolveWaiterCall(id: string) {
    return this.prisma.waiterCall.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
  }
}

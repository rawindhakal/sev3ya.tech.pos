import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Outlets = physical locations (multi-outlet, Phase 3). One is always
// isDefault (auto-seeded by migrate-and-backfill-outlets.js) so a
// single-location tenant always has exactly one outlet to fall back to.
@Injectable()
export class OutletsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.outlet.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        terminals: { orderBy: { name: 'asc' } },
        _count: { select: { orders: true, tables: true } },
      },
    });
  }

  private async getOutlet(id: string) {
    const o = await this.prisma.outlet.findUnique({ where: { id } });
    if (!o) throw new NotFoundException(`Outlet ${id} not found`);
    return o;
  }

  // Resolves "the one outlet" for tenants that never set up more than one —
  // used as the final fallback when creating an order with no outlet header
  // and no table (e.g. a takeaway order rung on a device that hasn't been
  // through the outlet/terminal picker yet).
  async defaultOutletId(): Promise<string> {
    const def = await this.prisma.outlet.findFirst({ where: { isDefault: true } });
    if (def) return def.id;
    const any = await this.prisma.outlet.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
    if (!any) throw new BadRequestException('No outlet is configured for this restaurant');
    return any.id;
  }

  create(dto: { name: string; address?: string; phone?: string; taxId?: string; receiptHeader?: string; receiptFooter?: string }) {
    if (!dto.name?.trim()) throw new BadRequestException('Outlet name is required');
    return this.prisma.outlet.create({
      data: {
        name: dto.name.trim(),
        address: dto.address?.trim() || null,
        phone: dto.phone?.trim() || null,
        taxId: dto.taxId?.trim() || null,
        receiptHeader: dto.receiptHeader?.trim() || null,
        receiptFooter: dto.receiptFooter?.trim() || null,
      },
      include: { terminals: true },
    });
  }

  async update(
    id: string,
    dto: { name?: string; address?: string; phone?: string; taxId?: string; receiptHeader?: string; receiptFooter?: string; isActive?: boolean },
  ) {
    const outlet = await this.getOutlet(id);
    if (outlet.isDefault && dto.isActive === false) {
      throw new BadRequestException('The default outlet cannot be deactivated — mark another outlet as default first');
    }
    return this.prisma.outlet.update({
      where: { id },
      data: {
        name: dto.name?.trim() || undefined,
        address: dto.address !== undefined ? dto.address?.trim() || null : undefined,
        phone: dto.phone !== undefined ? dto.phone?.trim() || null : undefined,
        taxId: dto.taxId !== undefined ? dto.taxId?.trim() || null : undefined,
        receiptHeader: dto.receiptHeader !== undefined ? dto.receiptHeader?.trim() || null : undefined,
        receiptFooter: dto.receiptFooter !== undefined ? dto.receiptFooter?.trim() || null : undefined,
        isActive: dto.isActive,
      },
      include: { terminals: true },
    });
  }

  async remove(id: string) {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id },
      include: { _count: { select: { orders: true, tables: true, terminals: true } } },
    });
    if (!outlet) throw new NotFoundException(`Outlet ${id} not found`);
    if (outlet.isDefault) throw new BadRequestException('The default outlet cannot be removed');
    if (outlet.isActive) {
      const activeCount = await this.prisma.outlet.count({ where: { isActive: true } });
      if (activeCount <= 1) throw new BadRequestException('At least one active outlet is required');
    }
    const hasHistory = outlet._count.orders > 0 || outlet._count.tables > 0 || outlet._count.terminals > 0;
    if (hasHistory) return this.prisma.outlet.update({ where: { id }, data: { isActive: false } });
    return this.prisma.outlet.delete({ where: { id } });
  }

  // ── Terminals (multi-terminal support, nested under an outlet) ──────
  async createTerminal(outletId: string, dto: { name: string }) {
    if (!dto.name?.trim()) throw new BadRequestException('Terminal name is required');
    await this.getOutlet(outletId);
    return this.prisma.terminal.create({ data: { name: dto.name.trim(), outletId } });
  }

  async updateTerminal(id: string, dto: { name?: string; isActive?: boolean }) {
    const t = await this.prisma.terminal.findUnique({ where: { id } });
    if (!t) throw new NotFoundException(`Terminal ${id} not found`);
    return this.prisma.terminal.update({
      where: { id },
      data: { name: dto.name?.trim() || undefined, isActive: dto.isActive },
    });
  }

  async removeTerminal(id: string) {
    const t = await this.prisma.terminal.findUnique({
      where: { id },
      include: { _count: { select: { orders: true, sessions: true } } },
    });
    if (!t) throw new NotFoundException(`Terminal ${id} not found`);
    if (t._count.orders > 0 || t._count.sessions > 0) {
      return this.prisma.terminal.update({ where: { id }, data: { isActive: false } });
    }
    return this.prisma.terminal.delete({ where: { id } });
  }
}

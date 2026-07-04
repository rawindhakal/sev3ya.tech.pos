import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const poInclude = {
  supplier: { select: { id: true, name: true } },
  lines: { include: { ingredient: { select: { name: true, unit: true } } } },
};

@Injectable()
export class PurchasingService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Suppliers (#141) ───────────────────────────────
  suppliers() {
    return this.prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }
  createSupplier(dto: Prisma.SupplierCreateInput) {
    return this.prisma.supplier.create({ data: dto });
  }
  async updateSupplier(id: string, dto: Prisma.SupplierUpdateInput) {
    await this.getSupplier(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }
  async removeSupplier(id: string) {
    await this.getSupplier(id);
    return this.prisma.supplier.update({ where: { id }, data: { isActive: false } });
  }
  private async getSupplier(id: string) {
    const s = await this.prisma.supplier.findUnique({ where: { id } });
    if (!s) throw new NotFoundException(`Supplier ${id} not found`);
    return s;
  }

  // ── Purchase orders ────────────────────────────────
  orders(status?: string) {
    return this.prisma.purchaseOrder.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      include: poInclude,
    });
  }
  async order(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: poInclude });
    if (!po) throw new NotFoundException(`PO ${id} not found`);
    return po;
  }

  createOrder(dto: {
    supplierId: string;
    notes?: string;
    lines: { ingredientId: string; quantity: number; unitCostCents: number }[];
  }) {
    if (!dto.lines?.length) throw new BadRequestException('A PO needs at least one line');
    return this.prisma.purchaseOrder.create({
      data: {
        supplierId: dto.supplierId,
        notes: dto.notes,
        lines: { create: dto.lines },
      },
      include: poInclude,
    });
  }

  // Mark a draft as ordered (sent to vendor).
  async markOrdered(id: string) {
    const po = await this.order(id);
    if (po.status !== 'DRAFT') throw new BadRequestException('Only draft POs can be ordered');
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'ORDERED', orderedAt: new Date() },
      include: poInclude,
    });
  }

  // GRN: receive quantities against a PO, add stock, log movements. Supports
  // split delivery (#146) — partial receipts keep the PO open.
  async receive(id: string, receipts: { lineId: string; receiveQty: number }[]) {
    const po = await this.order(id);
    if (!['ORDERED', 'PARTIAL'].includes(po.status))
      throw new BadRequestException('PO must be ordered (and not closed) before receiving');

    return this.prisma.$transaction(async (tx) => {
      for (const r of receipts) {
        if (r.receiveQty <= 0) continue;
        const line = po.lines.find((l) => l.id === r.lineId);
        if (!line) throw new BadRequestException(`Line ${r.lineId} not on this PO`);
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { receivedQty: { increment: r.receiveQty } },
        });
        await tx.ingredient.update({
          where: { id: line.ingredientId },
          data: { stockQty: { increment: r.receiveQty }, costPerUnitCents: line.unitCostCents },
        });
        await tx.stockMovement.create({
          data: {
            ingredientId: line.ingredientId,
            type: 'PURCHASE',
            quantity: r.receiveQty,
            reason: `GRN · PO #${po.number}`,
          },
        });
      }
      // Recompute status: fully received vs partial.
      const lines = await tx.purchaseOrderLine.findMany({ where: { poId: id } });
      const allIn = lines.every((l) => l.receivedQty >= l.quantity);
      const status = allIn ? 'RECEIVED' : 'PARTIAL';
      return tx.purchaseOrder.update({
        where: { id },
        data: { status, receivedAt: allIn ? new Date() : null },
        include: poInclude,
      });
    });
  }

  async cancel(id: string) {
    const po = await this.order(id);
    if (po.status === 'RECEIVED') throw new BadRequestException('Cannot cancel a received PO');
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' }, include: poInclude });
  }

  // Auto-generate draft POs from low-stock ingredients (#150), grouped by
  // their assigned supplier. Suggested qty tops stock back up to 2× reorder.
  async autoGenerate() {
    const low = await this.prisma.ingredient.findMany({
      where: { supplierId: { not: null } },
    });
    const deficit = low.filter((i) => i.stockQty <= i.reorderLevel);
    if (!deficit.length) return { created: 0, orders: [] as any[], message: 'No low-stock items with an assigned supplier.' };

    const bySupplier = new Map<string, typeof deficit>();
    for (const i of deficit) {
      const arr = bySupplier.get(i.supplierId!) ?? [];
      arr.push(i);
      bySupplier.set(i.supplierId!, arr);
    }
    const created: any[] = [];
    for (const [supplierId, items] of bySupplier) {
      const po = await this.prisma.purchaseOrder.create({
        data: {
          supplierId,
          notes: 'Auto-generated from stock deficits',
          lines: {
            create: items.map((i) => ({
              ingredientId: i.id,
              quantity: Math.max(i.reorderLevel * 2 - i.stockQty, i.reorderLevel || 1),
              unitCostCents: i.costPerUnitCents,
            })),
          },
        },
        include: poInclude,
      });
      created.push(po);
    }
    return { created: created.length, orders: created };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PostingService } from '../accounting/posting.service';
import { ACCOUNT_CODES } from '../accounting/default-accounts';

const poInclude = {
  supplier: { select: { id: true, name: true } },
  lines: { include: { ingredient: { select: { name: true, unit: true } } } },
};

@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
  ) {}

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
      // Value received in THIS call only — receive() can be called more than
      // once for a split delivery, so posting the PO's full value here would
      // double-count whatever an earlier partial receipt already posted.
      let receivedValueCents = 0;
      for (const r of receipts) {
        if (r.receiveQty <= 0) continue;
        const line = po.lines.find((l) => l.id === r.lineId);
        if (!line) throw new BadRequestException(`Line ${r.lineId} not on this PO`);
        receivedValueCents += Math.round(r.receiveQty * line.unitCostCents);
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

      if (receivedValueCents > 0) {
        const acctId = await this.posting.accountIdsByCode(tx, [ACCOUNT_CODES.PURCHASES, ACCOUNT_CODES.CREDITORS]);
        await this.posting.postOrQueue(tx, {
          event: 'PURCHASE_RECEIPT',
          amountCents: receivedValueCents,
          narration: `Goods received — PO #${po.number} (${po.supplier.name})`,
          lines: [
            { accountId: acctId[ACCOUNT_CODES.PURCHASES], drCents: receivedValueCents },
            { accountId: acctId[ACCOUNT_CODES.CREDITORS], crCents: receivedValueCents },
          ],
          sourceId: po.id,
        });
      }

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

  // ── Vendor payment ledger (owner checklist Part 3) ───
  // How much we've actually paid each supplier vs. what we owe for goods
  // already received — "due" is the receivable liability, not the full
  // ordered value (goods still in transit aren't owed yet).
  async vendorLedger() {
    const [suppliers, receivedLines, payments] = await Promise.all([
      this.prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      this.prisma.purchaseOrderLine.findMany({
        where: { po: { status: { in: ['RECEIVED', 'PARTIAL'] } } },
        select: { receivedQty: true, unitCostCents: true, po: { select: { supplierId: true } } },
      }),
      this.prisma.supplierPayment.groupBy({ by: ['supplierId'], _sum: { amountCents: true } }),
    ]);
    const receivedBySupplier = new Map<string, number>();
    for (const l of receivedLines) {
      const v = Math.round(l.receivedQty * l.unitCostCents);
      receivedBySupplier.set(l.po.supplierId, (receivedBySupplier.get(l.po.supplierId) ?? 0) + v);
    }
    const paidBySupplier = new Map(payments.map((p) => [p.supplierId, p._sum.amountCents ?? 0]));
    return suppliers.map((s) => {
      const receivedValueCents = receivedBySupplier.get(s.id) ?? 0;
      const paidCents = paidBySupplier.get(s.id) ?? 0;
      return {
        supplierId: s.id,
        supplierName: s.name,
        receivedValueCents,
        paidCents,
        dueCents: receivedValueCents - paidCents,
      };
    });
  }

  supplierPayments(supplierId: string) {
    return this.prisma.supplierPayment.findMany({ where: { supplierId }, orderBy: { createdAt: 'desc' } });
  }

  async recordPayment(supplierId: string, dto: { amountCents: number; method?: string; note?: string }) {
    const supplier = await this.getSupplier(supplierId);
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.create({
        data: { supplierId, amountCents: dto.amountCents, method: dto.method, note: dto.note },
      });
      const acctId = await this.posting.accountIdsByCode(tx, [ACCOUNT_CODES.CREDITORS, ACCOUNT_CODES.CASH, ACCOUNT_CODES.BANK]);
      // dto.method is free-text (not the PaymentMethod enum) — loose match.
      const isCash = /cash/i.test(dto.method ?? '');
      await this.posting.postOrQueue(tx, {
        event: 'SUPPLIER_PAYMENT',
        amountCents: dto.amountCents,
        narration: `Payment to ${supplier.name}${dto.note ? ` — ${dto.note}` : ''}`,
        lines: [
          { accountId: acctId[ACCOUNT_CODES.CREDITORS], drCents: dto.amountCents },
          { accountId: isCash ? acctId[ACCOUNT_CODES.CASH] : acctId[ACCOUNT_CODES.BANK], crCents: dto.amountCents },
        ],
        sourceId: supplierId,
      });
      return payment;
    });
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

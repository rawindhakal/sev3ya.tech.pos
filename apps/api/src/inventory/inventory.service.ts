import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Ingredients ────────────────────────────────────
  async ingredients() {
    const list = await this.prisma.ingredient.findMany({ orderBy: { name: 'asc' } });
    return list.map((i) => ({
      ...i,
      lowStock: i.stockQty <= i.reorderLevel,
      valuationCents: Math.round(i.stockQty * i.costPerUnitCents),
    }));
  }

  createIngredient(dto: {
    name: string;
    unit?: string;
    stockQty?: number;
    reorderLevel?: number;
    costPerUnitCents?: number;
  }) {
    return this.prisma.ingredient.create({ data: dto });
  }

  async updateIngredient(id: string, dto: Prisma.IngredientUncheckedUpdateInput) {
    await this.getIngredient(id);
    return this.prisma.ingredient.update({ where: { id }, data: dto });
  }

  async removeIngredient(id: string) {
    await this.getIngredient(id);
    return this.prisma.ingredient.delete({ where: { id } });
  }

  private async getIngredient(id: string) {
    const i = await this.prisma.ingredient.findUnique({ where: { id } });
    if (!i) throw new NotFoundException(`Ingredient ${id} not found`);
    return i;
  }

  // ── Stock movements ────────────────────────────────
  // Purchase (+), wastage (−), or manual adjustment (signed). If no
  // warehouseId is given, the movement lands in the default "Main Store"
  // warehouse — this keeps single-location restaurants working exactly as
  // before while still maintaining the invariant that Ingredient.stockQty
  // always equals the sum of that ingredient's WarehouseStock rows.
  async movement(id: string, dto: { type: StockMovementType; quantity: number; reason?: string; warehouseId?: string }) {
    await this.getIngredient(id);
    let delta = dto.quantity;
    if (dto.type === 'WASTAGE') delta = -Math.abs(dto.quantity);
    if (dto.type === 'PURCHASE') delta = Math.abs(dto.quantity);
    return this.prisma.$transaction(async (tx) => {
      const warehouseId = dto.warehouseId ?? (await tx.warehouse.findFirst({ where: { isDefault: true } }))?.id;
      await tx.ingredient.update({ where: { id }, data: { stockQty: { increment: delta } } });
      if (warehouseId) {
        await tx.warehouseStock.upsert({
          where: { warehouseId_ingredientId: { warehouseId, ingredientId: id } },
          create: { warehouseId, ingredientId: id, qty: delta },
          update: { qty: { increment: delta } },
        });
      }
      await tx.stockMovement.create({
        data: { ingredientId: id, type: dto.type, quantity: delta, reason: dto.reason, warehouseId },
      });
      return tx.ingredient.findUniqueOrThrow({ where: { id } });
    });
  }

  // Physical stock-take (#59): set counted qty, log the variance. With a
  // warehouseId, the count applies to just that location (variance measured
  // against its previous per-warehouse qty); without one, defaults to the
  // Main Store warehouse — same backward-compatible default as movement().
  async stockTake(id: string, countedQty: number, reason?: string, warehouseId?: string) {
    const ing = await this.getIngredient(id);
    return this.prisma.$transaction(async (tx) => {
      const wid = warehouseId ?? (await tx.warehouse.findFirst({ where: { isDefault: true } }))?.id;
      let variance: number;
      if (wid) {
        const ws = await tx.warehouseStock.findUnique({ where: { warehouseId_ingredientId: { warehouseId: wid, ingredientId: id } } });
        const prevQty = ws?.qty ?? 0;
        variance = countedQty - prevQty;
        await tx.warehouseStock.upsert({
          where: { warehouseId_ingredientId: { warehouseId: wid, ingredientId: id } },
          create: { warehouseId: wid, ingredientId: id, qty: countedQty },
          update: { qty: countedQty },
        });
      } else {
        variance = countedQty - ing.stockQty;
      }
      await tx.ingredient.update({ where: { id }, data: { stockQty: { increment: variance } } });
      await tx.stockMovement.create({
        data: {
          ingredientId: id,
          type: 'STOCK_TAKE',
          quantity: variance,
          reason: reason ?? `Counted ${countedQty}${ing.unit}`,
          warehouseId: wid,
        },
      });
      return { ingredient: await tx.ingredient.findUniqueOrThrow({ where: { id } }), varianceQty: variance };
    });
  }

  // ── Warehouses (multi-location stock) ──────────────
  async warehouses() {
    const list = await this.prisma.warehouse.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { stocks: { include: { ingredient: { select: { costPerUnitCents: true } } } } },
    });
    return list.map((w) => {
      const itemCount = w.stocks.length;
      const valuationCents = w.stocks.reduce((s, ws) => s + Math.round(ws.qty * ws.ingredient.costPerUnitCents), 0);
      const { stocks, ...rest } = w;
      return { ...rest, itemCount, valuationCents };
    });
  }

  createWarehouse(dto: { name: string; address?: string }) {
    return this.prisma.warehouse.create({ data: dto });
  }

  async updateWarehouse(id: string, dto: { name?: string; address?: string; isActive?: boolean }) {
    await this.getWarehouse(id);
    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  async removeWarehouse(id: string) {
    const w = await this.getWarehouse(id);
    if (w.isDefault) throw new BadRequestException('Cannot delete the default warehouse');
    const stock = await this.prisma.warehouseStock.aggregate({ where: { warehouseId: id }, _sum: { qty: true } });
    if ((stock._sum.qty ?? 0) > 0.0001) throw new BadRequestException('Transfer out all stock before deleting this warehouse');
    return this.prisma.warehouse.delete({ where: { id } });
  }

  private async getWarehouse(id: string) {
    const w = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!w) throw new NotFoundException(`Warehouse ${id} not found`);
    return w;
  }

  async warehouseStock(id: string) {
    await this.getWarehouse(id);
    const rows = await this.prisma.warehouseStock.findMany({
      where: { warehouseId: id },
      include: { ingredient: { select: { name: true, unit: true, costPerUnitCents: true, reorderLevel: true } } },
      orderBy: { ingredient: { name: 'asc' } },
    });
    return rows.map((r) => ({
      id: r.id,
      ingredientId: r.ingredientId,
      name: r.ingredient.name,
      unit: r.ingredient.unit,
      qty: r.qty,
      lowStock: r.qty <= r.ingredient.reorderLevel,
      valuationCents: Math.round(r.qty * r.ingredient.costPerUnitCents),
    }));
  }

  // Move stock between two warehouses. Only relocates the ingredient's
  // per-warehouse breakdown — Ingredient.stockQty (the global total) is
  // unaffected since nothing left the business, it just changed shelf.
  async transfer(dto: { ingredientId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number; reason?: string }) {
    if (dto.fromWarehouseId === dto.toWarehouseId) throw new BadRequestException('Source and destination warehouses must differ');
    if (dto.quantity <= 0) throw new BadRequestException('Quantity must be positive');
    await this.getIngredient(dto.ingredientId);
    await this.getWarehouse(dto.fromWarehouseId);
    await this.getWarehouse(dto.toWarehouseId);
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.warehouseStock.findUnique({
        where: { warehouseId_ingredientId: { warehouseId: dto.fromWarehouseId, ingredientId: dto.ingredientId } },
      });
      if (!source || source.qty < dto.quantity) {
        throw new BadRequestException(`Not enough stock at source warehouse (have ${source?.qty ?? 0})`);
      }
      await tx.warehouseStock.update({
        where: { warehouseId_ingredientId: { warehouseId: dto.fromWarehouseId, ingredientId: dto.ingredientId } },
        data: { qty: { decrement: dto.quantity } },
      });
      await tx.warehouseStock.upsert({
        where: { warehouseId_ingredientId: { warehouseId: dto.toWarehouseId, ingredientId: dto.ingredientId } },
        create: { warehouseId: dto.toWarehouseId, ingredientId: dto.ingredientId, qty: dto.quantity },
        update: { qty: { increment: dto.quantity } },
      });
      return tx.stockMovement.create({
        data: {
          ingredientId: dto.ingredientId,
          type: 'TRANSFER',
          quantity: dto.quantity,
          reason: dto.reason,
          warehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
        },
      });
    });
  }

  movements(ingredientId?: string) {
    return this.prisma.stockMovement.findMany({
      where: ingredientId ? { ingredientId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { ingredient: { select: { name: true, unit: true } } },
    });
  }

  async valuation() {
    const list = await this.prisma.ingredient.findMany();
    const totalCents = list.reduce((s, i) => s + Math.round(i.stockQty * i.costPerUnitCents), 0);
    const lowStock = list.filter((i) => i.stockQty <= i.reorderLevel).length;
    return { totalValuationCents: totalCents, ingredientCount: list.length, lowStockCount: lowStock };
  }

  // ── Recipe BOM ─────────────────────────────────────
  recipe(menuItemId: string) {
    return this.prisma.recipeItem.findMany({
      where: { menuItemId },
      include: { ingredient: { select: { name: true, unit: true, stockQty: true } } },
    });
  }

  async setRecipeLine(dto: { menuItemId: string; ingredientId: string; quantity: number }) {
    if (dto.quantity <= 0) throw new BadRequestException('Quantity must be positive');
    return this.prisma.recipeItem.upsert({
      where: { menuItemId_ingredientId: { menuItemId: dto.menuItemId, ingredientId: dto.ingredientId } },
      create: dto,
      update: { quantity: dto.quantity },
      include: { ingredient: { select: { name: true, unit: true } } },
    });
  }

  removeRecipeLine(id: string) {
    return this.prisma.recipeItem.delete({ where: { id } });
  }

  // ── Auto-deduction on sale (matrix #56, spec §3.1 Step 4) ──
  // Called inside the payment transaction. Deducts each sold menu item's
  // recipe ingredients from stock and logs the movement.
  async deductForOrder(tx: Prisma.TransactionClient, orderId: string) {
    const items = await tx.orderItem.findMany({
      where: { orderId, menuItemId: { not: null } },
      select: { menuItemId: true, quantity: true, nameSnapshot: true },
    });
    if (!items.length) return;
    const menuIds = [...new Set(items.map((i) => i.menuItemId!))];
    const recipes = await tx.recipeItem.findMany({ where: { menuItemId: { in: menuIds } } });
    if (!recipes.length) return;
    const byMenu = new Map<string, typeof recipes>();
    for (const r of recipes) {
      const arr = byMenu.get(r.menuItemId) ?? [];
      arr.push(r);
      byMenu.set(r.menuItemId, arr);
    }
    // Sale deductions aren't tied to a specific till/warehouse, so they
    // always come out of the default "Main Store" location — same
    // backward-compatible default used by movement()/stockTake().
    const defaultWarehouse = await tx.warehouse.findFirst({ where: { isDefault: true } });
    for (const item of items) {
      for (const r of byMenu.get(item.menuItemId!) ?? []) {
        const consume = r.quantity * item.quantity;
        await tx.ingredient.update({ where: { id: r.ingredientId }, data: { stockQty: { decrement: consume } } });
        if (defaultWarehouse) {
          await tx.warehouseStock.upsert({
            where: { warehouseId_ingredientId: { warehouseId: defaultWarehouse.id, ingredientId: r.ingredientId } },
            create: { warehouseId: defaultWarehouse.id, ingredientId: r.ingredientId, qty: -consume },
            update: { qty: { decrement: consume } },
          });
        }
        await tx.stockMovement.create({
          data: {
            ingredientId: r.ingredientId,
            type: 'SALE_DEDUCTION',
            quantity: -consume,
            reason: `Sold ${item.quantity}× ${item.nameSnapshot}`,
            warehouseId: defaultWarehouse?.id,
          },
        });
      }
    }
  }
}

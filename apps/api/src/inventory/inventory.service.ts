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

  async updateIngredient(id: string, dto: Prisma.IngredientUpdateInput) {
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
  // Purchase (+), wastage (−), or manual adjustment (signed).
  async movement(id: string, dto: { type: StockMovementType; quantity: number; reason?: string }) {
    const ing = await this.getIngredient(id);
    let delta = dto.quantity;
    if (dto.type === 'WASTAGE') delta = -Math.abs(dto.quantity);
    if (dto.type === 'PURCHASE') delta = Math.abs(dto.quantity);
    return this.prisma.$transaction(async (tx) => {
      await tx.ingredient.update({ where: { id }, data: { stockQty: { increment: delta } } });
      await tx.stockMovement.create({
        data: { ingredientId: id, type: dto.type, quantity: delta, reason: dto.reason },
      });
      return tx.ingredient.findUniqueOrThrow({ where: { id } });
    });
  }

  // Physical stock-take (#59): set counted qty, log the variance.
  async stockTake(id: string, countedQty: number, reason?: string) {
    const ing = await this.getIngredient(id);
    const variance = countedQty - ing.stockQty;
    return this.prisma.$transaction(async (tx) => {
      await tx.ingredient.update({ where: { id }, data: { stockQty: countedQty } });
      await tx.stockMovement.create({
        data: {
          ingredientId: id,
          type: 'STOCK_TAKE',
          quantity: variance,
          reason: reason ?? `Counted ${countedQty}${ing.unit} (was ${ing.stockQty})`,
        },
      });
      return { ingredient: await tx.ingredient.findUniqueOrThrow({ where: { id } }), varianceQty: variance };
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
    for (const item of items) {
      for (const r of byMenu.get(item.menuItemId!) ?? []) {
        const consume = r.quantity * item.quantity;
        await tx.ingredient.update({ where: { id: r.ingredientId }, data: { stockQty: { decrement: consume } } });
        await tx.stockMovement.create({
          data: {
            ingredientId: r.ingredientId,
            type: 'SALE_DEDUCTION',
            quantity: -consume,
            reason: `Sold ${item.quantity}× ${item.nameSnapshot}`,
          },
        });
      }
    }
  }
}

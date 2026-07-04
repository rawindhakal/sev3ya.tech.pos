import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoasteryService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Green bean batches (#81) ───────────────────────
  async greenBatches() {
    const list = await this.prisma.greenBeanBatch.findMany({
      orderBy: { purchasedAt: 'desc' },
      include: { _count: { select: { roasts: true, cuppings: true } } },
    });
    // Aging in days for the aging tracker (#86).
    return list.map((b) => ({ ...b, ageDays: Math.floor((Date.now() - b.purchasedAt.getTime()) / 864e5) }));
  }

  createGreen(dto: {
    name: string; origin?: string; estate?: string; process?: string;
    moisturePct?: number; weightKg: number; costPerKgCents?: number;
  }) {
    return this.prisma.greenBeanBatch.create({
      data: { ...dto, remainingKg: dto.weightKg },
    });
  }

  async removeGreen(id: string) {
    await this.getGreen(id);
    return this.prisma.greenBeanBatch.delete({ where: { id } });
  }

  private async getGreen(id: string) {
    const b = await this.prisma.greenBeanBatch.findUnique({ where: { id } });
    if (!b) throw new NotFoundException(`Green batch ${id} not found`);
    return b;
  }

  // ── Roast log (#82, #83) ───────────────────────────
  // Deducts green weight, records shrinkage, and adds the roasted output back
  // into the "Coffee Beans" ingredient stock (production → inventory link).
  async roast(dto: {
    greenBatchId: string; greenInputKg: number; roastedOutputKg: number;
    chargeTempC?: number; dropTempC?: number; devTimeSec?: number; agtron?: number; notes?: string;
  }) {
    const green = await this.getGreen(dto.greenBatchId);
    if (dto.greenInputKg <= 0 || dto.roastedOutputKg <= 0)
      throw new BadRequestException('Input and output weights must be positive');
    if (dto.roastedOutputKg > dto.greenInputKg)
      throw new BadRequestException('Roasted output cannot exceed green input');
    if (dto.greenInputKg > green.remainingKg)
      throw new BadRequestException(`Only ${green.remainingKg}kg green remaining in this batch`);

    const shrinkagePct = Number((((dto.greenInputKg - dto.roastedOutputKg) / dto.greenInputKg) * 100).toFixed(2));

    return this.prisma.$transaction(async (tx) => {
      const roast = await tx.roastBatch.create({
        data: {
          greenBatchId: dto.greenBatchId,
          greenInputKg: dto.greenInputKg,
          roastedOutputKg: dto.roastedOutputKg,
          shrinkagePct,
          chargeTempC: dto.chargeTempC,
          dropTempC: dto.dropTempC,
          devTimeSec: dto.devTimeSec,
          agtron: dto.agtron,
          notes: dto.notes,
        },
      });
      await tx.greenBeanBatch.update({
        where: { id: dto.greenBatchId },
        data: { remainingKg: { decrement: dto.greenInputKg } },
      });
      // Feed roasted beans into inventory if a "Coffee Beans" ingredient exists.
      const beans = await tx.ingredient.findFirst({ where: { name: { contains: 'Coffee Beans', mode: 'insensitive' } } });
      if (beans) {
        const grams = Math.round(dto.roastedOutputKg * 1000);
        await tx.ingredient.update({ where: { id: beans.id }, data: { stockQty: { increment: grams } } });
        await tx.stockMovement.create({
          data: { ingredientId: beans.id, type: 'ADJUSTMENT', quantity: grams, reason: `Roast batch #${roast.number} output` },
        });
      }
      return roast;
    });
  }

  roasts() {
    return this.prisma.roastBatch.findMany({
      orderBy: { roastedAt: 'desc' },
      take: 50,
      include: { greenBatch: { select: { name: true } } },
    });
  }

  // ── Cupping score cards (#84) ──────────────────────
  async cup(dto: {
    greenBatchId: string; aroma: number; flavor: number; acidity: number; body: number; balance: number; notes?: string;
  }) {
    await this.getGreen(dto.greenBatchId);
    const total = dto.aroma + dto.flavor + dto.acidity + dto.body + dto.balance;
    return this.prisma.cuppingScore.create({ data: { ...dto, total } });
  }

  cuppings(greenBatchId?: string) {
    return this.prisma.cuppingScore.findMany({
      where: greenBatchId ? { greenBatchId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { greenBatch: { select: { name: true } } },
    });
  }
}

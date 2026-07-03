import { Injectable, NotFoundException } from '@nestjs/common';
import { TableStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  // Returns tables plus their current open order (if any) so the floor
  // view can show live occupancy in one call.
  async findAll() {
    const tables = await this.prisma.restaurantTable.findMany({
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
          },
        },
      },
    });
    return tables.map((t) => {
      const { orders, ...rest } = t;
      return { ...rest, activeOrder: orders[0] ?? null };
    });
  }

  // Group tables by area for the floor plan.
  async findByArea() {
    const tables = await this.findAll();
    const areas: Record<string, typeof tables> = {};
    for (const t of tables) {
      const key = t.area ?? 'Unassigned';
      (areas[key] ??= []).push(t);
    }
    return Object.entries(areas).map(([area, tables]) => ({ area, tables }));
  }

  create(data: { name: string; seats?: number; area?: string }) {
    return this.prisma.restaurantTable.create({ data });
  }

  async update(
    id: string,
    data: { name?: string; seats?: number; area?: string; status?: TableStatus },
  ) {
    const table = await this.prisma.restaurantTable.findUnique({ where: { id } });
    if (!table) throw new NotFoundException(`Table ${id} not found`);
    return this.prisma.restaurantTable.update({ where: { id }, data });
  }

  async remove(id: string) {
    const table = await this.prisma.restaurantTable.findUnique({ where: { id } });
    if (!table) throw new NotFoundException(`Table ${id} not found`);
    return this.prisma.restaurantTable.delete({ where: { id } });
  }
}

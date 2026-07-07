import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuItemDto, UpdateMenuItemDto } from './dto/menu-item.dto';

const variantSelect = { orderBy: { sortOrder: 'asc' as const }, select: { id: true, name: true, priceCents: true, sortOrder: true } };

@Injectable()
export class MenuItemsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(categoryId?: string) {
    return this.prisma.menuItem.findMany({
      where: categoryId ? { categoryId } : undefined,
      orderBy: { name: 'asc' },
      include: {
        category: { select: { id: true, name: true } },
        modifierGroups: { select: { id: true, name: true } },
        variants: variantSelect,
      },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: {
        category: true,
        modifierGroups: { include: { modifiers: true } },
        variants: variantSelect,
      },
    });
    if (!item) throw new NotFoundException(`Menu item ${id} not found`);
    return item;
  }

  create(dto: CreateMenuItemDto) {
    const { modifierGroupIds, variants, ...rest } = dto;
    const data: Prisma.MenuItemCreateInput = {
      ...rest,
      category: { connect: { id: dto.categoryId } },
    };
    delete (data as any).categoryId;
    if (modifierGroupIds?.length) {
      data.modifierGroups = { connect: modifierGroupIds.map((id) => ({ id })) };
    }
    if (variants?.length) {
      data.variants = { create: variants.map((v, i) => ({ name: v.name, priceCents: v.priceCents, sortOrder: v.sortOrder ?? i })) };
    }
    return this.prisma.menuItem.create({
      data,
      include: { category: { select: { id: true, name: true } }, variants: variantSelect },
    });
  }

  async update(id: string, dto: UpdateMenuItemDto) {
    await this.findOne(id);
    const { modifierGroupIds, categoryId, variants, ...rest } = dto;
    const data: Prisma.MenuItemUpdateInput = { ...rest };
    if (categoryId) data.category = { connect: { id: categoryId } };
    if (modifierGroupIds) {
      data.modifierGroups = { set: modifierGroupIds.map((id) => ({ id })) };
    }
    if (variants) {
      // Replace the full set of portions.
      data.variants = { deleteMany: {}, create: variants.map((v, i) => ({ name: v.name, priceCents: v.priceCents, sortOrder: v.sortOrder ?? i })) };
    }
    return this.prisma.menuItem.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true } }, variants: variantSelect },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.menuItem.delete({ where: { id } });
  }
}

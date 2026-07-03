import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuItemDto, UpdateMenuItemDto } from './dto/menu-item.dto';

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
      },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: {
        category: true,
        modifierGroups: { include: { modifiers: true } },
      },
    });
    if (!item) throw new NotFoundException(`Menu item ${id} not found`);
    return item;
  }

  create(dto: CreateMenuItemDto) {
    const { modifierGroupIds, ...rest } = dto;
    const data: Prisma.MenuItemCreateInput = {
      ...rest,
      category: { connect: { id: dto.categoryId } },
    };
    // categoryId is provided via the relation connect above.
    delete (data as any).categoryId;
    if (modifierGroupIds?.length) {
      data.modifierGroups = { connect: modifierGroupIds.map((id) => ({ id })) };
    }
    return this.prisma.menuItem.create({
      data,
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, dto: UpdateMenuItemDto) {
    await this.findOne(id);
    const { modifierGroupIds, categoryId, ...rest } = dto;
    const data: Prisma.MenuItemUpdateInput = { ...rest };
    if (categoryId) data.category = { connect: { id: categoryId } };
    if (modifierGroupIds) {
      // Replace the full set of attached modifier groups.
      data.modifierGroups = { set: modifierGroupIds.map((id) => ({ id })) };
    }
    return this.prisma.menuItem.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.menuItem.delete({ where: { id } });
  }
}

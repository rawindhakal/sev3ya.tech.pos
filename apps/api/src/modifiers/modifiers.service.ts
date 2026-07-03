import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateModifierDto,
  CreateModifierGroupDto,
  UpdateModifierDto,
  UpdateModifierGroupDto,
} from './dto/modifier.dto';

@Injectable()
export class ModifiersService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Groups ──────────────────────────────────────────────
  findAllGroups() {
    return this.prisma.modifierGroup.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async findGroup(id: string) {
    const group = await this.prisma.modifierGroup.findUnique({
      where: { id },
      include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!group) throw new NotFoundException(`Modifier group ${id} not found`);
    return group;
  }

  createGroup(dto: CreateModifierGroupDto) {
    return this.prisma.modifierGroup.create({ data: dto });
  }

  async updateGroup(id: string, dto: UpdateModifierGroupDto) {
    await this.findGroup(id);
    return this.prisma.modifierGroup.update({ where: { id }, data: dto });
  }

  async removeGroup(id: string) {
    await this.findGroup(id);
    return this.prisma.modifierGroup.delete({ where: { id } });
  }

  // ── Modifiers within a group ────────────────────────────
  async addModifier(groupId: string, dto: CreateModifierDto) {
    await this.findGroup(groupId);
    return this.prisma.modifier.create({ data: { ...dto, groupId } });
  }

  async updateModifier(id: string, dto: UpdateModifierDto) {
    const modifier = await this.prisma.modifier.findUnique({ where: { id } });
    if (!modifier) throw new NotFoundException(`Modifier ${id} not found`);
    return this.prisma.modifier.update({ where: { id }, data: dto });
  }

  async removeModifier(id: string) {
    const modifier = await this.prisma.modifier.findUnique({ where: { id } });
    if (!modifier) throw new NotFoundException(`Modifier ${id} not found`);
    return this.prisma.modifier.delete({ where: { id } });
  }
}

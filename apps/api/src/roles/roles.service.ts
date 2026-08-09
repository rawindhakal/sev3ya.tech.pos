import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSIONS } from '../common/permissions';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

function flatten(role: {
  id: string; name: string; description: string | null; portal: string; isProtected: boolean;
  permissions: { key: string }[]; _count?: { employees: number };
}) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    portal: role.portal,
    isProtected: role.isProtected,
    permissions: role.permissions.map((p) => p.key),
    employeeCount: role._count?.employees ?? 0,
  };
}

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: true, _count: { select: { employees: true } } },
      orderBy: [{ isProtected: 'desc' }, { name: 'asc' }],
    });
    return roles.map(flatten);
  }

  async create(dto: CreateRoleDto) {
    // Unknown keys are silently dropped rather than 400'd, so a stale
    // frontend build never hard-fails a manager creating a role.
    const keys = (dto.permissionKeys ?? []).filter((k) => (ALL_PERMISSIONS as string[]).includes(k));
    const role = await this.prisma.role.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        portal: dto.portal ?? 'BACK_OFFICE',
        permissions: { create: keys.map((key) => ({ key })) },
      },
      include: { permissions: true, _count: { select: { employees: true } } },
    });
    return flatten(role);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    if (role.isProtected) throw new ForbiddenException('The Owner role cannot be edited');

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(dto.portal !== undefined ? { portal: dto.portal } : {}),
        },
      });
      if (dto.permissionKeys !== undefined) {
        const keys = dto.permissionKeys.filter((k) => (ALL_PERMISSIONS as string[]).includes(k));
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (keys.length) await tx.rolePermission.createMany({ data: keys.map((key) => ({ roleId: id, key })) });
      }
    });

    const updated = await this.prisma.role.findUniqueOrThrow({
      where: { id },
      include: { permissions: true, _count: { select: { employees: true } } },
    });
    return flatten(updated);
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { employees: true } } },
    });
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    if (role.isProtected) throw new ForbiddenException('The Owner role cannot be deleted');
    if (role._count.employees > 0) {
      throw new BadRequestException(
        `Reassign ${role._count.employees} employee(s) to a different role before deleting this one`,
      );
    }
    await this.prisma.role.delete({ where: { id } });
    return { id };
  }
}

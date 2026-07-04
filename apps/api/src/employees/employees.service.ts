import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Never leak the PIN to clients.
const publicSelect = {
  id: true,
  name: true,
  role: true,
  isActive: true,
  canVoid: true,
  canDiscount: true,
  canManageInventory: true,
  canViewReports: true,
  canManageStaff: true,
};

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: publicSelect,
    });
  }

  create(dto: Prisma.EmployeeCreateInput) {
    if (!/^\d{4,6}$/.test(dto.pin))
      throw new BadRequestException('PIN must be 4–6 digits');
    return this.prisma.employee.create({ data: dto, select: publicSelect });
  }

  async update(id: string, dto: Prisma.EmployeeUpdateInput) {
    await this.get(id);
    if (dto.pin && !/^\d{4,6}$/.test(dto.pin as string))
      throw new BadRequestException('PIN must be 4–6 digits');
    return this.prisma.employee.update({ where: { id }, data: dto, select: publicSelect });
  }

  async remove(id: string) {
    await this.get(id);
    return this.prisma.employee.update({
      where: { id },
      data: { isActive: false },
      select: publicSelect,
    });
  }

  private async get(id: string) {
    const e = await this.prisma.employee.findUnique({ where: { id } });
    if (!e) throw new NotFoundException(`Employee ${id} not found`);
    return e;
  }

  // PIN login (spec §2.1 Step 1) — returns the profile + permissions.
  async login(pin: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { pin, isActive: true },
      select: { ...publicSelect },
    });
    if (!emp) throw new UnauthorizedException('Invalid PIN');
    // Whether the employee currently has an open shift.
    const openShift = await this.prisma.shift.findFirst({
      where: { employeeId: emp.id, clockOut: null },
    });
    return { ...emp, clockedIn: !!openShift };
  }

  // ── Clock in / out (#126) ──────────────────────────
  async clockIn(id: string) {
    await this.get(id);
    const open = await this.prisma.shift.findFirst({ where: { employeeId: id, clockOut: null } });
    if (open) throw new BadRequestException('Already clocked in');
    return this.prisma.shift.create({ data: { employeeId: id } });
  }

  async clockOut(id: string) {
    const open = await this.prisma.shift.findFirst({ where: { employeeId: id, clockOut: null } });
    if (!open) throw new BadRequestException('Not clocked in');
    return this.prisma.shift.update({ where: { id: open.id }, data: { clockOut: new Date() } });
  }

  shifts(id: string) {
    return this.prisma.shift.findMany({
      where: { employeeId: id },
      orderBy: { clockIn: 'desc' },
      take: 30,
    });
  }

  // Who is currently on the floor.
  async activeShifts() {
    const shifts = await this.prisma.shift.findMany({
      where: { clockOut: null },
      include: { employee: { select: { name: true, role: true } } },
      orderBy: { clockIn: 'asc' },
    });
    return shifts.map((s) => ({
      shiftId: s.id,
      employeeId: s.employeeId,
      name: s.employee.name,
      role: s.employee.role,
      clockIn: s.clockIn,
    }));
  }
}

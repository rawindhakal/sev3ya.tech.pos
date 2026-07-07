import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { signToken } from '../common/token';
import { hashPassword, verifyPassword } from '../common/password';
import { AuditService } from '../audit/audit.service';

// Never leak the PIN / password hash to clients.
const publicSelect = {
  id: true,
  name: true,
  role: true,
  username: true,
  isActive: true,
  canVoid: true,
  canDiscount: true,
  canManageInventory: true,
  canViewReports: true,
  canManageStaff: true,
};

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: publicSelect,
    });
  }

  create(dto: Prisma.EmployeeCreateInput & { password?: string }) {
    if (!/^\d{4,6}$/.test(dto.pin))
      throw new BadRequestException('PIN must be 4–6 digits');
    const { password, ...rest } = dto;
    const data: Prisma.EmployeeCreateInput = { ...rest };
    if (password) data.passwordHash = hashPassword(password);
    return this.prisma.employee.create({ data, select: publicSelect });
  }

  async update(id: string, dto: Prisma.EmployeeUpdateInput & { password?: string }) {
    await this.get(id);
    if (dto.pin && !/^\d{4,6}$/.test(dto.pin as string))
      throw new BadRequestException('PIN must be 4–6 digits');
    const { password, ...rest } = dto;
    const data: Prisma.EmployeeUpdateInput = { ...rest };
    if (password) data.passwordHash = hashPassword(password);
    return this.prisma.employee.update({ where: { id }, data, select: publicSelect });
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

  // Login — accepts username+password (primary) or a quick PIN (manager
  // overrides / clock-in). Returns the profile + permissions + signed token.
  async login(creds: { pin?: string; username?: string; password?: string }) {
    let emp;
    if (creds.username && creds.password) {
      const found = await this.prisma.employee.findFirst({
        where: { username: creds.username, isActive: true },
      });
      if (!found || !verifyPassword(creds.password, found.passwordHash))
        throw new UnauthorizedException('Invalid username or password');
      emp = await this.prisma.employee.findUnique({
        where: { id: found.id },
        select: { ...publicSelect },
      });
    } else if (creds.pin) {
      emp = await this.prisma.employee.findFirst({
        where: { pin: creds.pin, isActive: true },
        select: { ...publicSelect },
      });
      if (!emp) throw new UnauthorizedException('Invalid PIN');
    } else {
      throw new BadRequestException('Provide username + password or a PIN');
    }
    if (!emp) throw new UnauthorizedException('Invalid credentials');
    // Whether the employee currently has an open shift.
    const openShift = await this.prisma.shift.findFirst({
      where: { employeeId: emp.id, clockOut: null },
    });
    const token = signToken({
      sub: emp.id,
      name: emp.name,
      role: emp.role,
      canVoid: emp.canVoid,
      canDiscount: emp.canDiscount,
      canManageInventory: emp.canManageInventory,
      canViewReports: emp.canViewReports,
      canManageStaff: emp.canManageStaff,
    });
    await this.audit.log({ sub: emp.id, name: emp.name }, 'LOGIN', `${emp.role} signed in`);
    return { ...emp, clockedIn: !!openShift, token };
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

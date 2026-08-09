import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { signToken } from '../common/token';
import { hashPassword, verifyPassword } from '../common/password';
import { AuditService } from '../audit/audit.service';
import { tenantContext } from '../common/tenant-context';
import { assertLoginAllowed, recordLoginFailure, recordLoginSuccess } from '../common/login-throttle';

// Never leak the PIN / password hash to clients.
const publicSelect = {
  id: true,
  deviceUserId: true,
  monthlySalaryCents: true,
  name: true,
  username: true,
  isActive: true,
  roleId: true,
  role: {
    select: {
      id: true,
      name: true,
      portal: true,
      isProtected: true,
      permissions: { select: { key: true } },
    },
  },
  // Multi-outlet (Phase 3) — empty array shown to the frontend the same way
  // it's interpreted at login: unrestricted, can select any outlet.
  outlets: { select: { outlet: { select: { id: true, name: true } } } },
};

// Flattens the nested `role` relation select above into the shape the
// frontend (and signToken) actually consumes — `role` becomes a free-text
// display name (was the fixed StaffRole enum), `permissions` a flat
// granted-key list.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flatten(e: any) {
  const { role: roleObj, outlets: outletRows, ...rest } = e;
  return {
    ...rest,
    role: roleObj?.name ?? null,
    portal: roleObj?.portal ?? 'BACK_OFFICE',
    permissions: (roleObj?.permissions ?? []).map((p: { key: string }) => p.key) as string[],
    ...(outletRows !== undefined ? { outlets: outletRows.map((r: { outlet: { id: string; name: string } }) => r.outlet) } : {}),
  };
}

interface CreateEmployeeInput {
  name: string;
  roleId: string;
  username: string;
  password: string;
  deviceUserId?: string;
  monthlySalaryCents?: number;
}
interface UpdateEmployeeInput {
  name?: string;
  roleId?: string;
  username?: string;
  password?: string;
  deviceUserId?: string;
  monthlySalaryCents?: number;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    const emps = await this.prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: publicSelect,
    });
    return emps.map(flatten);
  }

  private async assertRoleExists(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new BadRequestException(`Role ${roleId} not found`);
  }

  async create(dto: CreateEmployeeInput) {
    if (!dto.username?.trim() || !dto.password)
      throw new BadRequestException('Username and password are required');
    if (!dto.roleId) throw new BadRequestException('roleId is required');
    await this.assertRoleExists(dto.roleId);
    const { password, ...rest } = dto;
    const created = await this.prisma.employee.create({
      data: { ...rest, passwordHash: hashPassword(password) },
      select: publicSelect,
    });
    return flatten(created);
  }

  async update(id: string, dto: UpdateEmployeeInput) {
    await this.get(id);
    if (dto.roleId) await this.assertRoleExists(dto.roleId);
    const { password, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    if (password) data.passwordHash = hashPassword(password);
    const updated = await this.prisma.employee.update({ where: { id }, data, select: publicSelect });
    return flatten(updated);
  }

  // Multi-outlet (Phase 3): replace this employee's outlet assignments.
  // Empty array = unrestricted (can select any outlet at login) — the
  // default for every employee until an admin explicitly restricts them.
  async setOutlets(id: string, outletIds: string[]) {
    await this.get(id);
    await this.prisma.$transaction([
      this.prisma.employeeOutlet.deleteMany({ where: { employeeId: id } }),
      ...(outletIds.length
        ? [this.prisma.employeeOutlet.createMany({ data: outletIds.map((outletId) => ({ employeeId: id, outletId })) })]
        : []),
    ]);
    const updated = await this.prisma.employee.findUniqueOrThrow({ where: { id }, select: publicSelect });
    return flatten(updated);
  }

  async remove(id: string) {
    await this.get(id);
    const updated = await this.prisma.employee.update({
      where: { id },
      data: { isActive: false },
      select: publicSelect,
    });
    return flatten(updated);
  }

  private async get(id: string) {
    const e = await this.prisma.employee.findUnique({ where: { id } });
    if (!e) throw new NotFoundException(`Employee ${id} not found`);
    return e;
  }

  // Login — username + password only (the PIN system is retired). Returns the
  // profile + permissions + signed token. Also used by the ManagerAuth override
  // dialog (a second employee signs in inline to authorize an action).
  async login(creds: { username?: string; password?: string }) {
    if (!creds.username || !creds.password)
      throw new BadRequestException('Provide username and password');
    const tenantId = tenantContext.getStore()?.tenant?.id ?? null;
    assertLoginAllowed(tenantId, creds.username);
    const found = await this.prisma.employee.findFirst({
      where: { username: creds.username, isActive: true },
    });
    if (!found || !verifyPassword(creds.password, found.passwordHash)) {
      recordLoginFailure(tenantId, creds.username);
      throw new UnauthorizedException('Invalid username or password');
    }
    recordLoginSuccess(tenantId, creds.username);
    const raw = await this.prisma.employee.findUnique({
      where: { id: found.id },
      select: publicSelect,
    });
    if (!raw) throw new UnauthorizedException('Invalid credentials');
    const emp = flatten(raw);
    // Whether the employee currently has an open shift.
    const openShift = await this.prisma.shift.findFirst({
      where: { employeeId: emp.id, clockOut: null },
    });
    // Multi-outlet (Phase 3): zero EmployeeOutlet rows = unrestricted (every
    // pre-Phase-3 employee), so they can select any active outlet.
    const assignments = await this.prisma.employeeOutlet.findMany({
      where: { employeeId: emp.id },
      select: { outletId: true },
    });
    const outletIds = assignments.length ? assignments.map((a) => a.outletId) : null;
    const outlets = await this.prisma.outlet.findMany({
      where: { isActive: true, ...(outletIds ? { id: { in: outletIds } } : {}) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, isDefault: true },
    });
    const token = signToken({
      sub: emp.id,
      name: emp.name,
      role: emp.role,
      roleId: emp.roleId,
      portal: emp.portal,
      permissions: emp.permissions,
      outletIds,
      tenantId: tenantContext.getStore()?.tenant?.id ?? null,
    });
    await this.audit.log({ sub: emp.id, name: emp.name }, 'LOGIN', `${emp.role} signed in`);
    return { ...emp, clockedIn: !!openShift, outlets, token };
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
      include: { employee: { select: { name: true, role: { select: { name: true } } } } },
      orderBy: { clockIn: 'asc' },
    });
    return shifts.map((s) => ({
      shiftId: s.id,
      employeeId: s.employeeId,
      name: s.employee.name,
      role: s.employee.role?.name ?? null,
      clockIn: s.clockIn,
    }));
  }
}

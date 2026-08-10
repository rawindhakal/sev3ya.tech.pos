import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Leave types ───────────────────────────────────────
  leaveTypes() {
    return this.prisma.leaveType.findMany({ orderBy: { name: 'asc' } });
  }
  createLeaveType(dto: { name: string; isPaid?: boolean; defaultDaysPerYear?: number; color?: string }) {
    if (!dto.name?.trim()) throw new BadRequestException('Name is required');
    return this.prisma.leaveType.create({
      data: { name: dto.name.trim(), isPaid: dto.isPaid ?? true, defaultDaysPerYear: dto.defaultDaysPerYear ?? 0, color: dto.color },
    });
  }
  async updateLeaveType(id: string, dto: Partial<{ name: string; isPaid: boolean; defaultDaysPerYear: number; color: string; isActive: boolean }>) {
    const t = await this.prisma.leaveType.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Leave type not found');
    return this.prisma.leaveType.update({ where: { id }, data: { ...dto, name: dto.name?.trim() } });
  }
  async removeLeaveType(id: string) {
    const inUse = await this.prisma.leaveRequest.count({ where: { leaveTypeId: id } });
    if (inUse > 0) return this.prisma.leaveType.update({ where: { id }, data: { isActive: false } });
    return this.prisma.leaveType.delete({ where: { id } }).catch(() => { throw new NotFoundException('Leave type not found'); });
  }

  // ── Requests ──────────────────────────────────────────
  async requests(params: { employeeId?: string; status?: string; outletId?: string }) {
    return this.prisma.leaveRequest.findMany({
      where: {
        ...(params.employeeId ? { employeeId: params.employeeId } : {}),
        ...(params.status ? { status: params.status as any } : {}),
        ...(params.outletId ? { employee: { outlets: { some: { outletId: params.outletId } } } } : {}),
      },
      include: { employee: { select: { name: true } }, leaveType: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRequest(dto: { employeeId: string; leaveTypeId: string; fromDate: string; toDate: string; days: number; reason?: string }) {
    if (!dto.employeeId || !dto.leaveTypeId || !dto.fromDate || !dto.toDate) {
      throw new BadRequestException('Employee, leave type and date range are required');
    }
    if (!dto.days || dto.days <= 0) throw new BadRequestException('Days must be positive');
    return this.prisma.leaveRequest.create({
      data: {
        employeeId: dto.employeeId,
        leaveTypeId: dto.leaveTypeId,
        fromDate: new Date(dto.fromDate),
        toDate: new Date(dto.toDate),
        days: dto.days,
        reason: dto.reason,
      },
      include: { employee: { select: { name: true } }, leaveType: true },
    });
  }

  async approve(id: string, actorName?: string) {
    const req = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Leave request not found');
    if (req.status !== 'PENDING') throw new BadRequestException(`Request is already ${req.status.toLowerCase()}`);
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: actorName, approvedAt: new Date() },
      include: { employee: { select: { name: true } }, leaveType: true },
    });
  }

  async reject(id: string, reason: string, actorName?: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required to reject a leave request');
    const req = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Leave request not found');
    if (req.status !== 'PENDING') throw new BadRequestException(`Request is already ${req.status.toLowerCase()}`);
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'REJECTED', approvedBy: actorName, approvedAt: new Date(), rejectReason: reason.trim() },
      include: { employee: { select: { name: true } }, leaveType: true },
    });
  }

  async cancel(id: string) {
    const req = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Leave request not found');
    return this.prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  // Balance is computed on read, never stored — sum of this employee's
  // APPROVED days this year per leave type, vs LeaveType.defaultDaysPerYear.
  async balance(employeeId: string, year?: number) {
    const y = year ?? new Date().getFullYear();
    const start = new Date(Date.UTC(y, 0, 1));
    const end = new Date(Date.UTC(y + 1, 0, 1));
    const [types, used] = await Promise.all([
      this.prisma.leaveType.findMany({ where: { isActive: true } }),
      this.prisma.leaveRequest.groupBy({
        by: ['leaveTypeId'],
        _sum: { days: true },
        where: { employeeId, status: 'APPROVED', fromDate: { gte: start, lt: end } },
      }),
    ]);
    const usedByType = new Map(used.map((u) => [u.leaveTypeId, u._sum.days ?? 0]));
    return types.map((t) => ({
      leaveTypeId: t.id,
      name: t.name,
      allocatedDays: t.defaultDaysPerYear,
      usedDays: usedByType.get(t.id) ?? 0,
      remainingDays: t.defaultDaysPerYear - (usedByType.get(t.id) ?? 0),
    }));
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nepalStartOfDate, nepalEndOfDate } from '../common/nepal-time';

// Shift Templates + the actual weekly Roster — distinct from the existing
// Shift model, which stays the "clocked in right now" toggle it always was.
@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Templates ─────────────────────────────────────────
  templates(outletId?: string) {
    return this.prisma.shiftTemplate.findMany({
      where: outletId ? { OR: [{ outletId }, { outletId: null }] } : undefined,
      orderBy: { startTime: 'asc' },
    });
  }
  createTemplate(dto: { name: string; startTime: string; endTime: string; outletId?: string; color?: string }) {
    if (!dto.name?.trim() || !dto.startTime || !dto.endTime) throw new BadRequestException('Name and start/end time are required');
    return this.prisma.shiftTemplate.create({
      data: { name: dto.name.trim(), startTime: dto.startTime, endTime: dto.endTime, outletId: dto.outletId || null, color: dto.color },
    });
  }
  async updateTemplate(id: string, dto: Partial<{ name: string; startTime: string; endTime: string; outletId: string | null; color: string; isActive: boolean }>) {
    const t = await this.prisma.shiftTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Shift template not found');
    return this.prisma.shiftTemplate.update({ where: { id }, data: { ...dto, name: dto.name?.trim() } });
  }
  async removeTemplate(id: string) {
    const inUse = await this.prisma.rosterEntry.count({ where: { shiftTemplateId: id } });
    if (inUse > 0) return this.prisma.shiftTemplate.update({ where: { id }, data: { isActive: false } });
    return this.prisma.shiftTemplate.delete({ where: { id } }).catch(() => { throw new NotFoundException('Shift template not found'); });
  }

  // ── Roster ────────────────────────────────────────────
  roster(from: string, to: string, outletId?: string) {
    return this.prisma.rosterEntry.findMany({
      where: {
        date: { gte: nepalStartOfDate(from), lte: nepalEndOfDate(to) },
        ...(outletId ? { outletId } : {}),
      },
      include: { employee: { select: { id: true, name: true } }, shiftTemplate: true, outlet: { select: { id: true, name: true } } },
      orderBy: [{ date: 'asc' }],
    });
  }

  async createRosterEntry(dto: { employeeId: string; outletId: string; date: string; startTime: string; endTime: string; shiftTemplateId?: string; notes?: string }) {
    if (!dto.employeeId || !dto.outletId || !dto.date || !dto.startTime || !dto.endTime) {
      throw new BadRequestException('Employee, outlet, date and start/end time are required');
    }
    return this.prisma.rosterEntry.create({
      data: {
        employeeId: dto.employeeId,
        outletId: dto.outletId,
        date: nepalStartOfDate(dto.date),
        startTime: dto.startTime,
        endTime: dto.endTime,
        shiftTemplateId: dto.shiftTemplateId || null,
        notes: dto.notes,
      },
      include: { employee: { select: { id: true, name: true } }, shiftTemplate: true },
    }).catch((e) => {
      if (e?.code === 'P2002') throw new BadRequestException('This employee already has a roster entry starting at that time on that day');
      throw e;
    });
  }

  async removeRosterEntry(id: string) {
    await this.prisma.rosterEntry.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Roster entry not found');
    });
    return { ok: true };
  }
}

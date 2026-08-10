import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TYPES = ['BONUS', 'DEDUCTION', 'ADVANCE'];

// Bonuses/deductions/advances layered onto the existing ÷working-days payroll
// calc in attendance.service.ts — not a replacement for it.
@Injectable()
export class PayrollAdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(month?: string, employeeId?: string) {
    return this.prisma.payrollAdjustment.findMany({
      where: { ...(month ? { month } : {}), ...(employeeId ? { employeeId } : {}) },
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: { employeeId: string; month: string; type: string; amountCents: number; note?: string }, actorName?: string) {
    if (!dto.employeeId || !dto.month) throw new BadRequestException('Employee and month are required');
    if (!TYPES.includes(dto.type)) throw new BadRequestException('Type must be BONUS, DEDUCTION or ADVANCE');
    if (!dto.amountCents || dto.amountCents <= 0) throw new BadRequestException('Amount must be positive');
    return this.prisma.payrollAdjustment.create({
      data: { employeeId: dto.employeeId, month: dto.month, type: dto.type, amountCents: Math.round(dto.amountCents), note: dto.note, createdBy: actorName },
    });
  }

  async remove(id: string) {
    await this.prisma.payrollAdjustment.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Adjustment not found');
    });
    return { ok: true };
  }

  // employeeId -> {bonusCents, deductionCents, advanceCents}
  async netByEmployee(month: string) {
    const rows = await this.prisma.payrollAdjustment.findMany({ where: { month } });
    const map = new Map<string, { bonusCents: number; deductionCents: number; advanceCents: number }>();
    for (const r of rows) {
      const cur = map.get(r.employeeId) ?? { bonusCents: 0, deductionCents: 0, advanceCents: 0 };
      if (r.type === 'BONUS') cur.bonusCents += r.amountCents;
      else if (r.type === 'DEDUCTION') cur.deductionCents += r.amountCents;
      else if (r.type === 'ADVANCE') cur.advanceCents += r.amountCents;
      map.set(r.employeeId, cur);
    }
    return map;
  }
}

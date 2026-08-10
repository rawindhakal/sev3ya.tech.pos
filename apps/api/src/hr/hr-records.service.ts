import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Employee HR profile (personal info fields living directly on Employee),
// documents (with expiry tracking) and performance notes — the "employee
// record" half of the HRM module. Distinct from EmployeesService, which
// owns login/role/salary (staff.manage territory, not hr.manage).
@Injectable()
export class HrRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Profile ───────────────────────────────────────────
  async updateProfile(
    employeeId: string,
    dto: {
      dateOfBirth?: string; joinDate?: string; phone?: string; address?: string;
      emergencyContactName?: string; emergencyContactPhone?: string;
      bankName?: string; bankAccountNumber?: string; panNumber?: string;
      employmentType?: string; designation?: string;
    },
  ) {
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) throw new NotFoundException('Employee not found');
    return this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : dto.dateOfBirth === '' ? null : undefined,
        joinDate: dto.joinDate ? new Date(dto.joinDate) : dto.joinDate === '' ? null : undefined,
        phone: dto.phone,
        address: dto.address,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        bankName: dto.bankName,
        bankAccountNumber: dto.bankAccountNumber,
        panNumber: dto.panNumber,
        employmentType: dto.employmentType,
        designation: dto.designation,
      },
    });
  }

  // ── Documents ─────────────────────────────────────────
  documents(employeeId?: string, expiringBefore?: string) {
    return this.prisma.employeeDocument.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
        ...(expiringBefore ? { expiryDate: { lte: new Date(expiringBefore), gte: new Date() } } : {}),
      },
      include: { employee: { select: { name: true } } },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createDocument(dto: {
    employeeId: string; type: string; title: string; documentNumber?: string;
    issueDate?: string; expiryDate?: string; url?: string; notes?: string;
  }) {
    if (!dto.employeeId || !dto.title?.trim()) throw new BadRequestException('Employee and title are required');
    return this.prisma.employeeDocument.create({
      data: {
        employeeId: dto.employeeId,
        type: dto.type || 'OTHER',
        title: dto.title.trim(),
        documentNumber: dto.documentNumber,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        url: dto.url,
        notes: dto.notes,
      },
    });
  }

  async updateDocument(id: string, dto: Partial<{ title: string; documentNumber: string; issueDate: string; expiryDate: string; url: string; notes: string }>) {
    const doc = await this.prisma.employeeDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return this.prisma.employeeDocument.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        documentNumber: dto.documentNumber,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        url: dto.url,
        notes: dto.notes,
      },
    });
  }

  async removeDocument(id: string) {
    await this.prisma.employeeDocument.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Document not found');
    });
    return { ok: true };
  }

  // ── Performance notes ─────────────────────────────────
  performanceNotes(employeeId?: string) {
    return this.prisma.performanceNote.findMany({
      where: employeeId ? { employeeId } : undefined,
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  createPerformanceNote(dto: { employeeId: string; type: string; title: string; description?: string }, actorName?: string) {
    if (!dto.employeeId || !dto.title?.trim()) throw new BadRequestException('Employee and title are required');
    return this.prisma.performanceNote.create({
      data: {
        employeeId: dto.employeeId,
        type: dto.type || 'NOTE',
        title: dto.title.trim(),
        description: dto.description,
        createdBy: actorName,
      },
    });
  }

  async removePerformanceNote(id: string) {
    await this.prisma.performanceNote.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Performance note not found');
    });
    return { ok: true };
  }

  // ── Overview (headcount + expiring docs + pending leave, for /hr) ─────
  async overview(outletId?: string) {
    const [headcount, expiringDocs, pendingLeaveCount] = await Promise.all([
      this.prisma.employee.count({
        where: { isActive: true, ...(outletId ? { outlets: { some: { outletId } } } : {}) },
      }),
      this.prisma.employeeDocument.findMany({
        where: { expiryDate: { lte: new Date(Date.now() + 30 * 864e5) } },
        include: { employee: { select: { name: true } } },
        orderBy: { expiryDate: 'asc' },
        take: 20,
      }),
      this.prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
    ]);
    return {
      headcount,
      pendingLeaveCount,
      expiringDocuments: expiringDocs.map((d) => ({
        id: d.id, employeeName: d.employee.name, title: d.title, type: d.type,
        expiryDate: d.expiryDate, isExpired: !!d.expiryDate && d.expiryDate < new Date(),
      })),
    };
  }
}

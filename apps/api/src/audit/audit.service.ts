import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(actor: { sub?: string; name: string } | null, action: string, detail?: string) {
    return this.prisma.auditLog.create({
      data: {
        employeeId: actor?.sub ?? null,
        employeeName: actor?.name ?? 'system',
        action,
        detail,
      },
    });
  }

  list(limit = 100) {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}

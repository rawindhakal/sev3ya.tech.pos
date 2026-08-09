import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordFailureDto } from './dto/record-failure.dto';

@Injectable()
export class SyncFailuresService {
  constructor(private readonly prisma: PrismaService) {}

  // Idempotent on idempotencyKey: a retried outbox flush that hits the same
  // rejection twice must not create a second row for a manager to review.
  record(dto: RecordFailureDto) {
    const orderId = dto.path.match(/^\/orders\/([^/]+)/)?.[1] ?? null;
    return this.prisma.failedSyncItem.upsert({
      where: { idempotencyKey: dto.idempotencyKey },
      update: {},
      create: {
        orderId,
        method: dto.method,
        path: dto.path,
        body: dto.body as any,
        idempotencyKey: dto.idempotencyKey,
        errorMessage: dto.errorMessage,
      },
    });
  }

  list() {
    return this.prisma.failedSyncItem.findMany({ orderBy: { createdAt: 'desc' } });
  }

  acknowledge(id: string, actorName: string) {
    return this.prisma.failedSyncItem.update({
      where: { id },
      data: { acknowledgedAt: new Date(), acknowledgedBy: actorName },
    });
  }
}

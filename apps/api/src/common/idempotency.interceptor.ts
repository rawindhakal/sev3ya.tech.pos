import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

// Makes mutating requests safe to replay. The offline outbox sends a stable
// `Idempotency-Key` header when it re-submits a queued write; if we've already
// processed that key we return the original response instead of running the
// handler again — so a KOT fired offline can't become two KOTs on reconnect.
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private static readonly MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

  constructor(private readonly prisma: PrismaService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest();
    const key: string | undefined = req.headers['idempotency-key'];

    if (!key || !IdempotencyInterceptor.MUTATING.has(req.method)) {
      return next.handle();
    }

    // Already processed → replay the stored response.
    const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (existing) {
      ctx.switchToHttp().getResponse().status(existing.statusCode);
      return of(existing.response);
    }

    // First time → run the handler, then persist the response under the key.
    return next.handle().pipe(
      tap(async (response) => {
        const statusCode = ctx.switchToHttp().getResponse().statusCode ?? 200;
        try {
          await this.prisma.idempotencyKey.create({
            data: {
              key,
              method: req.method,
              path: req.originalUrl ?? req.url,
              statusCode,
              response: (response ?? null) as any,
            },
          });
        } catch {
          // A concurrent request already stored this key — safe to ignore.
        }
      }),
    );
  }
}

import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/public.decorator';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    // Confirm the DB is reachable so /health is a real readiness probe.
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'cakezake-pos-api', time: new Date().toISOString() };
  }
}

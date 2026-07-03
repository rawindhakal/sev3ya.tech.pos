import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

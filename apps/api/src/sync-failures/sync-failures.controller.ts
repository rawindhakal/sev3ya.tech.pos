import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SyncFailuresService } from './sync-failures.service';
import { AuthGuard, CurrentEmployee } from '../common/auth.guard';
import type { TokenPayload } from '../common/token';
import { RecordFailureDto } from './dto/record-failure.dto';

@Controller('sync-failures')
export class SyncFailuresController {
  constructor(private readonly svc: SyncFailuresService) {}

  // Any signed-in terminal that is currently online can report a rejected
  // replay from its own outbox — no extra permission beyond being logged in
  // (the default guard already requires that; see DefaultAuthGuard).
  @Post()
  record(@Body() dto: RecordFailureDto) {
    return this.svc.record(dto);
  }

  // Reviewing/acknowledging failures is a manager action — same permission
  // gate the back-office already uses for /employees, /settings.
  @Get()
  @UseGuards(new AuthGuard('canManageStaff'))
  list() {
    return this.svc.list();
  }

  @Patch(':id/ack')
  @UseGuards(new AuthGuard('canManageStaff'))
  acknowledge(@Param('id') id: string, @CurrentEmployee() emp: TokenPayload) {
    return this.svc.acknowledge(id, emp.name);
  }
}

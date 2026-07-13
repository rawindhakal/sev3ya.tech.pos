import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AuthGuard, RoleGuard, CurrentEmployee } from '../common/auth.guard';
import { TokenPayload } from '../common/token';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly att: AttendanceService) {}

  // Pull users + punches from the ZKTeco device on the LAN.
  @Post('sync')
  @UseGuards(new RoleGuard(['ADMIN', 'MANAGER']))
  sync() {
    return this.att.syncFromDevice();
  }

  // Punches pushed by the desktop LAN bridge (any signed-in till).
  @Post('ingest')
  @UseGuards(new AuthGuard())
  ingest(@Body() dto: { punches: { deviceUserId: string; at: string }[] }) {
    return this.att.ingest(dto?.punches ?? []);
  }

  // Re-attach unmapped punches after assigning device IDs to employees.
  @Post('relink')
  @UseGuards(new RoleGuard(['ADMIN', 'MANAGER']))
  relink() {
    return this.att.relink();
  }

  @Post('manual')
  @UseGuards(new RoleGuard(['ADMIN', 'MANAGER']))
  manual(@Body() dto: { employeeId: string; at: string }, @CurrentEmployee() emp: TokenPayload) {
    return this.att.addManual(dto.employeeId, dto.at, emp?.name);
  }

  @Get('logs')
  logs(@Query('from') from?: string, @Query('to') to?: string, @Query('employeeId') employeeId?: string) {
    return this.att.logs(from, to, employeeId);
  }

  @Get('summary')
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.att.summary(from, to);
  }

  @Get('payroll')
  payroll(@Query('month') month?: string) {
    return this.att.payroll(month);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { RoleGuard, CurrentEmployee } from '../common/auth.guard';
import { TokenPayload } from '../common/token';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly att: AttendanceService) {}

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

  // Cloud-push (ADMS) devices — registered on first handshake by IclockService,
  // approved/renamed/deactivated here.
  @Get('devices')
  @UseGuards(new RoleGuard(['ADMIN', 'MANAGER']))
  devices() {
    return this.att.devices();
  }

  @Patch('devices/:id')
  @UseGuards(new RoleGuard(['ADMIN', 'MANAGER']))
  updateDevice(@Param('id') id: string, @Body() dto: { name?: string; isActive?: boolean }) {
    return this.att.updateDevice(id, dto);
  }

  @Delete('devices/:id')
  @UseGuards(new RoleGuard(['ADMIN', 'MANAGER']))
  deleteDevice(@Param('id') id: string) {
    return this.att.deleteDevice(id);
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

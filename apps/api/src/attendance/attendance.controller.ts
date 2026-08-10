import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { PermissionGuard, CurrentEmployee } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';
import { TokenPayload } from '../common/token';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly att: AttendanceService) {}

  // Re-attach unmapped punches after assigning device IDs to employees.
  @Post('relink')
  @UseGuards(new PermissionGuard(PERMISSIONS.ATTENDANCE_MANAGE))
  relink() {
    return this.att.relink();
  }

  @Post('manual')
  @UseGuards(new PermissionGuard(PERMISSIONS.ATTENDANCE_MANAGE))
  manual(@Body() dto: { employeeId: string; at: string }, @CurrentEmployee() emp: TokenPayload) {
    return this.att.addManual(dto.employeeId, dto.at, emp?.name);
  }

  // Cloud-push (ADMS) devices — registered on first handshake by IclockService,
  // approved/renamed/deactivated here.
  @Get('devices')
  @UseGuards(new PermissionGuard(PERMISSIONS.ATTENDANCE_MANAGE))
  devices() {
    return this.att.devices();
  }

  @Patch('devices/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.ATTENDANCE_MANAGE))
  updateDevice(@Param('id') id: string, @Body() dto: { name?: string; isActive?: boolean }) {
    return this.att.updateDevice(id, dto);
  }

  @Delete('devices/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.ATTENDANCE_MANAGE))
  deleteDevice(@Param('id') id: string) {
    return this.att.deleteDevice(id);
  }

  @Get('logs')
  logs(@Query('from') from?: string, @Query('to') to?: string, @Query('employeeId') employeeId?: string) {
    return this.att.logs(from, to, employeeId);
  }

  // Every individual punch for one employee, ordered — the detailed
  // "how many times punched, at what time" drill-down.
  @Get('punches/:employeeId')
  punchDetail(@Param('employeeId') employeeId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.att.punchDetail(employeeId, from, to);
  }

  @Get('summary')
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.att.summary(from, to);
  }

  @Get('payroll')
  payroll(@Query('month') month?: string) {
    return this.att.payroll(month);
  }

  // Device-enrolled user records synced from OPERLOG — a read-only hint for
  // pairing a device PIN to the right employee.
  @Get('devices/:id/users')
  @UseGuards(new PermissionGuard(PERMISSIONS.ATTENDANCE_MANAGE))
  deviceUsers(@Param('id') id: string) {
    return this.att.deviceUsers(id);
  }
}

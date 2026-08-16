import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { HrRecordsService } from './hr-records.service';
import { LeaveService } from './leave.service';
import { ShiftsService } from './shifts.service';
import { PayrollAdjustmentsService } from './payroll-adjustments.service';
import { PermissionGuard, CurrentEmployee, CurrentOutlet } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';
import { TokenPayload } from '../common/token';
import { RequireFeature } from '../common/feature.decorator';

// All HR-admin surfaces (records/documents/performance, leave, shifts,
// payroll-adjustments) live behind one broad hr.manage permission — this is
// HR-admin territory, not a per-feature ACL, same granularity as
// accounting.manage.
@RequireFeature('hrm')
@Controller('hr')
@UseGuards(new PermissionGuard(PERMISSIONS.HR_MANAGE))
export class HrController {
  constructor(
    private readonly records: HrRecordsService,
    private readonly leave: LeaveService,
    private readonly shifts: ShiftsService,
    private readonly payrollAdjustments: PayrollAdjustmentsService,
  ) {}

  @Get('overview')
  overview(@CurrentOutlet() outletId?: string) {
    return this.records.overview(outletId);
  }

  @Patch('employees/:id/profile')
  updateProfile(@Param('id') id: string, @Body() dto: Record<string, string>) {
    return this.records.updateProfile(id, dto);
  }

  @Get('documents')
  documents(@Query('employeeId') employeeId?: string, @Query('expiringBefore') expiringBefore?: string) {
    return this.records.documents(employeeId, expiringBefore);
  }
  @Post('documents')
  createDocument(@Body() dto: any) {
    return this.records.createDocument(dto);
  }
  @Patch('documents/:id')
  updateDocument(@Param('id') id: string, @Body() dto: any) {
    return this.records.updateDocument(id, dto);
  }
  @Delete('documents/:id')
  removeDocument(@Param('id') id: string) {
    return this.records.removeDocument(id);
  }

  @Get('performance')
  performanceNotes(@Query('employeeId') employeeId?: string) {
    return this.records.performanceNotes(employeeId);
  }
  @Post('performance')
  createPerformanceNote(@Body() dto: any, @CurrentEmployee() emp: TokenPayload) {
    return this.records.createPerformanceNote(dto, emp?.name);
  }
  @Delete('performance/:id')
  removePerformanceNote(@Param('id') id: string) {
    return this.records.removePerformanceNote(id);
  }

  // ── Leave & time-off ───────────────────────────────────
  @Get('leave-types')
  leaveTypes() {
    return this.leave.leaveTypes();
  }
  @Post('leave-types')
  createLeaveType(@Body() dto: any) {
    return this.leave.createLeaveType(dto);
  }
  @Patch('leave-types/:id')
  updateLeaveType(@Param('id') id: string, @Body() dto: any) {
    return this.leave.updateLeaveType(id, dto);
  }
  @Delete('leave-types/:id')
  removeLeaveType(@Param('id') id: string) {
    return this.leave.removeLeaveType(id);
  }

  @Get('leave/balance')
  leaveBalance(@Query('employeeId') employeeId: string, @Query('year') year?: string) {
    return this.leave.balance(employeeId, year ? Number(year) : undefined);
  }
  @Get('leave')
  leaveRequests(@Query('employeeId') employeeId?: string, @Query('status') status?: string, @CurrentOutlet() outletId?: string) {
    return this.leave.requests({ employeeId, status, outletId });
  }
  @Post('leave')
  createLeaveRequest(@Body() dto: any) {
    return this.leave.createRequest(dto);
  }
  @Post('leave/:id/approve')
  approveLeave(@Param('id') id: string, @CurrentEmployee() emp: TokenPayload) {
    return this.leave.approve(id, emp?.name);
  }
  @Post('leave/:id/reject')
  rejectLeave(@Param('id') id: string, @Body() dto: { reason: string }, @CurrentEmployee() emp: TokenPayload) {
    return this.leave.reject(id, dto?.reason, emp?.name);
  }
  @Post('leave/:id/cancel')
  cancelLeave(@Param('id') id: string) {
    return this.leave.cancel(id);
  }

  // ── Shift scheduling ────────────────────────────────────
  @Get('shift-templates')
  shiftTemplates(@CurrentOutlet() outletId?: string) {
    return this.shifts.templates(outletId);
  }
  @Post('shift-templates')
  createShiftTemplate(@Body() dto: any) {
    return this.shifts.createTemplate(dto);
  }
  @Patch('shift-templates/:id')
  updateShiftTemplate(@Param('id') id: string, @Body() dto: any) {
    return this.shifts.updateTemplate(id, dto);
  }
  @Delete('shift-templates/:id')
  removeShiftTemplate(@Param('id') id: string) {
    return this.shifts.removeTemplate(id);
  }

  @Get('roster')
  roster(@Query('from') from: string, @Query('to') to: string, @CurrentOutlet() outletId?: string) {
    return this.shifts.roster(from, to, outletId);
  }
  @Post('roster')
  createRosterEntry(@Body() dto: any) {
    return this.shifts.createRosterEntry(dto);
  }
  @Delete('roster/:id')
  removeRosterEntry(@Param('id') id: string) {
    return this.shifts.removeRosterEntry(id);
  }

  // ── Payroll adjustments ─────────────────────────────────
  @Get('payroll-adjustments')
  payrollAdjustmentsList(@Query('month') month?: string, @Query('employeeId') employeeId?: string) {
    return this.payrollAdjustments.list(month, employeeId);
  }
  @Post('payroll-adjustments')
  createPayrollAdjustment(@Body() dto: any, @CurrentEmployee() emp: TokenPayload) {
    return this.payrollAdjustments.create(dto, emp?.name);
  }
  @Delete('payroll-adjustments/:id')
  removePayrollAdjustment(@Param('id') id: string) {
    return this.payrollAdjustments.remove(id);
  }
}

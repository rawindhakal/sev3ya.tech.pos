import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { HrRecordsService } from './hr-records.service';
import { LeaveService } from './leave.service';
import { ShiftsService } from './shifts.service';
import { PayrollAdjustmentsService } from './payroll-adjustments.service';

@Module({
  controllers: [HrController],
  providers: [HrRecordsService, LeaveService, ShiftsService, PayrollAdjustmentsService],
})
export class HrModule {}

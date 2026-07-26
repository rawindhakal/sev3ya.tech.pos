import { Module } from '@nestjs/common';
import { IclockController } from './iclock.controller';
import { IclockService } from './iclock.service';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [AttendanceModule],
  controllers: [IclockController],
  providers: [IclockService],
})
export class IclockModule {}

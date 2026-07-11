import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { JournalService } from './journal.service';
import { MisController } from './mis.controller';
import { MisService } from './mis.service';

@Module({
  controllers: [AccountingController, MisController],
  providers: [AccountingService, JournalService, MisService],
})
export class AccountingModule {}

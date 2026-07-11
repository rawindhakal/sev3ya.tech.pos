import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { JournalService } from './journal.service';

@Module({
  controllers: [AccountingController],
  providers: [AccountingService, JournalService],
})
export class AccountingModule {}

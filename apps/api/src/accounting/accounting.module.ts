import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { JournalService } from './journal.service';
import { WorkflowRulesService } from './workflow-rules.service';
import { MisController } from './mis.controller';
import { MisService } from './mis.service';

@Module({
  controllers: [AccountingController, MisController],
  providers: [AccountingService, JournalService, WorkflowRulesService, MisService],
})
export class AccountingModule {}

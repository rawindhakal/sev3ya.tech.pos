import { Global, Module } from '@nestjs/common';
import { OutletsService } from './outlets.service';
import { OutletsController } from './outlets.controller';

// Global (same pattern as PostingModule/AuditModule) — orders, employees,
// cash-drawer, kds, reservations, tables and the report services all need
// OutletsService for outlet resolution/validation without importing this
// whole module individually.
@Global()
@Module({
  controllers: [OutletsController],
  providers: [OutletsService],
  exports: [OutletsService],
})
export class OutletsModule {}

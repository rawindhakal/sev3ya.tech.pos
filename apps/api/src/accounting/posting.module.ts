import { Global, Module } from '@nestjs/common';
import { PostingService } from './posting.service';

// Global (same pattern as AuditModule) so orders/purchasing/crm/finance can
// inject PostingService directly without importing the whole AccountingModule
// (which would risk a circular dependency, since AccountingModule's own
// reports read from those modules' data).
@Global()
@Module({
  providers: [PostingService],
  exports: [PostingService],
})
export class PostingModule {}

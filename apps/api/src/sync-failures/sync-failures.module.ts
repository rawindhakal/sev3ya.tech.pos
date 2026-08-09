import { Module } from '@nestjs/common';
import { SyncFailuresService } from './sync-failures.service';
import { SyncFailuresController } from './sync-failures.controller';

@Module({
  controllers: [SyncFailuresController],
  providers: [SyncFailuresService],
})
export class SyncFailuresModule {}

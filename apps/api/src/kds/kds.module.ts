import { Module } from '@nestjs/common';
import { KdsService } from './kds.service';
import { KdsController } from './kds.controller';

@Module({
  controllers: [KdsController],
  providers: [KdsService],
})
export class KdsModule {}

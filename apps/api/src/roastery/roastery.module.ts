import { Module } from '@nestjs/common';
import { RoasteryService } from './roastery.service';
import { RoasteryController } from './roastery.controller';

@Module({
  controllers: [RoasteryController],
  providers: [RoasteryService],
})
export class RoasteryModule {}

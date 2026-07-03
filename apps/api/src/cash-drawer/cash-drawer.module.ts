import { Module } from '@nestjs/common';
import { CashDrawerService } from './cash-drawer.service';
import { CashDrawerController } from './cash-drawer.controller';

@Module({
  controllers: [CashDrawerController],
  providers: [CashDrawerService],
})
export class CashDrawerModule {}

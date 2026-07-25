import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { SettingsModule } from '../settings/settings.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CrmModule } from '../crm/crm.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { GiftCardsModule } from '../giftcards/giftcards.module';

@Module({
  imports: [SettingsModule, InventoryModule, CrmModule, PromotionsModule, GiftCardsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

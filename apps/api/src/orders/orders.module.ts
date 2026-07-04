import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { SettingsModule } from '../settings/settings.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [SettingsModule, InventoryModule, CrmModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

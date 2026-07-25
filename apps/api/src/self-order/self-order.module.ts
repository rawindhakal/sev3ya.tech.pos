import { Module } from '@nestjs/common';
import { SelfOrderService } from './self-order.service';
import { SelfOrderController } from './self-order.controller';
import { TablesModule } from '../tables/tables.module';
import { OrdersModule } from '../orders/orders.module';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TablesModule, OrdersModule, SettingsModule, NotificationsModule],
  controllers: [SelfOrderController],
  providers: [SelfOrderService],
})
export class SelfOrderModule {}

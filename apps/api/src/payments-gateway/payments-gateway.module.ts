import { Module } from '@nestjs/common';
import { PaymentsGatewayService } from './payments-gateway.service';
import { PaymentsGatewayController } from './payments-gateway.controller';
import { SettingsModule } from '../settings/settings.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [SettingsModule, OrdersModule],
  controllers: [PaymentsGatewayController],
  providers: [PaymentsGatewayService],
})
export class PaymentsGatewayModule {}

import { Module } from '@nestjs/common';
import { KdsService } from './kds.service';
import { KdsController } from './kds.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [KdsController],
  providers: [KdsService],
})
export class KdsModule {}

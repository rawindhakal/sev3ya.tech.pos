import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { TenantMiddleware } from './tenant.middleware';

@Module({
  controllers: [PlatformController],
  providers: [PlatformService, TenantMiddleware],
})
export class PlatformModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PublicController } from './public.controller';
import { PlatformService } from './platform.service';
import { TenantMiddleware } from './tenant.middleware';

@Module({
  controllers: [PlatformController, PublicController],
  providers: [PlatformService, TenantMiddleware],
})
export class PlatformModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}

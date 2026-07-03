import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { CategoriesModule } from './categories/categories.module';
import { MenuItemsModule } from './menu-items/menu-items.module';
import { ModifiersModule } from './modifiers/modifiers.module';

@Module({
  imports: [
    PrismaModule,
    CategoriesModule,
    MenuItemsModule,
    ModifiersModule,
    // Future feature modules plug in here: TablesModule, OrdersModule,
    // KotModule, PaymentsModule, ForecastModule, AuthModule …
  ],
  controllers: [HealthController],
})
export class AppModule {}

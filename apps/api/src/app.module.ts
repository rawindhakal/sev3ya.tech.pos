import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { CategoriesModule } from './categories/categories.module';
import { MenuItemsModule } from './menu-items/menu-items.module';
import { ModifiersModule } from './modifiers/modifiers.module';
import { TablesModule } from './tables/tables.module';
import { WaitersModule } from './waiters/waiters.module';
import { OrdersModule } from './orders/orders.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SettingsModule } from './settings/settings.module';
import { CashDrawerModule } from './cash-drawer/cash-drawer.module';

@Module({
  imports: [
    PrismaModule,
    CategoriesModule,
    MenuItemsModule,
    ModifiersModule,
    TablesModule,
    WaitersModule,
    OrdersModule,
    AnalyticsModule,
    SettingsModule,
    CashDrawerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

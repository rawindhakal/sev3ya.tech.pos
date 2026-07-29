import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { DefaultAuthGuard } from './common/auth.guard';
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
import { ReservationsModule } from './reservations/reservations.module';
import { KdsModule } from './kds/kds.module';
import { InventoryModule } from './inventory/inventory.module';
import { EmployeesModule } from './employees/employees.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { CrmModule } from './crm/crm.module';
import { FinanceModule } from './finance/finance.module';
import { RoasteryModule } from './roastery/roastery.module';
import { TerminalsModule } from './terminals/terminals.module';
import { IrdModule } from './ird/ird.module';
import { AccountingModule } from './accounting/accounting.module';
import { AttendanceModule } from './attendance/attendance.module';
import { PlatformModule } from './platform/platform.module';
import { SelfOrderModule } from './self-order/self-order.module';
import { PaymentsGatewayModule } from './payments-gateway/payments-gateway.module';
import { NotificationsModule } from './notifications/notifications.module';
import { IclockModule } from './iclock/iclock.module';

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
    SelfOrderModule,
    PaymentsGatewayModule,
    NotificationsModule,
    SettingsModule,
    CashDrawerModule,
    ReservationsModule,
    KdsModule,
    InventoryModule,
    EmployeesModule,
    PurchasingModule,
    ReportsModule,
    AuditModule,
    CrmModule,
    FinanceModule,
    RoasteryModule,
    TerminalsModule,
    IrdModule,
    AccountingModule,
    AttendanceModule,
    IclockModule,
    PlatformModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    // Deny-by-default: every route requires a valid, tenant-bound staff
    // token unless explicitly marked @Public(). See common/auth.guard.ts.
    { provide: APP_GUARD, useClass: DefaultAuthGuard },
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { IrdModule } from './ird/ird.module';
import { OutletsModule } from './outlets/outlets.module';
import { AccountingModule } from './accounting/accounting.module';
import { PostingModule } from './accounting/posting.module';
import { AttendanceModule } from './attendance/attendance.module';
import { PlatformModule } from './platform/platform.module';
import { SelfOrderModule } from './self-order/self-order.module';
import { PaymentsGatewayModule } from './payments-gateway/payments-gateway.module';
import { NotificationsModule } from './notifications/notifications.module';
import { IclockModule } from './iclock/iclock.module';
import { SyncFailuresModule } from './sync-failures/sync-failures.module';
import { RolesModule } from './roles/roles.module';
import { HrModule } from './hr/hr.module';

@Module({
  imports: [
    // Global per-IP request cap — defense-in-depth alongside the per-account
    // login lockout (common/login-throttle.ts), which only stops repeated
    // guesses against ONE username. This catches distributed guessing across
    // many usernames, credential stuffing, and general API hammering. Stricter
    // per-route limits (e.g. login) are set via @Throttle() at the handler.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
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
    PostingModule,
    CrmModule,
    FinanceModule,
    RoasteryModule,
    IrdModule,
    AccountingModule,
    AttendanceModule,
    IclockModule,
    PlatformModule,
    SyncFailuresModule,
    RolesModule,
    OutletsModule,
    HrModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    // Runs before auth so an over-limit caller is rejected cheaply, without
    // doing token verification / DB work first.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Deny-by-default: every route requires a valid, tenant-bound staff
    // token unless explicitly marked @Public(). See common/auth.guard.ts.
    { provide: APP_GUARD, useClass: DefaultAuthGuard },
  ],
})
export class AppModule {}

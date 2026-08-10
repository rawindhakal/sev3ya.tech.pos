import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { ForecastService } from './forecast.service';
import { PermissionGuard } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly forecast: ForecastService,
  ) {}

  // from/to (YYYY-MM-DD) select the reporting window shown on the dashboard's
  // quick date filter — defaults to today when omitted, unchanged from before.
  @Get('dashboard')
  dashboard(@Query('from') from?: string, @Query('to') to?: string, @Query('outletId') outletId?: string) {
    return this.analytics.dashboard(from, to, outletId);
  }

  // AI Sales Analysis — tomorrow's predicted revenue/orders/top items, from
  // recency-weighted seasonal history (see forecast.service.ts).
  @Get('forecast')
  @UseGuards(new PermissionGuard(PERMISSIONS.REPORTS_VIEW))
  forecastTomorrow(@Query('outletId') outletId?: string) {
    return this.forecast.predictTomorrow(outletId);
  }
}

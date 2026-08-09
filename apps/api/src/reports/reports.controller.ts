import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  report(@Query('from') from?: string, @Query('to') to?: string, @Query('outletId') outletId?: string) {
    return this.reports.report(from, to, outletId);
  }

  @Get('discounts')
  discounts(@Query('from') from?: string, @Query('to') to?: string, @Query('outletId') outletId?: string) {
    return this.reports.discounts(from, to, outletId);
  }

  @Get('stock-variance')
  stockVariance(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.stockVariance(from, to);
  }
}

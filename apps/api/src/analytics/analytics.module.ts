import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { ForecastService } from './forecast.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, ForecastService],
})
export class AnalyticsModule {}

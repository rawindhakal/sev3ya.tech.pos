import { Controller, Get } from '@nestjs/common';
import { settings } from '../common/settings';

@Controller('settings')
export class SettingsController {
  @Get()
  get() {
    return {
      vatRate: settings.vatRate,
      currency: settings.currency,
      restaurantName: settings.restaurantName,
    };
  }
}

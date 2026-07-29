import { Controller, Get } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { Public } from '../common/public.decorator';

// Unauthenticated info for the marketing site (pricing cards on the landing
// page). No tenant/financial data — just the published plan catalogue.
@Public()
@Controller('public')
export class PublicController {
  constructor(private readonly platform: PlatformService) {}

  @Get('plans')
  plans() {
    return this.platform.plans();
  }
}

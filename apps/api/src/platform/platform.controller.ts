import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { RoleGuard, CurrentEmployee } from '../common/auth.guard';
import { TokenPayload } from '../common/token';
import { tenantContext } from '../common/tenant-context';
import { ForbiddenException } from '@nestjs/common';

// Platform-owner console. Only ADMINs signed in on the CONTROL context (main
// domain — no tenant header) may manage tenants; a tenant's own admin must
// never reach the control plane.
function assertControlContext() {
  if (tenantContext.getStore()?.tenant) {
    throw new ForbiddenException('Platform console is only available on the main s3vya domain');
  }
}

@Controller('platform')
@UseGuards(new RoleGuard(['ADMIN']))
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('plans')
  plans() { assertControlContext(); return this.platform.plans(); }

  @Get('tenants')
  tenants() { assertControlContext(); return this.platform.tenants(); }

  @Get('stats')
  stats() { assertControlContext(); return this.platform.stats(); }

  @Post('tenants')
  create(@Body() dto: any) { assertControlContext(); return this.platform.createTenant(dto); }

  @Post('tenants/:id/status')
  setStatus(@Param('id') id: string, @Body('status') status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED') {
    assertControlContext(); return this.platform.setStatus(id, status);
  }

  @Post('payments')
  pay(@Body() dto: any, @CurrentEmployee() emp: TokenPayload) {
    assertControlContext();
    return this.platform.recordPayment({ ...dto, receivedBy: emp?.name });
  }

  @Get('me')
  me() { assertControlContext(); return { platform: true }; }

  @Get('tenants/:id/settings')
  tenantSettings(@Param('id') id: string) { assertControlContext(); return this.platform.tenantSettings(id); }

  @Post('tenants/:id/settings')
  updateTenantSettings(@Param('id') id: string, @Body() dto: any) {
    assertControlContext(); return this.platform.updateTenantSettings(id, dto);
  }

  @Get('tenants/:id/summary')
  tenantSummary(@Param('id') id: string) { assertControlContext(); return this.platform.tenantSummary(id); }

  @Delete('tenants/:id')
  remove(@Param('id') id: string, @Query('dropDb') dropDb?: string) {
    assertControlContext(); return this.platform.removeTenant(id, dropDb === '1' || dropDb === 'true');
  }
}

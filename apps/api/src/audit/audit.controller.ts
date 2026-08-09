import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PermissionGuard } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // Viewing the audit trail requires the reports permission.
  @Get()
  @UseGuards(new PermissionGuard(PERMISSIONS.REPORTS_VIEW))
  list() {
    return this.audit.list();
  }
}

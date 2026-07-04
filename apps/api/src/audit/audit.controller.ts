import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuthGuard } from '../common/auth.guard';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // Viewing the audit trail requires the reports permission.
  @Get()
  @UseGuards(new AuthGuard('canViewReports'))
  list() {
    return this.audit.list();
  }
}

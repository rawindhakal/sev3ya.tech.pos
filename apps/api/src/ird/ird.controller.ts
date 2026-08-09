import { Controller, Get, Header, Post, Query, UseGuards } from '@nestjs/common';
import { IrdService } from './ird.service';
import { PermissionGuard } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';

@Controller('ird')
export class IrdController {
  constructor(private readonly ird: IrdService) {}

  // IRD-ready sales register (BS dates, taxable / VAT split, sync status).
  @Get('report')
  report(@Query('from') from?: string, @Query('to') to?: string) {
    return this.ird.report(from, to);
  }

  // Push unsynced invoices to the IRD CBMS server. Manager/admin only.
  @Post('sync')
  @UseGuards(new PermissionGuard(PERMISSIONS.IRD_SYNC))
  sync() {
    return this.ird.sync();
  }

  // Tally import file (Sales vouchers) for the period.
  @Get('tally-xml')
  @Header('Content-Type', 'application/xml')
  @Header('Content-Disposition', 'attachment; filename="s3vyapos-tally-sales.xml"')
  tallyXml(@Query('from') from?: string, @Query('to') to?: string) {
    return this.ird.tallyXml(from, to);
  }
}

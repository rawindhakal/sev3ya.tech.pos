import { Controller, Get, Param, Query } from '@nestjs/common';
import { MisService } from './mis.service';
import { adToBs } from '../common/bs-date';

// MIS / statutory reports. One uniform response shape per report so the
// frontend renders them all with a single generic table + CSV component.
@Controller('mis')
export class MisController {
  constructor(private readonly mis: MisService) {}

  private currentFy(): number {
    const b = adToBs(new Date());
    return b.month >= 4 ? b.year : b.year - 1;
  }

  @Get('account-summary')
  accountSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.mis.accountSummary(from, to);
  }

  @Get('vat-summary')
  vatSummary(@Query('fy') fy?: string) {
    return this.mis.vatSummary(fy ? Number(fy) : this.currentFy());
  }

  @Get('daily-sales')
  dailySales(@Query('from') from?: string, @Query('to') to?: string) {
    return this.mis.dailySales(from, to);
  }

  @Get('collections')
  collections(@Query('from') from?: string, @Query('to') to?: string) {
    return this.mis.collections(from, to);
  }

  @Get('monthly-sales/:groupBy')
  monthlySales(@Param('groupBy') groupBy: 'item' | 'category' | 'customer', @Query('fy') fy?: string) {
    const g = ['item', 'category', 'customer'].includes(groupBy) ? groupBy : 'item';
    return this.mis.monthlySales(g, fy ? Number(fy) : this.currentFy());
  }

  @Get('sales-returns')
  salesReturns(@Query('from') from?: string, @Query('to') to?: string) {
    return this.mis.salesReturns(from, to);
  }

  @Get('party-balances')
  partyBalances() {
    return this.mis.partyBalances();
  }

  @Get('stock-ledger')
  stockLedger(@Query('from') from?: string, @Query('to') to?: string) {
    return this.mis.stockLedger(from, to);
  }

  // Filterable sales report (detailed / KOT / BOT + item/category/method/day grouping).
  @Get('sales-detail')
  salesDetail(@Query() q: Record<string, string>) {
    return this.mis.salesDetail({
      from: q.from, to: q.to,
      categoryId: q.categoryId || undefined,
      itemId: q.itemId || undefined,
      method: q.method || undefined,
      type: q.type || undefined,
      station: q.station || undefined,
      groupBy: (q.groupBy as any) || 'detail',
    });
  }

  // Every cancelled item, who approved it and why (KOT/BOT reports only ever
  // show what's still live — this is the audit-trail counterpart).
  @Get('cancelled-items')
  cancelledItems(@Query('from') from?: string, @Query('to') to?: string, @Query('station') station?: string) {
    return this.mis.cancelledItems({ from, to, station: station || undefined });
  }
}

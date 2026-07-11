import { Controller, Get, Query } from '@nestjs/common';
import { AccountingService } from './accounting.service';

@Controller('accounting')
export class AccountingController {
  constructor(private readonly acc: AccountingService) {}

  @Get('sales-book')
  salesBook(@Query('from') from?: string, @Query('to') to?: string) {
    return this.acc.salesBook(from, to);
  }

  @Get('purchase-register')
  purchaseRegister(@Query('from') from?: string, @Query('to') to?: string) {
    return this.acc.purchaseRegister(from, to);
  }

  @Get('cash-book')
  cashBook(@Query('from') from?: string, @Query('to') to?: string) {
    return this.acc.cashBook(from, to);
  }

  @Get('bank-book')
  bankBook(@Query('from') from?: string, @Query('to') to?: string) {
    return this.acc.bankBook(from, to);
  }

  @Get('day-book')
  dayBook(@Query('date') date?: string) {
    return this.acc.dayBook(date);
  }

  @Get('balance-sheet')
  balanceSheet(@Query('asOf') asOf?: string) {
    return this.acc.balanceSheet(asOf);
  }
}

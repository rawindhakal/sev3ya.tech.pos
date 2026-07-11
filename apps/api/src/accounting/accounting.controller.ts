import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { JournalService } from './journal.service';
import { RoleGuard, CurrentEmployee } from '../common/auth.guard';
import { TokenPayload } from '../common/token';

@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly acc: AccountingService,
    private readonly journal: JournalService,
  ) {}

  // ── Chart of accounts ─────────────────────────────
  @Get('accounts')
  accounts() {
    return this.journal.accounts();
  }

  @Post('accounts')
  @UseGuards(new RoleGuard(['ADMIN', 'MANAGER']))
  createAccount(@Body() dto: { code: string; name: string; type: any; group?: string }) {
    return this.journal.createAccount(dto);
  }

  @Patch('accounts/:id')
  @UseGuards(new RoleGuard(['ADMIN', 'MANAGER']))
  updateAccount(@Param('id') id: string, @Body() dto: { name?: string; group?: string; code?: string }) {
    return this.journal.updateAccount(id, dto);
  }

  @Delete('accounts/:id')
  @UseGuards(new RoleGuard(['ADMIN', 'MANAGER']))
  removeAccount(@Param('id') id: string) {
    return this.journal.removeAccount(id);
  }

  // ── Manual journal vouchers ───────────────────────
  @Get('journal')
  entries(@Query('from') from?: string, @Query('to') to?: string) {
    return this.journal.entries(from, to);
  }

  @Post('journal')
  @UseGuards(new RoleGuard(['ADMIN', 'MANAGER']))
  createEntry(
    @Body() dto: { date?: string; type?: string; narration?: string; lines: { accountId: string; drCents?: number; crCents?: number }[] },
    @CurrentEmployee() emp: TokenPayload,
  ) {
    return this.journal.createEntry(dto, emp?.name);
  }

  @Delete('journal/:id')
  @UseGuards(new RoleGuard(['ADMIN', 'MANAGER']))
  removeEntry(@Param('id') id: string, @CurrentEmployee() emp: TokenPayload) {
    return this.journal.removeEntry(id, emp?.name);
  }

  // ── Ledger & trial balance ────────────────────────
  @Get('ledger/:accountId')
  ledger(@Param('accountId') accountId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.journal.ledger(accountId, from, to);
  }

  @Get('trial-balance')
  trialBalance(@Query('from') from?: string, @Query('to') to?: string) {
    return this.journal.trialBalance(from, to);
  }

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

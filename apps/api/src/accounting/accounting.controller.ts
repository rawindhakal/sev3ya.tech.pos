import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { JournalService } from './journal.service';
import { WorkflowRulesService } from './workflow-rules.service';
import { CreateWorkflowRuleDto, UpdateWorkflowRuleDto } from './dto/workflow-rule.dto';
import { PermissionGuard, CurrentEmployee } from '../common/auth.guard';
import { PERMISSIONS } from '../common/permissions';
import { TokenPayload } from '../common/token';
import { RequireFeature } from '../common/feature.decorator';

@RequireFeature('finance')
@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly acc: AccountingService,
    private readonly journal: JournalService,
    private readonly workflows: WorkflowRulesService,
  ) {}

  // ── Chart of accounts ─────────────────────────────
  @Get('accounts')
  accounts() {
    return this.journal.accounts();
  }

  @Post('accounts')
  @UseGuards(new PermissionGuard(PERMISSIONS.ACCOUNTING_MANAGE))
  createAccount(@Body() dto: { code: string; name: string; type: any; group?: string }) {
    return this.journal.createAccount(dto);
  }

  @Patch('accounts/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.ACCOUNTING_MANAGE))
  updateAccount(@Param('id') id: string, @Body() dto: { name?: string; group?: string; code?: string }) {
    return this.journal.updateAccount(id, dto);
  }

  @Delete('accounts/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.ACCOUNTING_MANAGE))
  removeAccount(@Param('id') id: string) {
    return this.journal.removeAccount(id);
  }

  // ── Manual journal vouchers ───────────────────────
  @Get('journal')
  entries(@Query('from') from?: string, @Query('to') to?: string) {
    return this.journal.entries(from, to);
  }

  // Must be registered before any GET journal/:id route is ever added.
  @Get('journal/pending')
  @UseGuards(new PermissionGuard(PERMISSIONS.ACCOUNTING_APPROVE))
  pendingApprovals() {
    return this.journal.pendingApprovals();
  }

  @Post('journal')
  @UseGuards(new PermissionGuard(PERMISSIONS.ACCOUNTING_MANAGE))
  createEntry(
    @Body() dto: { date?: string; type?: string; narration?: string; lines: { accountId: string; drCents?: number; crCents?: number }[] },
    @CurrentEmployee() emp: TokenPayload,
  ) {
    return this.journal.createEntry(dto, emp?.name);
  }

  @Post('journal/:id/approve')
  @UseGuards(new PermissionGuard(PERMISSIONS.ACCOUNTING_APPROVE))
  approveEntry(@Param('id') id: string, @Body() dto: { note?: string }, @CurrentEmployee() emp: TokenPayload) {
    return this.journal.approve(id, emp.name, dto?.note);
  }

  @Post('journal/:id/reject')
  @UseGuards(new PermissionGuard(PERMISSIONS.ACCOUNTING_APPROVE))
  rejectEntry(@Param('id') id: string, @Body() dto: { reason: string }, @CurrentEmployee() emp: TokenPayload) {
    return this.journal.reject(id, dto?.reason, emp.name);
  }

  @Delete('journal/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.ACCOUNTING_MANAGE))
  removeEntry(@Param('id') id: string, @CurrentEmployee() emp: TokenPayload) {
    return this.journal.removeEntry(id, emp?.name);
  }

  // ── Approval workflow rules ───────────────────────
  @Get('workflows')
  @UseGuards(new PermissionGuard(PERMISSIONS.ACCOUNTING_MANAGE))
  workflowRules() {
    return this.workflows.findAll();
  }

  @Post('workflows')
  @UseGuards(new PermissionGuard(PERMISSIONS.ACCOUNTING_MANAGE))
  createWorkflowRule(@Body() dto: CreateWorkflowRuleDto) {
    return this.workflows.create(dto);
  }

  @Patch('workflows/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.ACCOUNTING_MANAGE))
  updateWorkflowRule(@Param('id') id: string, @Body() dto: UpdateWorkflowRuleDto) {
    return this.workflows.update(id, dto);
  }

  @Delete('workflows/:id')
  @UseGuards(new PermissionGuard(PERMISSIONS.ACCOUNTING_MANAGE))
  removeWorkflowRule(@Param('id') id: string) {
    return this.workflows.remove(id);
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
  salesBook(@Query('from') from?: string, @Query('to') to?: string, @Query('outletId') outletId?: string) {
    return this.acc.salesBook(from, to, outletId);
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

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatBs } from '../common/bs-date';

// Double-entry layer: chart of accounts + manual journal vouchers + ledger
// statements + trial balance. System accounts are seeded automatically and
// their ledger views also merge live POS activity (cash, bank, sales, VAT,
// debtors) so the ledger reads like Tally's.

const DEFAULT_ACCOUNTS: { code: string; name: string; type: AccountType; group: string; isSystem?: boolean }[] = [
  { code: '1000', name: 'Cash in Hand', type: 'ASSET', group: 'Current Assets', isSystem: true },
  { code: '1100', name: 'Bank & Wallets', type: 'ASSET', group: 'Current Assets', isSystem: true },
  { code: '1200', name: 'Sundry Debtors (Customer Credit)', type: 'ASSET', group: 'Current Assets', isSystem: true },
  { code: '1300', name: 'Inventory / Stock', type: 'ASSET', group: 'Current Assets', isSystem: true },
  { code: '1400', name: 'Fixed Assets', type: 'ASSET', group: 'Fixed Assets' },
  { code: '2000', name: 'Sundry Creditors (Suppliers)', type: 'LIABILITY', group: 'Current Liabilities', isSystem: true },
  { code: '2100', name: 'VAT Payable', type: 'LIABILITY', group: 'Duties & Taxes', isSystem: true },
  { code: '2200', name: 'Salaries Payable', type: 'LIABILITY', group: 'Current Liabilities' },
  { code: '3000', name: "Owner's Capital", type: 'EQUITY', group: 'Capital Account' },
  { code: '3100', name: 'Drawings', type: 'EQUITY', group: 'Capital Account' },
  { code: '4000', name: 'Sales Account', type: 'INCOME', group: 'Sales Accounts', isSystem: true },
  { code: '4100', name: 'Other Income', type: 'INCOME', group: 'Indirect Income' },
  { code: '5000', name: 'Purchases', type: 'EXPENSE', group: 'Purchase Accounts', isSystem: true },
  { code: '5100', name: 'Rent', type: 'EXPENSE', group: 'Indirect Expenses' },
  { code: '5200', name: 'Salaries & Wages', type: 'EXPENSE', group: 'Indirect Expenses' },
  { code: '5300', name: 'Utilities', type: 'EXPENSE', group: 'Indirect Expenses' },
  { code: '5400', name: 'Marketing', type: 'EXPENSE', group: 'Indirect Expenses' },
  { code: '5500', name: 'Miscellaneous Expenses', type: 'EXPENSE', group: 'Indirect Expenses' },
];

const BANK_METHODS = ['BANK', 'CARD', 'FONEPAY', 'ESEWA', 'KHALTI'] as const;

// Dr-nature accounts grow with debits; Cr-nature with credits.
const DR_NATURE: AccountType[] = ['ASSET', 'EXPENSE'];

interface StatementLine {
  at: Date;
  source: 'JOURNAL' | 'POS';
  voucher?: string;
  particulars: string;
  drCents: number;
  crCents: number;
}

@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  // Seed/refresh the default chart (idempotent; runs on first access).
  private async ensureChart() {
    const count = await this.prisma.ledgerAccount.count();
    if (count > 0) return;
    await this.prisma.ledgerAccount.createMany({
      data: DEFAULT_ACCOUNTS.map((a) => ({ ...a, isSystem: a.isSystem ?? false })),
      skipDuplicates: true,
    });
  }

  // ── Chart of accounts ────────────────────────────────
  async accounts() {
    await this.ensureChart();
    const accts = await this.prisma.ledgerAccount.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
    // Manual-journal balance per account.
    const sums = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      _sum: { drCents: true, crCents: true },
    });
    const byId = new Map(sums.map((s) => [s.accountId, s]));
    return accts.map((a) => {
      const s = byId.get(a.id);
      const dr = Number(s?._sum.drCents ?? 0);
      const cr = Number(s?._sum.crCents ?? 0);
      const balanceCents = DR_NATURE.includes(a.type) ? dr - cr : cr - dr;
      return { ...a, drCents: dr, crCents: cr, balanceCents };
    });
  }

  async createAccount(dto: { code: string; name: string; type: AccountType; group?: string }) {
    await this.ensureChart();
    if (!dto.code?.trim() || !dto.name?.trim()) throw new BadRequestException('Code and name are required');
    return this.prisma.ledgerAccount.create({
      data: { code: dto.code.trim(), name: dto.name.trim(), type: dto.type, group: dto.group?.trim() || null },
    });
  }

  async updateAccount(id: string, dto: { name?: string; group?: string; code?: string }) {
    const a = await this.prisma.ledgerAccount.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Account not found');
    return this.prisma.ledgerAccount.update({
      where: { id },
      data: { name: dto.name?.trim() || undefined, group: dto.group?.trim(), code: a.isSystem ? undefined : dto.code?.trim() || undefined },
    });
  }

  async removeAccount(id: string) {
    const a = await this.prisma.ledgerAccount.findUnique({ where: { id }, include: { _count: { select: { lines: true } } } });
    if (!a) throw new NotFoundException('Account not found');
    if (a.isSystem) throw new BadRequestException('System accounts cannot be deleted');
    if (a._count.lines > 0) {
      // Keep history intact — just deactivate.
      return this.prisma.ledgerAccount.update({ where: { id }, data: { isActive: false } });
    }
    return this.prisma.ledgerAccount.delete({ where: { id } });
  }

  // ── Manual journal vouchers ──────────────────────────
  async createEntry(
    dto: { date?: string; type?: string; narration?: string; lines: { accountId: string; drCents?: number; crCents?: number }[] },
    actorName?: string,
  ) {
    await this.ensureChart();
    const lines = (dto.lines ?? []).filter((l) => (l.drCents ?? 0) > 0 || (l.crCents ?? 0) > 0);
    if (lines.length < 2) throw new BadRequestException('A voucher needs at least two lines');
    for (const l of lines) {
      if ((l.drCents ?? 0) > 0 && (l.crCents ?? 0) > 0)
        throw new BadRequestException('A line can be debit or credit, not both');
    }
    const dr = lines.reduce((s, l) => s + (l.drCents ?? 0), 0);
    const cr = lines.reduce((s, l) => s + (l.crCents ?? 0), 0);
    if (dr !== cr) throw new BadRequestException(`Voucher does not balance: Dr ${dr / 100} ≠ Cr ${cr / 100}`);
    const type = ['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA'].includes(dto.type ?? '') ? dto.type : 'JOURNAL';

    return this.prisma.journalEntry.create({
      data: {
        type,
        date: dto.date ? new Date(dto.date) : new Date(),
        narration: dto.narration?.trim() || null,
        createdBy: actorName,
        lines: {
          create: lines.map((l) => ({ accountId: l.accountId, drCents: l.drCents ?? 0, crCents: l.crCents ?? 0 })),
        },
      },
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
    });
  }

  async entries(from?: string, to?: string) {
    await this.ensureChart();
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 864e5);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    const rows = await this.prisma.journalEntry.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      take: 300,
    });
    return rows.map((e) => ({
      ...e,
      dateBs: formatBs(e.date),
      amountCents: e.lines.reduce((s, l) => s + l.drCents, 0),
    }));
  }

  async removeEntry(id: string, actorName?: string) {
    const e = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Voucher not found');
    await this.prisma.journalEntry.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: { employeeName: actorName ?? 'system', action: 'JOURNAL_DELETED', detail: `Voucher #${e.number} (${e.type}) ${e.narration ?? ''}` },
    });
    return { ok: true };
  }

  // ── Ledger statement for one account ─────────────────
  // Merges manual journal lines with live POS activity for system accounts.
  async ledger(accountId: string, from?: string, to?: string) {
    await this.ensureChart();
    const account = await this.prisma.ledgerAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 864e5);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    const window = { gte: start, lte: end };

    const manual = await this.prisma.journalLine.findMany({
      where: { accountId, entry: { date: window } },
      include: { entry: true },
      orderBy: { entry: { date: 'asc' } },
    });
    const lines: StatementLine[] = manual.map((l) => ({
      at: l.entry.date,
      source: 'JOURNAL',
      voucher: `#${l.entry.number} ${l.entry.type}`,
      particulars: l.entry.narration ?? '(no narration)',
      drCents: l.drCents,
      crCents: l.crCents,
    }));

    // Live POS activity for the mapped system accounts.
    if (account.isSystem) {
      if (account.code === '1000') {
        const [pays, moves, exps] = await Promise.all([
          this.prisma.payment.findMany({ where: { method: 'CASH', createdAt: window }, include: { order: { select: { number: true } } } }),
          this.prisma.cashMovement.findMany({ where: { createdAt: window, type: { in: ['PAY_IN', 'PAY_OUT'] } } }),
          this.prisma.expense.findMany({ where: { incurredAt: window } }),
        ]);
        lines.push(
          ...pays.map((p): StatementLine => ({ at: p.createdAt, source: 'POS', particulars: `Cash sale — invoice #${p.order.number}`, drCents: p.amountCents, crCents: 0 })),
          ...moves.map((m): StatementLine => ({ at: m.createdAt, source: 'POS', particulars: `${m.type === 'PAY_IN' ? 'Pay-in' : 'Pay-out'}${m.reason ? ` — ${m.reason}` : ''}`, drCents: m.type === 'PAY_IN' ? m.amountCents : 0, crCents: m.type === 'PAY_OUT' ? m.amountCents : 0 })),
          ...exps.map((e): StatementLine => ({ at: e.incurredAt, source: 'POS', particulars: `Expense — ${e.category}${e.description ? ` (${e.description})` : ''}`, drCents: 0, crCents: e.amountCents })),
        );
      } else if (account.code === '1100') {
        const pays = await this.prisma.payment.findMany({ where: { method: { in: BANK_METHODS as any }, createdAt: window }, include: { order: { select: { number: true } } } });
        const settle = await this.prisma.creditLedgerEntry.findMany({ where: { type: 'PAYMENT', method: { in: BANK_METHODS as any }, createdAt: window }, include: { customer: { select: { name: true } } } });
        lines.push(
          ...pays.map((p): StatementLine => ({ at: p.createdAt, source: 'POS', particulars: `${p.method} — invoice #${p.order.number}`, drCents: p.amountCents, crCents: 0 })),
          ...settle.map((s): StatementLine => ({ at: s.createdAt, source: 'POS', particulars: `${s.method} — credit settlement ${s.customer.name}`, drCents: s.amountCents, crCents: 0 })),
        );
      } else if (account.code === '1200') {
        const led = await this.prisma.creditLedgerEntry.findMany({ where: { createdAt: window }, include: { customer: { select: { name: true } } } });
        lines.push(...led.map((l): StatementLine => ({
          at: l.createdAt, source: 'POS',
          particulars: `${l.type === 'CHARGE' ? 'Credit sale' : `Paid ${l.method}`} — ${l.customer.name}`,
          drCents: l.type === 'CHARGE' ? l.amountCents : 0,
          crCents: l.type === 'PAYMENT' ? l.amountCents : 0,
        })));
      } else if (account.code === '4000') {
        const orders = await this.prisma.order.findMany({ where: { status: 'PAID', paidAt: window }, select: { number: true, paidAt: true, totalCents: true, taxCents: true, customerName: true } });
        lines.push(...orders.map((o): StatementLine => ({ at: o.paidAt!, source: 'POS', particulars: `Sale — invoice #${o.number}${o.customerName ? ` (${o.customerName})` : ''}`, drCents: 0, crCents: o.totalCents - o.taxCents })));
      } else if (account.code === '2100') {
        const orders = await this.prisma.order.findMany({ where: { status: 'PAID', paidAt: window, taxCents: { gt: 0 } }, select: { number: true, paidAt: true, taxCents: true } });
        lines.push(...orders.map((o): StatementLine => ({ at: o.paidAt!, source: 'POS', particulars: `VAT on invoice #${o.number}`, drCents: 0, crCents: o.taxCents })));
      } else if (account.code === '5000') {
        const pos = await this.prisma.purchaseOrder.findMany({ where: { status: 'RECEIVED', receivedAt: window }, include: { supplier: { select: { name: true } }, lines: true } });
        lines.push(...pos.map((p): StatementLine => ({ at: p.receivedAt!, source: 'POS', particulars: `Purchase — PO #${p.number} (${p.supplier.name})`, drCents: p.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitCostCents), 0), crCents: 0 })));
      } else if (account.code === '2000') {
        const pos = await this.prisma.purchaseOrder.findMany({ where: { status: 'RECEIVED', receivedAt: window }, include: { supplier: { select: { name: true } }, lines: true } });
        lines.push(...pos.map((p): StatementLine => ({ at: p.receivedAt!, source: 'POS', particulars: `Payable — PO #${p.number} (${p.supplier.name})`, drCents: 0, crCents: p.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitCostCents), 0) })));
      }
    }

    lines.sort((a, b) => a.at.getTime() - b.at.getTime());
    let bal = 0;
    const drNature = DR_NATURE.includes(account.type);
    const rows = lines.map((l) => {
      bal += drNature ? l.drCents - l.crCents : l.crCents - l.drCents;
      return { ...l, dateBs: formatBs(l.at), balanceCents: bal };
    });
    return {
      account,
      range: { from: start, to: end },
      rows,
      totals: {
        drCents: rows.reduce((s, r) => s + r.drCents, 0),
        crCents: rows.reduce((s, r) => s + r.crCents, 0),
        closingCents: bal,
      },
    };
  }

  // ── Trial balance (manual journals) ──────────────────
  async trialBalance(from?: string, to?: string) {
    await this.ensureChart();
    const start = from ? new Date(from) : new Date(Date.now() - 365 * 864e5);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    const accts = await this.prisma.ledgerAccount.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
    const lines = await this.prisma.journalLine.findMany({
      where: { entry: { date: { gte: start, lte: end } } },
      select: { accountId: true, drCents: true, crCents: true },
    });
    const sums = new Map<string, { dr: number; cr: number }>();
    for (const l of lines) {
      const s = sums.get(l.accountId) ?? { dr: 0, cr: 0 };
      s.dr += l.drCents; s.cr += l.crCents;
      sums.set(l.accountId, s);
    }
    const rows = accts
      .map((a) => {
        const s = sums.get(a.id) ?? { dr: 0, cr: 0 };
        const net = DR_NATURE.includes(a.type) ? s.dr - s.cr : s.cr - s.dr;
        return {
          code: a.code, name: a.name, type: a.type, group: a.group,
          drCents: s.dr, crCents: s.cr,
          closingDrCents: DR_NATURE.includes(a.type) && net > 0 ? net : !DR_NATURE.includes(a.type) && net < 0 ? -net : 0,
          closingCrCents: !DR_NATURE.includes(a.type) && net > 0 ? net : DR_NATURE.includes(a.type) && net < 0 ? -net : 0,
        };
      })
      .filter((r) => r.drCents || r.crCents);
    return {
      range: { from: start, to: end },
      rows,
      totals: {
        drCents: rows.reduce((s, r) => s + r.drCents, 0),
        crCents: rows.reduce((s, r) => s + r.crCents, 0),
        closingDrCents: rows.reduce((s, r) => s + r.closingDrCents, 0),
        closingCrCents: rows.reduce((s, r) => s + r.closingCrCents, 0),
      },
      note: 'Trial balance of manual journal vouchers. POS activity is reflected in the derived books and merged ledger views.',
    };
  }
}

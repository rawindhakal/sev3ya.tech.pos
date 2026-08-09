import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PostingService } from './posting.service';
import { ensureChart } from './default-accounts';
import { formatBs } from '../common/bs-date';

// Double-entry layer: chart of accounts + journal vouchers (manual and
// auto-posted from orders/purchasing/crm/finance — see PostingService) +
// ledger statements + trial balance. System accounts are seeded
// automatically (see default-accounts.ts). Balances are computed purely from
// real JournalLine rows — every business transaction actually posts one,
// there is no live re-derivation from operational tables anymore.

// Dr-nature accounts grow with debits; Cr-nature with credits.
const DR_NATURE: AccountType[] = ['ASSET', 'EXPENSE'];

interface StatementLine {
  at: Date;
  voucher?: string;
  particulars: string;
  drCents: number;
  crCents: number;
}

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
  ) {}

  private seedChart() {
    return ensureChart(this.prisma);
  }

  // ── Chart of accounts ────────────────────────────────
  async accounts() {
    await this.seedChart();
    const accts = await this.prisma.ledgerAccount.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
    // Balance per account — POSTED entries only; a pending/rejected entry's
    // lines are real rows but must not move any balance until approved.
    const sums = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { entry: { status: 'POSTED' } },
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
    await this.seedChart();
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
  // Routed through PostingService like every auto-posted transaction, so a
  // manual voucher is subject to the same approval-workflow matching (an
  // admin can require sign-off on manual journals above a threshold, say).
  async createEntry(
    dto: { date?: string; type?: string; narration?: string; lines: { accountId: string; drCents?: number; crCents?: number }[] },
    actorName?: string,
  ) {
    await this.seedChart();
    const lines = (dto.lines ?? []).filter((l) => (l.drCents ?? 0) > 0 || (l.crCents ?? 0) > 0);
    if (lines.length < 2) throw new BadRequestException('A voucher needs at least two lines');
    for (const l of lines) {
      if ((l.drCents ?? 0) > 0 && (l.crCents ?? 0) > 0)
        throw new BadRequestException('A line can be debit or credit, not both');
    }
    const dr = lines.reduce((s, l) => s + (l.drCents ?? 0), 0);
    const cr = lines.reduce((s, l) => s + (l.crCents ?? 0), 0);
    if (dr !== cr) throw new BadRequestException(`Voucher does not balance: Dr ${dr / 100} ≠ Cr ${cr / 100}`);
    const type = ['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA'].includes(dto.type ?? '') ? dto.type! : 'JOURNAL';

    return this.prisma.$transaction((tx) =>
      this.posting.postOrQueue(tx, {
        event: 'MANUAL',
        type,
        amountCents: dr,
        date: dto.date ? new Date(dto.date) : new Date(),
        narration: dto.narration?.trim() || '(no narration)',
        lines,
        actorName,
      }),
    );
  }

  async entries(from?: string, to?: string) {
    await this.seedChart();
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

  // ── Approvals ─────────────────────────────────────────
  pendingApprovals() {
    return this.prisma.journalEntry.findMany({
      where: { status: 'PENDING_APPROVAL' },
      orderBy: { date: 'desc' },
      include: {
        lines: { include: { account: { select: { code: true, name: true } } } },
        workflowRule: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        approvals: true,
      },
    });
  }

  // Records an approval for the entry's current step; advances to the next
  // step once that step's approvalsRequired is met, or posts the entry if
  // that was the last step.
  async approve(id: string, actorName: string, note?: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: { workflowRule: { include: { steps: { orderBy: { stepOrder: 'asc' } } } }, approvals: true },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    if (entry.status !== 'PENDING_APPROVAL') throw new BadRequestException(`Entry is ${entry.status.toLowerCase()}, not pending approval`);
    const steps = entry.workflowRule?.steps ?? [];
    const stepIdx = steps.findIndex((s) => s.stepOrder === entry.currentStep);
    if (stepIdx === -1) throw new BadRequestException('Entry has no matching approval step — contact an admin');
    const step = steps[stepIdx];

    return this.prisma.$transaction(async (tx) => {
      await tx.journalEntryApproval.create({ data: { entryId: id, stepOrder: step.stepOrder, approvedBy: actorName, note } });
      const approvalsForStep = await tx.journalEntryApproval.count({ where: { entryId: id, stepOrder: step.stepOrder } });
      if (approvalsForStep < step.approvalsRequired) {
        // Still needs more sign-off on this same step.
        return tx.journalEntry.findUniqueOrThrow({ where: { id }, include: { lines: true, approvals: true } });
      }
      const next = steps[stepIdx + 1];
      return tx.journalEntry.update({
        where: { id },
        data: next ? { currentStep: next.stepOrder } : { status: 'POSTED', currentStep: null },
        include: { lines: { include: { account: { select: { code: true, name: true } } } }, approvals: true },
      });
    });
  }

  async reject(id: string, reason: string, actorName: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required to reject a journal entry');
    const entry = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Journal entry not found');
    if (entry.status !== 'PENDING_APPROVAL') throw new BadRequestException(`Entry is ${entry.status.toLowerCase()}, not pending approval`);
    return this.prisma.$transaction(async (tx) => {
      await tx.journalEntryApproval.create({ data: { entryId: id, stepOrder: entry.currentStep ?? 0, approvedBy: actorName, note: `REJECTED: ${reason.trim()}` } });
      return tx.journalEntry.update({
        where: { id },
        data: { status: 'REJECTED' },
        include: { lines: { include: { account: { select: { code: true, name: true } } } }, approvals: true },
      });
    });
  }

  async removeEntry(id: string, actorName?: string) {
    const e = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Voucher not found');
    if (e.source !== 'MANUAL')
      throw new BadRequestException('Auto-posted entries cannot be deleted from the Journal — reverse the originating transaction instead');
    await this.prisma.journalEntry.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: { employeeName: actorName ?? 'system', action: 'JOURNAL_DELETED', detail: `Voucher #${e.number} (${e.type}) ${e.narration ?? ''}` },
    });
    return { ok: true };
  }

  // ── Ledger statement for one account ─────────────────
  // Pure JournalLine rows — every business transaction now actually posts
  // one (see PostingService + the auto-posting hooks in orders/purchasing/
  // crm/finance), so there's no more live re-derivation from operational
  // tables to merge in here.
  async ledger(accountId: string, from?: string, to?: string) {
    await this.seedChart();
    const account = await this.prisma.ledgerAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 864e5);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    const window = { gte: start, lte: end };

    const rowsRaw = await this.prisma.journalLine.findMany({
      where: { accountId, entry: { date: window, status: 'POSTED' } },
      include: { entry: true },
      orderBy: { entry: { date: 'asc' } },
    });
    const lines: StatementLine[] = rowsRaw.map((l) => ({
      at: l.entry.date,
      voucher: `#${l.entry.number} ${l.entry.type}`,
      particulars: l.entry.narration ?? '(no narration)',
      drCents: l.drCents,
      crCents: l.crCents,
    }));

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

  // ── Trial balance ─────────────────────────────────────
  async trialBalance(from?: string, to?: string) {
    await this.seedChart();
    const start = from ? new Date(from) : new Date(Date.now() - 365 * 864e5);
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    const accts = await this.prisma.ledgerAccount.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
    const lines = await this.prisma.journalLine.findMany({
      where: { entry: { date: { gte: start, lte: end }, status: 'POSTED' } },
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
      note: 'Trial balance of all posted journal entries (manual and auto-posted from orders, purchasing, credit settlements and expenses). Entries pending approval are excluded until posted.',
    };
  }
}

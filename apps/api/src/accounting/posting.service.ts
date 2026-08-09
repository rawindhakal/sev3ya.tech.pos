import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ensureChart } from './default-accounts';

// The single place every journal posting — manual voucher or auto-posted
// business transaction — funnels through. Decides POSTED vs PENDING_APPROVAL
// by matching the entry's event + amount against configured
// JournalWorkflowRules, then creates the JournalEntry accordingly.
//
// Fail-open by design: with zero workflow rules configured (every fresh
// deploy, and every event nobody has opted into approval for), everything
// posts immediately — identical to today's behavior before this feature
// existed. Approval only kicks in once an admin explicitly publishes a rule
// for that event, matching the reference product's "every journal must match
// a published workflow" framing (which is only meaningfully true once a rule
// exists to match against).
export interface PostLine {
  accountId: string;
  drCents?: number;
  crCents?: number;
}
export interface PostParams {
  // JournalEntry.source — MANUAL | ORDER_SALE | PURCHASE_RECEIPT |
  // SUPPLIER_PAYMENT | CREDIT_SETTLEMENT | EXPENSE.
  event: string;
  // Voucher sub-type shown in the Journal tab (JOURNAL/PAYMENT/RECEIPT/
  // CONTRA for manual vouchers; auto-posts default to the event name itself).
  type?: string;
  // The amount workflow rules match against (min/maxAmountCents) — normally
  // the larger of the Dr/Cr totals, i.e. the entry's face value.
  amountCents: number;
  date?: Date;
  narration: string;
  lines: PostLine[];
  sourceId?: string;
  actorName?: string;
  // Denormalized from the source transaction (multi-outlet, Phase 3) — a
  // filter/reporting dimension only, not present for every event (purchasing,
  // credit settlements and expenses aren't outlet-attributed in this phase).
  outletId?: string;
}

@Injectable()
export class PostingService {
  // Resolves a set of LedgerAccount codes (e.g. ACCOUNT_CODES.CASH) to their
  // ids, inside the caller's transaction — every auto-posting hook needs
  // this, so it lives here once rather than five times.
  async accountIdsByCode(tx: Prisma.TransactionClient, codes: string[]): Promise<Record<string, string>> {
    await ensureChart(tx);
    const accounts = await tx.ledgerAccount.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
    const byCode: Record<string, string> = {};
    for (const a of accounts) byCode[a.code] = a.id;
    const missing = codes.filter((c) => !byCode[c]);
    if (missing.length) throw new Error(`Missing system ledger account(s): ${missing.join(', ')} — has ensureChart() run?`);
    return byCode;
  }

  async postOrQueue(tx: Prisma.TransactionClient, params: PostParams) {
    const lines = params.lines.filter((l) => (l.drCents ?? 0) > 0 || (l.crCents ?? 0) > 0);
    if (lines.length < 2) {
      throw new Error(`Journal entry for event "${params.event}" needs at least two non-zero lines`);
    }
    const dr = lines.reduce((s, l) => s + (l.drCents ?? 0), 0);
    const cr = lines.reduce((s, l) => s + (l.crCents ?? 0), 0);
    if (dr !== cr) {
      throw new Error(`Journal entry for event "${params.event}" does not balance: Dr ${dr} != Cr ${cr}`);
    }

    const rule = await tx.journalWorkflowRule.findFirst({
      where: {
        isActive: true,
        journalEvent: { in: [params.event, 'ANY'] },
        AND: [
          { OR: [{ minAmountCents: null }, { minAmountCents: { lte: params.amountCents } }] },
          { OR: [{ maxAmountCents: null }, { maxAmountCents: { gte: params.amountCents } }] },
        ],
      },
      orderBy: { priority: 'desc' },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    // A matched rule with postAutomatically, no matching rule at all, or a
    // rule with no approval steps configured (nothing to advance through —
    // fail safe rather than stall an entry forever) all post immediately.
    const willAutoPost = !rule || rule.postAutomatically || rule.steps.length === 0;

    return tx.journalEntry.create({
      data: {
        type: params.type ?? (params.event === 'MANUAL' ? 'JOURNAL' : params.event),
        date: params.date ?? new Date(),
        narration: params.narration,
        createdBy: params.actorName,
        source: params.event,
        sourceId: params.sourceId,
        outletId: params.outletId,
        status: willAutoPost ? 'POSTED' : 'PENDING_APPROVAL',
        workflowRuleId: willAutoPost ? undefined : rule!.id,
        currentStep: willAutoPost ? undefined : rule!.steps[0].stepOrder,
        lines: { create: lines.map((l) => ({ accountId: l.accountId, drCents: l.drCents ?? 0, crCents: l.crCents ?? 0 })) },
      },
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
    });
  }
}

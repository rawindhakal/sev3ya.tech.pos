import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowRuleDto, UpdateWorkflowRuleDto } from './dto/workflow-rule.dto';

// CRUD for JournalWorkflowRule + its ordered JournalApprovalStep children —
// the "Approval Workflows" admin page. PostingService reads these at posting
// time; nothing here posts anything itself.
@Injectable()
export class WorkflowRulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.journalWorkflowRule.findMany({
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      include: { steps: { orderBy: { stepOrder: 'asc' } }, _count: { select: { entries: true } } },
    });
  }

  async create(dto: CreateWorkflowRuleDto) {
    if (!dto.steps?.length) throw new BadRequestException('At least one approval step is required');
    return this.prisma.journalWorkflowRule.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
        journalEvent: dto.journalEvent,
        minAmountCents: dto.minAmountCents,
        maxAmountCents: dto.maxAmountCents,
        priority: dto.priority ?? 100,
        postAutomatically: dto.postAutomatically ?? false,
        firstReminderHours: dto.firstReminderHours,
        repeatReminderHours: dto.repeatReminderHours,
        isActive: dto.isActive ?? true,
        steps: { create: dto.steps.map((s) => ({ stepOrder: s.stepOrder, name: s.name, approvalsRequired: s.approvalsRequired ?? 1 })) },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
  }

  async update(id: string, dto: UpdateWorkflowRuleDto) {
    const rule = await this.prisma.journalWorkflowRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Workflow rule not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.journalWorkflowRule.update({
        where: { id },
        data: {
          code: dto.code?.trim(),
          name: dto.name?.trim(),
          journalEvent: dto.journalEvent,
          minAmountCents: dto.minAmountCents,
          maxAmountCents: dto.maxAmountCents,
          priority: dto.priority,
          postAutomatically: dto.postAutomatically,
          firstReminderHours: dto.firstReminderHours,
          repeatReminderHours: dto.repeatReminderHours,
          isActive: dto.isActive,
        },
      });
      if (dto.steps) {
        if (!dto.steps.length) throw new BadRequestException('At least one approval step is required');
        await tx.journalApprovalStep.deleteMany({ where: { ruleId: id } });
        await tx.journalApprovalStep.createMany({
          data: dto.steps.map((s) => ({ ruleId: id, stepOrder: s.stepOrder, name: s.name, approvalsRequired: s.approvalsRequired ?? 1 })),
        });
      }
      return tx.journalWorkflowRule.findUniqueOrThrow({ where: { id }, include: { steps: { orderBy: { stepOrder: 'asc' } } } });
    });
  }

  async remove(id: string) {
    const rule = await this.prisma.journalWorkflowRule.findUnique({ where: { id }, include: { _count: { select: { entries: true } } } });
    if (!rule) throw new NotFoundException('Workflow rule not found');
    if (rule._count.entries > 0) {
      // Keep history intact (entries reference this rule for traceability) —
      // deactivating still stops it matching new transactions.
      return this.prisma.journalWorkflowRule.update({ where: { id }, data: { isActive: false } });
    }
    return this.prisma.journalWorkflowRule.delete({ where: { id } });
  }
}

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('POSTED', 'PENDING_APPROVAL', 'REJECTED');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "method" "PaymentMethod" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "currentStep" INTEGER,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "status" "JournalStatus" NOT NULL DEFAULT 'POSTED',
ADD COLUMN     "workflowRuleId" TEXT;

-- CreateTable
CREATE TABLE "journal_workflow_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "journalEvent" TEXT NOT NULL,
    "minAmountCents" INTEGER,
    "maxAmountCents" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "postAutomatically" BOOLEAN NOT NULL DEFAULT false,
    "firstReminderHours" INTEGER,
    "repeatReminderHours" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_workflow_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_approval_steps" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approvalsRequired" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "journal_approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry_approvals" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entry_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journal_workflow_rules_code_key" ON "journal_workflow_rules"("code");

-- CreateIndex
CREATE INDEX "journal_workflow_rules_journalEvent_isActive_idx" ON "journal_workflow_rules"("journalEvent", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "journal_approval_steps_ruleId_order_key" ON "journal_approval_steps"("ruleId", "order");

-- CreateIndex
CREATE INDEX "journal_entries_status_idx" ON "journal_entries"("status");

-- CreateIndex
CREATE INDEX "journal_entries_source_sourceId_idx" ON "journal_entries"("source", "sourceId");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_workflowRuleId_fkey" FOREIGN KEY ("workflowRuleId") REFERENCES "journal_workflow_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_approval_steps" ADD CONSTRAINT "journal_approval_steps_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "journal_workflow_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_approvals" ADD CONSTRAINT "journal_entry_approvals_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

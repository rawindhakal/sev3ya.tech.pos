-- DropIndex
DROP INDEX "journal_approval_steps_ruleId_order_key";

-- AlterTable
ALTER TABLE "journal_approval_steps" DROP COLUMN "order",
ADD COLUMN     "stepOrder" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "journal_approval_steps_ruleId_stepOrder_key" ON "journal_approval_steps"("ruleId", "stepOrder");

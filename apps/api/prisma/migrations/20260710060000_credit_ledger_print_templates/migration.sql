CREATE TYPE "CreditEntryType" AS ENUM ('CHARGE', 'PAYMENT');

CREATE TABLE "credit_ledger_entries" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "CreditEntryType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod",
    "orderId" TEXT,
    "note" TEXT,
    "balanceAfterCents" INTEGER NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "credit_ledger_entries_customerId_createdAt_idx" ON "credit_ledger_entries"("customerId", "createdAt");
CREATE INDEX "credit_ledger_entries_createdAt_idx" ON "credit_ledger_entries"("createdAt");
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD COLUMN "kotPrintedAt" TIMESTAMP(3);

ALTER TABLE "cafe_settings" ADD COLUMN "billTemplate" JSONB;
ALTER TABLE "cafe_settings" ADD COLUMN "kotTemplate" JSONB;

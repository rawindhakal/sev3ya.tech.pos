-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('OPENING', 'PAY_IN', 'PAY_OUT');

-- CreateTable
CREATE TABLE "cafe_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "restaurantName" TEXT NOT NULL DEFAULT 'CakeZake',
    "address" TEXT,
    "phone" TEXT,
    "taxId" TEXT,
    "receiptHeader" TEXT,
    "receiptFooter" TEXT,
    "wifiPassword" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cafe_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_drawer_sessions" (
    "id" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingFloatCents" INTEGER NOT NULL DEFAULT 0,
    "openedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "countedCents" INTEGER,
    "expectedCents" INTEGER,
    "varianceCents" INTEGER,
    "notes" TEXT,

    CONSTRAINT "cash_drawer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_movements_sessionId_idx" ON "cash_movements"("sessionId");

-- CreateIndex
CREATE INDEX "payments_method_createdAt_idx" ON "payments"("method", "createdAt");

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cash_drawer_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

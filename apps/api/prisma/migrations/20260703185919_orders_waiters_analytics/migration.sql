-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "billedAt" TIMESTAMP(3),
ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "guestCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "seatedAt" TIMESTAMP(3),
ADD COLUMN     "waiterId" TEXT;

-- CreateTable
CREATE TABLE "waiters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waiters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");

-- CreateIndex
CREATE INDEX "orders_tableId_idx" ON "orders"("tableId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "waiters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

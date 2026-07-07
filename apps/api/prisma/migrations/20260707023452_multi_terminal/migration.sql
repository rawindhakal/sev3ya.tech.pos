-- AlterTable
ALTER TABLE "cash_drawer_sessions" ADD COLUMN     "terminalId" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "terminalId" TEXT;

-- CreateTable
CREATE TABLE "terminals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminals_pkey" PRIMARY KEY ("id")
);

-- CreateEnum
CREATE TYPE "PrepStation" AS ENUM ('KITCHEN', 'BAR', 'BILLING');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "creditBalanceCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "station" "PrepStation" NOT NULL DEFAULT 'BILLING';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "station" "PrepStation" NOT NULL DEFAULT 'BILLING';

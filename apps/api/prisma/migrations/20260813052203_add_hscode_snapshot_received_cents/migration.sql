-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "hsCode" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "hsCodeSnapshot" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "receivedCents" INTEGER;
